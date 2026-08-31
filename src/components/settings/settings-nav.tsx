"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@pdm/shared/copy";
import { cn } from "@/lib/cn";

/**
 * ⚠️ Horizontal below `lg`, vertical above. A vertical rail on a phone eats a
 * third of the width for navigation on a page whose content is a table.
 */
const SECTIONS = [
  { href: "/app/settings", label: t("settings.general") },
  { href: "/app/settings/branding", label: t("branding.title") },
  { href: "/app/settings/notifications", label: t("notificationSettings.title") },
  { href: "/app/settings/ignored", label: t("ignored.title") },
  { href: "/app/settings/audit", label: t("audit.title") },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("settings.title")}
      className="shrink-0 lg:w-52 max-lg:-mx-1 max-lg:overflow-x-auto max-lg:px-1"
    >
      <ul className="flex gap-1 lg:flex-col">
        {SECTIONS.map((section) => {
          const active = pathname === section.href;
          return (
            <li key={section.href} className="max-lg:shrink-0">
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block whitespace-nowrap rounded-md px-3 py-2 text-small transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
