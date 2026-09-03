/**
 * PROVISIONS THE E2E ACCOUNT — PLAN.md Phase 7 task 7.7.
 *
 * Creates (idempotently) a Clerk user, a Clerk organization and the membership
 * between them, so `e2e/auth.setup.ts` has something to sign in as.
 *
 * ⚠️ THE ADDRESS CONTAINS `+clerk_test`, WHICH IS LOAD-BEARING. Clerk accepts
 * the fixed verification code `424242` for such addresses on a development
 * instance; any other address needs a real mailbox and the suite cannot run
 * unattended.
 *
 * ⚠️ IT DOES NOT CREATE THE `Agency` ROW. That is the app's job:
 * `requireAgencyContext` reconciles a membership straight from Clerk's Backend
 * API when the webhook has not landed — which locally it never can, because
 * Clerk cannot reach localhost. Provisioning the row here would bypass, and
 * therefore stop testing, exactly that path.
 *
 * ⚠️ IT REFUSES TO RUN AGAINST A LIVE CLERK INSTANCE. A test account with a
 * known password in a production identity provider is an account somebody will
 * eventually sign in to.
 *
 * Run: npx tsx scripts/e2e-account.ts
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

/*
 * ⚠️ `.env` IS LOADED HERE, THE WAY `worker/src/index.ts` DOES IT. Without
 * this, `npm run e2e:account` exits with "CLERK_SECRET_KEY is required" even
 * on a machine where `.env` holds a perfectly good key — the script is run by
 * `tsx`, which does not read `.env` on its own. CI never noticed because it
 * injects secrets as real environment variables; a developer following the
 * README hit it on the first command.
 */
for (const envPath of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../.env")]) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, quiet: true });
    break;
  }
}

import { createClerkClient } from "@clerk/backend";

const EMAIL = process.env.E2E_EMAIL ?? "pdm.e2e+clerk_test@example.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "PdmE2E!verify-2026";
const ORG_NAME = "PDM Verification Agency";

async function main() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is required");
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error(
      "refusing to provision an E2E account against a live Clerk instance — this creates a real user with a known password",
    );
  }

  const clerk = createClerkClient({ secretKey });

  const existing = await clerk.users.getUserList({ emailAddress: [EMAIL] });
  let user = existing.data[0];
  if (!user) {
    user = await clerk.users.createUser({
      emailAddress: [EMAIL],
      password: PASSWORD,
      firstName: "Verification",
      lastName: "Operator",
      skipPasswordChecks: true,
    });
    console.log(`created user ${user.id}`);
  } else {
    // Idempotent: re-assert the password so a rotated one does not fail the run.
    await clerk.users.updateUser(user.id, { password: PASSWORD, skipPasswordChecks: true });
    console.log(`reused user ${user.id}`);
  }

  const orgs = await clerk.organizations.getOrganizationList({ limit: 100 });
  let org = orgs.data.find((candidate) => candidate.name === ORG_NAME);
  if (!org) {
    // ⚠️ NO SLUG. Some Clerk instances have organization slugs disabled, and
    // passing one then fails with `organization_slugs_disabled`.
    org = await clerk.organizations.createOrganization({ name: ORG_NAME, createdBy: user.id });
    console.log(`created organization ${org.id}`);
  } else {
    try {
      await clerk.organizations.createOrganizationMembership({
        organizationId: org.id,
        userId: user.id,
        role: "org:admin",
      });
    } catch {
      // Already a member.
    }
    console.log(`reused organization ${org.id}`);
  }

  console.log(`\nE2E_EMAIL=${EMAIL}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
