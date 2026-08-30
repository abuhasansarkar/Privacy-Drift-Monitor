"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircleIcon } from "@/components/ui/icons";
import { MutedBadge, StatusBadge } from "@/components/ui/severity-badge";
import {
  importWebsiteCsv,
  previewWebsiteCsv,
  type ImportResult,
} from "@/server/actions/csv-import";
import type { ImportPreview, RowStatus } from "@/server/services/csv-import";

/**
 * CSV IMPORT — UI_DESIGN_PROMPTS §5.5, Phase 1 task 1.6.
 *
 * ⚠️ THE FILE IS READ IN THE BROWSER AND SENT AS TEXT. No upload endpoint, no
 * temporary storage: the content goes straight to a Server Action that parses
 * it and returns a preview. A file that never lands on disk is a file that
 * cannot be left there.
 *
 * ⚠️ NOTHING IS WRITTEN UNTIL THE USER CONFIRMS THE PREVIEW, and the import
 * re-parses the text server-side rather than trusting the preview it rendered.
 */

const TEMPLATE = "url,client,label\nhttps://www.example.com,Acme Ltd,Main site\n";

const STATUS_TONE: Record<RowStatus, "success" | "warning" | "muted"> = {
  ready: "success",
  "client-new": "warning",
  duplicate: "muted",
  invalid: "warning",
};

const STATUS_LABEL: Record<RowStatus, string> = {
  ready: t("import.statusReady"),
  "client-new": t("import.statusClientNew"),
  duplicate: t("import.statusDuplicate"),
  invalid: t("import.statusInvalid"),
};

export function CsvImport() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onFile(file: File) {
    setError(null);
    setResult(null);
    const text = await file.text();
    setCsv(text);
    start(async () => {
      const outcome = await previewWebsiteCsv({ csv: text });
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      setPreview(outcome.data);
    });
  }

  function runImport() {
    setError(null);
    start(async () => {
      const outcome = await importWebsiteCsv({ csv });
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      setResult(outcome.data);
      setPreview(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-6">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
          <span className="text-body font-medium">{t("import.dropZone")}</span>
          <span className="text-small text-muted-foreground">
            {t("import.dropHint")}
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
        </label>

        <a
          // A data: URL rather than a route — the template is four words and a
          // header, and an endpoint for it is a route to keep working forever.
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
          download="websites-template.csv"
          className="mt-3 inline-block text-small text-primary underline-offset-2 hover:underline"
        >
          {t("import.downloadTemplate")}
        </a>
      </Card>

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-small text-danger">
          <AlertCircleIcon className="mt-0.5" />
          {error}
        </p>
      ) : null}

      {result ? (
        <Card className="p-4">
          <p className="text-small">
            {result.created} {t("import.imported")} · {result.skipped}{" "}
            {t("import.skippedRows")} · {result.failed} {t("import.failedRows")}
          </p>
        </Card>
      ) : null}

      {preview ? (
        preview.rows.length === 0 ? (
          <Card className="p-4">
            <p className="text-small text-muted-foreground">{t("import.noRows")}</p>
          </Card>
        ) : (
          <Card>
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <MutedBadge>
                {preview.ready} {t("import.ready")}
              </MutedBadge>
              {preview.warnings > 0 ? (
                <StatusBadge
                  tone="warning"
                  label={`${preview.warnings} ${t("import.warnings")}`}
                />
              ) : null}
              {preview.errors > 0 ? (
                <StatusBadge
                  tone="warning"
                  label={`${preview.errors} ${t("import.errors")}`}
                />
              ) : null}
              <Button
                variant="primary"
                size="sm"
                className="ms-auto"
                disabled={pending || preview.ready === 0}
                onClick={runImport}
              >
                {pending
                  ? t("import.importing")
                  : `${t("import.importButton")} ${preview.ready}`}
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-small">
                <thead>
                  <tr>
                    {[
                      t("import.columnLine"),
                      t("import.columnUrl"),
                      t("import.columnClient"),
                      t("import.columnStatus"),
                    ].map((label) => (
                      <th
                        key={label}
                        scope="col"
                        className="px-4 py-2.5 text-start text-caption font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.line} className="border-t border-border">
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                        {row.line}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-mono">
                          {row.normalizedUrl ?? row.rawUrl}
                        </span>
                        {row.message ? (
                          <span className="block text-caption text-muted-foreground">
                            {row.message}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {row.clientName ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge
                          tone={STATUS_TONE[row.status]}
                          label={STATUS_LABEL[row.status]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      ) : null}
    </div>
  );
}
