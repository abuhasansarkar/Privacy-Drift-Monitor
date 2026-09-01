"use client";

import type { ReactNode } from "react";
import { t } from "@pdm/shared/copy";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { BulkSelection } from "./bulk-selection";

/**
 * WEBSITES TABLE CLIENT WRAPPER — §3.6.
 *
 * Encapsulates the bulk selection state and coordinates it with the DataList
 * component entirely on the client side, avoiding invalid RSC function props.
 */
export function WebsitesTable({
  columns,
  rows,
  ids,
  canUpdate,
  canArchive,
  canScan,
  clients,
  groups,
  footer,
}: {
  columns: Column[];
  rows: Row[];
  ids: string[];
  canUpdate: boolean;
  canArchive: boolean;
  canScan: boolean;
  clients: readonly { id: string; name: string }[];
  groups: readonly { id: string; name: string }[];
  footer?: ReactNode;
}) {
  return (
    <BulkSelection
      ids={ids}
      canUpdate={canUpdate}
      canArchive={canArchive}
      canScan={canScan}
      clients={clients}
      groups={groups}
    >
      {(selection) => (
        <DataList
          caption={t("websites.title")}
          columns={columns}
          rows={rows}
          selection={selection}
          footer={footer}
        />
      )}
    </BulkSelection>
  );
}
