import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Optional catch-all `[[...rest]]` is required: Clerk renders its own
 * sub-routes underneath this path (email verification, SSO callback,
 * two-factor). Without it those steps 404.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string; fallback_redirect_url?: string; force_redirect_url?: string }>;
}) {
  const params = await searchParams;
  const target = params.force_redirect_url ?? params.fallback_redirect_url ?? params.redirect_url;
  return target ? <SignIn forceRedirectUrl={target} /> : <SignIn fallbackRedirectUrl="/app" />;
}
