import Link from "next/link";
import { DISCLAIMER_SHORT } from "@pdm/shared/copy/terminology";
import { LEGAL_DOCUMENTS } from "@content/legal";
import { FOOTER_NAV } from "@content/marketing/nav";
import { Container } from "./section";

/**
 * MARKETING FOOTER — five columns plus the boundary statement.
 *
 * §1.11: the disclaimer appears on every public surface, and the footer is
 * where it lives — above the link columns, so it is read before the links
 * rather than scrolled past. Legal documents stay a single click away (§3.2
 * requires all four to be reachable).
 */
export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-card/50">
      <Container>
        <div className="grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Link href="/" className="font-semibold tracking-tight">
              Privacy Drift Monitor
            </Link>
            <p className="mt-3 max-w-sm text-small text-muted-foreground">
              Continuous privacy monitoring for client websites. Detect tracking
              and consent changes before they become client problems.
            </p>
            <Link
              href="/free-scanner"
              className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-4 text-small font-medium text-primary-foreground transition hover:opacity-90"
            >
              Run a free scan
            </Link>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              {DISCLAIMER_SHORT}
            </p>
          </div>

          {FOOTER_NAV.map((group) => (
            <nav key={group.label} aria-label={group.label}>
              <p className="text-caption font-semibold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-small text-muted-foreground transition hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border py-6">
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {LEGAL_DOCUMENTS.map((doc) => (
              <li key={doc.slug}>
                <Link
                  href={`/legal/${doc.slug}`}
                  className="text-xs text-muted-foreground transition hover:text-foreground"
                >
                  {doc.title}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Privacy Drift Monitor
          </p>
        </div>
      </Container>
    </footer>
  );
}
