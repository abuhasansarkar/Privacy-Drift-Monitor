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

  /*
   * ⚠️ NO WIDTH CAP HERE. This layout wraps the AppShell, which already owns
   * the page padding — a `max-w-6xl` here capped every screen at 1152px and
   * left a dead gutter on a wide monitor, which is where an agency actually
   * works. Individual pages set their own measure: dense tables run full
   * width, prose and forms stay readable.
   */
  return <div className="flex w-full flex-1 flex-col">{children}</div>;
}
