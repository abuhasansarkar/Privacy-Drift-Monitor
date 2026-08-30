import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { Prisma, unsafeGlobalClient } from "@pdm/database";
import { childLogger } from "@pdm/shared/logger";
import {
  clerkDeletedData,
  clerkMembershipData,
  clerkOrganizationData,
  clerkUserData,
  primaryEmail,
  type ClerkOrganizationData,
  type ClerkUserData,
} from "@pdm/schemas/clerk";
import { fallbackSlug, initialRoleFor } from "@/server/auth/clerk-sync";

/**
 * CLERK ↔ DATABASE SYNC — PLAN.md Part VI §6.1, Phase 0 task 0.6, feature 01.
 *
 * Clerk is the identity authority (users, organizations, coarse membership);
 * this handler mirrors it into `User`, `Agency` and `AgencyMember` so that
 * `requireAgencyContext()` can resolve a tenant without calling Clerk on every
 * request.
 *
 * DIVISION OF AUTHORITY — load-bearing, not stylistic:
 *   - Clerk owns: existence of users/orgs, email, profile fields, WHO is a member.
 *   - The DATABASE owns: the fine-grained `AgencyRole`. Clerk only knows
 *     org:admin / org:member; our matrix has five roles (§6.2), managed on the
 *     Team page. Membership UPDATES therefore never overwrite an existing row's
 *     role — only creation assigns an initial one.
 *
 * Ordering & retries: Clerk retries non-2xx responses with backoff and events
 * can arrive out of order. Every write here is an upsert keyed on the Clerk id,
 * so replays are idempotent; where an event depends on a row another event
 * creates (membership before its user), we return 503 so Clerk redelivers
 * after the missing event has landed.
 *
 * Auth posture: this route is PUBLIC in `src/proxy.ts` (`/api/webhooks(.*)`) —
 * Clerk posts here with no session. Authentication is the Svix signature check
 * in `verifyWebhook()`, nothing else. Verification failure is a 400 and is
 * never retried by Clerk.
 */

const db = unsafeGlobalClient(
  // Justification (required in review): identity sync is platform-level by
  // definition — the Agency row being written is the thing a tenant scope
  // would have to be derived FROM. No user request ever reaches this handler.
  "clerk webhook sync creates/updates the tenancy rows themselves",
);

const OWNER = "OWNER" as const;

async function upsertUser(data: ClerkUserData, log: ReturnType<typeof childLogger>) {
  const email = primaryEmail(data);
  if (!email) {
    // Product-wise every signup carries an email (§6.1); a user without one
    // cannot satisfy the schema. Loud log, 200 — retrying cannot add an email.
    log.error({ clerkUserId: data.id }, "clerk user has no email address; not synced");
    return;
  }

  await db.user.upsert({
    where: { clerkUserId: data.id },
    create: {
      clerkUserId: data.id,
      email,
      firstName: data.first_name ?? null,
      lastName: data.last_name ?? null,
      avatarUrl: data.image_url ?? null,
    },
    update: {
      email,
      firstName: data.first_name ?? null,
      lastName: data.last_name ?? null,
      avatarUrl: data.image_url ?? null,
    },
  });
}

async function upsertAgency(data: ClerkOrganizationData) {
  return db.agency.upsert({
    where: { clerkOrgId: data.id },
    create: {
      clerkOrgId: data.id,
      name: data.name,
      slug: data.slug ?? fallbackSlug(data.id),
    },
    // A null slug on update means "Clerk sent none" — keep the one we have
    // rather than clobbering a working slug.
    update: { name: data.name, ...(data.slug ? { slug: data.slug } : {}) },
  });
}

