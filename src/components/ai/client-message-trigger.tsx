"use client";

import { useState } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { SparkleIcon } from "@/components/ui/icons";
import { ClientMessageDialog } from "@/components/ai/client-message-dialog";

/**
 * The button that opens the client-message draft dialog — §8.5 feature 4,
 * Phase 5 task 5.7.
 *
 * ⚠️ A SEPARATE ISLAND FROM THE DIALOG, so the (large) dialog is not mounted on
 * every issue page that nobody opens it on. The dialog itself is only rendered
 * once `open` is true.
 */
export function ClientMessageTrigger({
  websiteId,
  issueIds,
}: {
  websiteId: string;
  issueIds: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <SparkleIcon />
        {t("ai.clientMessage")}
      </Button>
      {open ? (
        <ClientMessageDialog
          websiteId={websiteId}
          issueIds={issueIds}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
