"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { markNotificationsRead } from "@/server/actions/notifications";

/**
 * MARK-AS-READ CONTROLS — §3.11.
 *
 * ⚠️ `useTransition`, NOT a local `loading` boolean. The action revalidates the
 * page and the shell (the bell count lives there), and a manual flag would
 * clear the moment the promise resolved — before the re-render lands, so the
 * button flickers back to idle while the list is still stale.
 */
export function MarkAllReadButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          await markNotificationsRead({ ids: [], all: true });
          router.refresh();
        })
      }
    >
      {pending ? t("notifications.marking") : t("notifications.markAllRead")}
    </Button>
  );
}

/**
 * Marks one row read as it is followed.
 *
 * ⚠️ The navigation is a REAL LINK rendered by the caller; this only fires the
 * side effect. Turning the row into a button with a router push would break
 * middle-click, cmd-click and "copy link address" on the one surface whose
 * entire purpose is deep-linking somewhere else.
 */
export function MarkReadOnVisit({ id }: { id: string }) {
  const [, start] = useTransition();
  return (
    <button
      type="button"
      aria-label={t("notifications.markAllRead")}
      className="ms-auto size-2 shrink-0 rounded-full bg-primary"
      onClick={() => start(() => markNotificationsRead({ ids: [id], all: false }).then(() => undefined))}
    />
  );
}
