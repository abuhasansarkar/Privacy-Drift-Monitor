import type { SVGProps } from "react";
import { cn } from "@/lib/cn";

/**
 * ICON SET — §11.4.
 *
 * Hand-authored rather than a dependency, because the set is small and every
 * icon here is load-bearing: §11.6 forbids conveying severity by colour alone,
 * so these ship *with* the label in every severity and status component.
 *
 * All icons are 16×16 on a stroke grid, inherit `currentColor`, and are
 * `aria-hidden` — the adjacent text is the accessible name. An icon used
 * without visible text must be given a label by its caller.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, className, ...props }: IconProps) {
  /*
   * `cn()` joins, it does not RESOLVE conflicts (no tailwind-merge here — see
   * lib/cn.ts). So emitting the default `size-4` alongside a caller's
   * `size-3.5` would leave Tailwind's stylesheet order to pick the winner,
   * which is not something a component should leave to chance. The default is
   * therefore applied only when the caller sets no size of its own.
   *
   * `shrink-0` is always merged in: these icons sit in flex rows next to text,
   * and a shrinkable icon squashes into an ellipse when the row runs out of
   * space. Spreading `props` over a fixed className used to drop it.
   */
  const sized = className?.includes("size-");
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn(!sized && "size-4", "shrink-0", className)}
      {...props}
    >
      {children}
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 1.8l5 1.9v4c0 3.1-2.1 5.4-5 6.4-2.9-1-5-3.3-5-6.4v-4z" />
    </Icon>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </Icon>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="6" cy="5.5" r="2.4" />
      <path d="M1.8 13.4c.4-2.2 2.1-3.6 4.2-3.6s3.8 1.4 4.2 3.6" />
      <path d="M10.6 3.4a2.4 2.4 0 0 1 0 4.2M12 10c1.2.5 2 1.6 2.3 3" />
    </Icon>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="6.2" />
      <ellipse cx="8" cy="8" rx="2.7" ry="6.2" />
      <path d="M2 8h12" />
    </Icon>
  );
}

/** Paired with LOW / MEDIUM severity and with neutral information. */
export function AlertCircleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 4.8v3.6" />
      <circle cx="8" cy="11" r=".4" fill="currentColor" />
    </Icon>
  );
}

/** Paired with HIGH severity and with the PARTIAL scan outcome. */
export function AlertTriangleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2.4 14.6 13.4H1.4z" />
      <path d="M8 6.6v3" />
      <circle cx="8" cy="11.4" r=".4" fill="currentColor" />
    </Icon>
  );
}

/** Paired with CRITICAL severity. */
export function ShieldAlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 1.8l5 1.9v4c0 3.1-2.1 5.4-5 6.4-2.9-1-5-3.3-5-6.4v-4z" />
      <path d="M8 5.4v3" />
      <circle cx="8" cy="10.6" r=".4" fill="currentColor" />
    </Icon>
  );
}

export function DocIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.5 1.8H4.2a1 1 0 0 0-1 1v10.4a1 1 0 0 0 1 1h7.6a1 1 0 0 0 1-1V5.1z" />
      <path d="M9.5 1.8v3.3h3.3M5.6 8.4h4.8M5.6 11h3.2" />
    </Icon>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 4.5h12M2 8h12M2 11.5h12" />
      <circle cx="10.5" cy="4.5" r="1.6" className="fill-background" />
      <circle cx="5.5" cy="8" r="1.6" className="fill-background" />
      <circle cx="9" cy="11.5" r="1.6" className="fill-background" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7" cy="7" r="4.4" />
      <path d="m10.3 10.3 3.4 3.4" />
    </Icon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2a3.9 3.9 0 0 0-3.9 3.9v2.6L2.8 10.6h10.4l-1.3-2.1V5.9A3.9 3.9 0 0 0 8 2z" />
      <path d="M6.7 13a1.4 1.4 0 0 0 2.6 0" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon strokeWidth="2" {...props}>
      <path d="m3.2 8.6 3 3 6.6-7" />
    </Icon>
  );
}

export function XIcon(props: IconProps) {
  return (
    <Icon strokeWidth="1.8" {...props}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 3.6 4.4 4.4L6 12.4" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 4.6V8l2.3 1.6" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon strokeWidth="1.8" {...props}>
      <path d="M8 3.2v9.6M3.2 8h9.6" />
    </Icon>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 5.5a1 1 0 0 1 1-1h2l1-1.7h4l1 1.7h2a1 1 0 0 1 1 1v6.7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
      <circle cx="8" cy="8.5" r="2.4" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon strokeWidth="1.8" {...props}>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
    </Icon>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.4v1.5M8 13.1v1.5M2.5 8H1M15 8h-1.5M4.1 4.1 3 3M13 13l-1.1-1.1M11.9 4.1 13 3M3 13l1.1-1.1" />
    </Icon>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.8 5.8 0 1 0 6.8 6.8z" />
    </Icon>
  );
}

/** The empty-state mark: concentric sweep, the product's own metaphor. */
export function RadarIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className="size-12"
      {...props}
    >
      <circle cx="24" cy="24" r="20" opacity=".25" />
      <circle cx="24" cy="24" r="13" opacity=".45" />
      <circle cx="24" cy="24" r="6" opacity=".7" />
      <path d="M24 24 39 12" />
      <circle cx="24" cy="24" r="1.6" fill="currentColor" />
      <circle cx="33" cy="15" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Drift — a signal line, not a warning triangle: change, not alarm. */
export function ActivityIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M1.5 8h3l2-5 3 10 2-5h3" />
    </Icon>
  );
}
