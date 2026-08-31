"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { t } from "@pdm/shared/copy";
import { signOutOfPortal } from "@/server/actions/portal";

/**
 * ⚠️ A BUTTON RUNNING A SERVER ACTION, NOT A LINK. Signing out deletes the
 * session row, which is a mutation — a GET that destroys state is followed by
 * link prefetchers and mail scanners, and a client would find themselves logged
 * out by their own inbox.
 */
export function PortalSignOut() {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await signOutOfPortal();
          router.push("/portal/login");
        })
      }
      className="text-[14px] text-muted-foreground hover:text-foreground disabled:opacity-50"
    >
      {t("portal.signOut")}
    </button>
  );
}
