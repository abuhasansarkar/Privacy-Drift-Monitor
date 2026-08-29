import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getUserContext } from "@/server/auth/context";

/**
 * Server-side gate for the authenticated app.
 *
 * `proxy.ts` already blocks unauthenticated requests to these paths. This is
 * defence in depth — a layout check is cheap, and it means a future change to
 * the proxy matcher cannot silently expose the app.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getUserContext();
  if (!ctx) redirect("/login");

  return <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</div>;
}