export async function POST(req: Request) {
  let evt;
  try {
    // Reads CLERK_WEBHOOK_SIGNING_SECRET. A bad signature throws → 400, no retry.
    evt = await verifyWebhook(req);
  } catch {
    return Response.json({ error: "verification_failed" }, { status: 400 });
  }

  const log = childLogger({ requestId: crypto.randomUUID() }).child({
    event: evt.type,
  });

  try {
    switch (evt.type) {
      case "user.created":
      case "user.updated": {
        const parsed = clerkUserData.safeParse(evt.data);
        if (!parsed.success) {
          // Shape mismatch means OUR schema is stale — retrying cannot fix it,
          // so: loud error (the signal), 200 (no retry storm). Same pattern in
          // every case below.
          log.error({ issues: parsed.error.issues }, "clerk payload failed validation");
          break;
        }
        await upsertUser(parsed.data, log);
        break;
      }

      case "user.deleted": {
        const parsed = clerkDeletedData.safeParse(evt.data);
        if (!parsed.success) {
          log.error({ issues: parsed.error.issues }, "clerk payload failed validation");
          break;
        }
        if (!parsed.data.id) break;
        const user = await db.user.findUnique({
          where: { clerkUserId: parsed.data.id },
        });
        if (!user) break; // already gone — replay-safe
        // Access is revoked first and unconditionally.
        await db.agencyMember.deleteMany({ where: { userId: user.id } });
        try {
          await db.user.delete({ where: { id: user.id } });
        } catch {
          // A restricted FK (e.g. authored reports) keeps the row. That is the
          // correct outcome: access is already revoked, and audit history must
          // keep resolving to an author.
          log.warn(
            { userId: user.id },
            "user row kept: still referenced by history",
          );
        }
        break;
      }

      case "organization.created":
      case "organization.updated": {
        const parsed = clerkOrganizationData.safeParse(evt.data);
        if (!parsed.success) {
          log.error({ issues: parsed.error.issues }, "clerk payload failed validation");
          break;
        }
        const agency = await upsertAgency(parsed.data);

        // The org creator is the OWNER. If their user row exists, make it so —
        // including promoting a membership the org:admin event already created.
        if (evt.type === "organization.created" && parsed.data.created_by) {
          const creator = await db.user.findUnique({
            where: { clerkUserId: parsed.data.created_by },
          });
          if (creator) {
            await db.agencyMember.upsert({
              where: {
                agencyId_userId: { agencyId: agency.id, userId: creator.id },
              },
              create: { agencyId: agency.id, userId: creator.id, role: OWNER },
              update: { role: OWNER },
            });
          }
          // If the creator's user.created has not landed yet, the membership
          // handler's no-OWNER promotion below covers them on redelivery.
        }
        break;
      }

      case "organization.deleted": {
        const parsed = clerkDeletedData.safeParse(evt.data);
        if (!parsed.success) {
          log.error({ issues: parsed.error.issues }, "clerk payload failed validation");
          break;
        }
        if (!parsed.data.id) break;
        // Soft-cancel, never delete: scan history, evidence and reports are the
        // product, and retention is governed by §5.7, not by a webhook.
        await db.agency.updateMany({
          where: { clerkOrgId: parsed.data.id },
          data: { status: "CANCELLED", deletedAt: new Date() },
        });
        break;
      }

      case "organizationMembership.created":
      case "organizationMembership.updated": {
        const parsed = clerkMembershipData.safeParse(evt.data);
        if (!parsed.success) {
          log.error({ issues: parsed.error.issues }, "clerk payload failed validation");
          break;
        }
        const { organization, public_user_data: pud, role } = parsed.data;

        const agency = await upsertAgency(organization);

        let user = await db.user.findUnique({
          where: { clerkUserId: pud.user_id },
        });
        if (!user && pud.identifier) {
          // Membership arrived before user.created — the embedded snapshot is
          // enough to create the row; user.created will fill in the rest.
          user = await db.user.create({
            data: {
              clerkUserId: pud.user_id,
              email: pud.identifier,
              firstName: pud.first_name ?? null,
              lastName: pud.last_name ?? null,
              avatarUrl: pud.image_url ?? null,
            },
          });
        }
        if (!user) {
          // No row and no email to create one from. 503 → Clerk redelivers
          // after user.created has (almost certainly) landed.
          log.warn({ clerkUserId: pud.user_id }, "membership before user; asking for redelivery");
          return Response.json({ error: "user_not_synced_yet" }, { status: 503 });
        }

        // First admin of an owner-less agency is its creator (organization.created
        // may have arrived before the creator's user row existed). The mapping
        // is shared with the reconciliation path so the two cannot disagree.
        const hasOwner =
          (await db.agencyMember.count({
            where: { agencyId: agency.id, role: OWNER },
          })) > 0;

        await db.agencyMember.upsert({
          where: { agencyId_userId: { agencyId: agency.id, userId: user.id } },
          create: {
            agencyId: agency.id,
            userId: user.id,
            role: initialRoleFor(role, hasOwner),
          },
          // Deliberately role-less: the database is authoritative for the
          // five-role matrix once a membership exists. See the header note.
          update: { status: "ACTIVE" },
        });
        break;
      }

      case "organizationMembership.deleted": {
        const parsed = clerkMembershipData.safeParse(evt.data);
        if (!parsed.success) {
          log.error({ issues: parsed.error.issues }, "clerk payload failed validation");
          break;
        }
        const { organization, public_user_data: pud } = parsed.data;
        // deleteMany: zero matches is fine (replay-safe), and it spares two lookups.
        await db.agencyMember.deleteMany({
          where: {
            agency: { clerkOrgId: organization.id },
            user: { clerkUserId: pud.user_id },
          },
        });
        break;
      }

      default:
        // Session/email/billing events etc. — subscribed types are configured in
        // the Clerk dashboard; anything else is acknowledged and ignored.
        log.debug("unhandled clerk event type ignored");
    }

    return Response.json({ received: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // A unique collision (e.g. the email already belongs to a kept-for-audit
      // row) cannot be resolved by retrying — needs a human. Loud error, 200.
      log.error({ err: e, target: e.meta?.target }, "clerk sync unique conflict");
      return Response.json({ received: true, conflict: true });
    }
    // Anything else (db down, transient) → 500 so Clerk retries with backoff.
    log.error({ err: e }, "clerk sync failed");
    return Response.json({ error: "sync_failed" }, { status: 500 });
  }
}
