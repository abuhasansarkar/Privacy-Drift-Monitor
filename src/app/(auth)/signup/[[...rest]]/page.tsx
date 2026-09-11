import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string; fallback_redirect_url?: string; force_redirect_url?: string }>;
}) {
  const params = await searchParams;
  const target = params.force_redirect_url ?? params.fallback_redirect_url ?? params.redirect_url;
  return target ? <SignUp forceRedirectUrl={target} /> : <SignUp fallbackRedirectUrl="/app" />;
}
