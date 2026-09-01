import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import { ClerkProvider } from "@clerk/nextjs";
import { en } from "@pdm/shared/copy";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

/**
 * TYPOGRAPHY — PLAN.md Part XI §11.2.
 *
 * ⚠️ SELF-HOSTED FROM VENDORED FILES. §11.2 is explicit that this is a PRIVACY
 * REQUIREMENT, not a preference: "a privacy product that ships its users' IPs
 * to a font CDN is indefensible."
 *
 * This previously used `next/font/google`, which is *nearly* right — it
 * downloads the files at build time and serves them from our own origin, so no
 * visitor IP reaches Google either way. The reason for the swap is the
 * remaining edge: a build-time network dependency means our build can fail, or
 * silently fetch a changed file, because of a third party. `next/font/local`
 * reads the two `.woff2` files committed beside this one, so the fonts are
 * pinned bytes under review like any other dependency.
 *
 * Both faces are OFL-licensed and redistributable.
 */

/**
 * Inter Variable — one file covering the whole 100–900 axis.
 *
 * ⚠️ `declarations: [{ prop: "font-named-instance", value: "Regular" }]` is not
 * needed here, but the WEIGHT RANGE is: without it the browser assumes a single
 * static weight and synthesises bold by smearing the glyphs, which looks
 * subtly wrong everywhere and is easy to miss.
 */
const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
  // The stack a reader sees during the swap, and forever if the file 404s.
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

/**
 * JetBrains Mono — a single 400 weight, deliberately.
 *
 * Mono is used for domains, rule ids, selectors and evidence rows, and nothing
 * in the app renders those bold (checked: no `font-mono` usage pairs with a
 * weight utility). Shipping the variable axis would add ~250 KB for a range
 * nothing selects. Add weights here if that changes.
 */
const jetbrainsMono = localFont({
  src: "./fonts/JetBrainsMono-Regular.woff2",
  variable: "--font-jetbrains-mono",
  weight: "400",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

export const metadata: Metadata = {
  title: {
    default: en.app.name,
    template: `%s · ${en.app.name}`,
  },
  description:
    "Automated privacy and consent monitoring for web agencies. Detect tracking and consent changes across every client website.",
};

/**
 * ROOT LAYOUT — deliberately minimal.
 *
 * §3.1 requires four distinct layouts with four distinct auth postures, kept
 * physically separate by route group, "so an unauthenticated page can never
 * accidentally inherit an authenticated shell". Chrome therefore belongs in the
 * GROUP layouts — (marketing), (app), (admin), (portal) — never here.
 *
 * `SiteHeader` used to render here, which put the marketing header on /app,
 * /admin and /portal. It now renders from the public pages that own it. The
 * remaining half of task 0.11 is moving `page.tsx` into `(marketing)/`, which
 * needs a file move (`git mv`) — creating the new file while the old one exists
 * is a duplicate-route build error.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  /*
   * ⚠️ THE NONCE COMES FROM THE REQUEST HEADER `src/proxy.ts` SETS, and reading
   * it makes this layout dynamic — which is why the STATIC marketing pages get
   * a nonce-free policy (see the long note in `proxy.ts`). On those routes the
   * proxy sets no `x-nonce`, `headers()` returns null, and no attribute is
   * rendered. On every dynamic route it is present and the inline theme script
   * carries it.
   *
   * `headers()` is a Promise in Next 16 (AGENTS.md).
   */
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/* ClerkProvider goes INSIDE <body>, not wrapping <html>. */}
      <body className="min-h-full flex flex-col">
        {/*
          No <main> here. Each route group owns its own landmarks: the root
          layout cannot know whether a surface needs header/main/footer (public)
          or shell/sidebar/main (app), and a root <main> would swallow a page's
          own <footer> inside it, which is invalid and breaks §11.6's landmark
          navigation.
        */}
        {/*
          ThemeProvider applies the stored `.dark` class before hydration (its
          inline script) and exposes useTheme() for the §3.3 user-menu toggle.
        */}
        <ThemeProvider nonce={nonce}>
          <ClerkProvider>{children}</ClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
