import type { ReactNode } from "react";

/**
 * PORTAL ROUTE GROUP — PLAN.md §3.1, §6.10.
 *
 * ⚠️ ITS OWN LAYOUT, WITH NO CLERK ANYWHERE IN THE TREE. §6.10: "Portal routes
 * live in their own route group with their own layout; `proxy.ts` explicitly
 * excludes them from Clerk, and Clerk helpers are not imported anywhere under
 * `(portal)`." That is what makes "portal access is unaffected by a Clerk
 * outage" an acceptance criterion we can actually meet.
 *
 * ⚠️ NO `ClerkProvider`, no `<Show>`, no `UserButton`. If you find yourself
 * needing one here, the answer is a portal-native equivalent.
 */
export default function PortalRouteGroupLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
