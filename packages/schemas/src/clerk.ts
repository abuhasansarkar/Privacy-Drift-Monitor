import { z } from "zod";

/**
 * CLERK WEBHOOK PAYLOADS — the slices we actually consume.
 *
 * `verifyWebhook()` authenticates the payload (Svix signature); these schemas
 * validate its SHAPE before any business logic runs, per the repo rule that
 * every input crossing an API boundary is Zod-validated. They deliberately
 * describe only the fields the sync handler reads — Clerk adds fields freely,
 * and `z.object` strips unknown keys rather than failing on them.
 *
 * Field names are snake_case because that is Clerk's wire format.
 */

export const clerkEmailAddress = z.object({
  id: z.string(),
  email_address: z.string(),
});

export const clerkUserData = z.object({
  id: z.string(),
  email_addresses: z.array(clerkEmailAddress).default([]),
  primary_email_address_id: z.string().nullish(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  image_url: z.string().nullish(),
});
export type ClerkUserData = z.infer<typeof clerkUserData>;

/** `user.deleted` / `organization.deleted` carry a DeletedObject, id optional. */
export const clerkDeletedData = z.object({
  id: z.string().nullish(),
});
export type ClerkDeletedData = z.infer<typeof clerkDeletedData>;

export const clerkOrganizationData = z.object({
  id: z.string(),
  name: z.string(),
  /** Clerk generates one in practice, but the API types allow its absence. */
  slug: z.string().nullish(),
  /** Clerk user id of the org creator — becomes the OWNER membership. */
  created_by: z.string().nullish(),
});
export type ClerkOrganizationData = z.infer<typeof clerkOrganizationData>;

export const clerkMembershipData = z.object({
  id: z.string(),
  /** e.g. "org:admin", "org:member". Mapped to AgencyRole by the handler. */
  role: z.string(),
  organization: clerkOrganizationData,
  public_user_data: z.object({
    user_id: z.string(),
    /** The identifier is the primary email for email/password + OAuth signups. */
    identifier: z.string().nullish(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    image_url: z.string().nullish(),
  }),
});
export type ClerkMembershipData = z.infer<typeof clerkMembershipData>;

/** Resolves the primary email, falling back to the first address on file. */
export function primaryEmail(user: ClerkUserData): string | null {
  const primary = user.email_addresses.find(
    (e) => e.id === user.primary_email_address_id,
  );
  return primary?.email_address ?? user.email_addresses[0]?.email_address ?? null;
}
