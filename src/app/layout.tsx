import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Privacy Drift Monitor",
    template: "%s · Privacy Drift Monitor",
  },
  description:
    "Automated privacy and consent monitoring for web agencies. Detect tracking and consent changes across every client website.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* ClerkProvider goes INSIDE <body>, not wrapping <html>. */}
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          <SiteHeader />
          <main className="flex flex-1 flex-col">{children}</main>
        </ClerkProvider>
      </body>
    </html>
  );
}
