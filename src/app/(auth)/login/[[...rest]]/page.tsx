import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Optional catch-all `[[...rest]]` is required: Clerk renders its own
 * sub-routes underneath this path (email verification, SSO callback,
 * two-factor). Without it those steps 404.
 */
export default function LoginPage() {
  return <SignIn />;
}
