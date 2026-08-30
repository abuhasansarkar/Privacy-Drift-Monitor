import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { en } from "@pdm/shared/copy";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

/**
 * TYPOGRAPHY — PLAN.md Part XI §11.2.
 *
 * `next/font/google` downloads these at BUILD time and serves them from our own
 * origin, so no visitor IP ever reaches a font CDN — which is the actual
 * requirement (a privacy product leaking IPs to Google Fonts is indefensible).
 *
 * TODO(0.8): §11.2 specifies `next/font/local` with the .woff2 files vendored
 * into the repo. That removes the build-time network dependency entirely and is
 * the stricter reading. Vendoring the files needs a download step, so it is
 * deferred — but the CSS variable names below are already the final ones, so
 * the swap is a change to this file only.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
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
export default function RootLayout({ children }: LayoutProps<"/">) {
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
        <ThemeProvider>
          <ClerkProvider>{children}</ClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
