/*
 * ⚠️ EXPLICIT `React` IMPORT, even though the automatic JSX runtime does not
 * need one. These templates are transformed by THREE different toolchains —
 * Turbopack for the app, esbuild via tsx for the worker, and tsc for the
 * typecheck — and they do not agree on which runtime to use for a file in
 * `packages/`. The worker crashed at render time with "React is not defined"
 * on a file the typecheck was perfectly happy with. This import is correct
 * under both runtimes and costs nothing under the automatic one.
 */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReportDocument } from "./types";
import { ReportDocumentView } from "./templates/document";

/**
 * REPORT HTML RENDERER — PLAN.md Part VI §6.8.
 *
 * ⚠️ `renderToStaticMarkup`, NOT `renderToString`. A PDF has no hydration and
 * no client runtime; the extra `data-reactroot` markers and comment nodes are
 * pure weight in a document Chromium is about to rasterise.
 *
 * ⚠️ SYNCHRONOUS AND PURE. Everything the templates need is already in
 * `document`. If this ever needs to be async, something has started fetching
 * inside a template, which is the failure §6.9 warns about.
 */
export function renderReportHtml(document: ReportDocument): string {
  return `<!doctype html>${renderToStaticMarkup(
    <ReportDocumentView document={document} />,
  )}`;
}

export { ReportDocumentView };
