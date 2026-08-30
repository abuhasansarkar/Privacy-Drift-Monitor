"use client";

import { useState } from "react";
import type { UrlValidationResult } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import {
  AlertCircleIcon,
  CheckIcon,
  GlobeIcon,
} from "@/components/ui/icons";

/**
 * ADD WEBSITE WIZARD — §3.6, Phase 1 tasks 1.7 + 1.8.
 *
 * ⚠️ THE VALIDATION HERE IS A CONVENIENCE, NOT A CONTROL. The real checks are
 * server-side: `normalizeWebsiteUrl()` for the canonical form and the
 * registrable domain, then `assertSafeUrl()` — the SSRF boundary — before any
 * navigation and on every redirect hop (§10.3). This component only renders
 * what `POST /api/websites/validate` returns.
 *
 * ⚠️ EVERY FAILURE CODE GETS ITS OWN MESSAGE (M2), except that URL_NOT_ALLOWED
 * is deliberately vague — "We can't monitor this address." Naming which check
 * failed would turn the guard into a network probe an attacker can read
 * (§10.3). The real reason goes to the security log, never to this screen.
 */

const STEPS = [
  t("addWebsite.stepUrl"),
  t("addWebsite.stepValidation"),
  t("addWebsite.stepSchedule"),
  t("addWebsite.stepConfirm"),
];

const ERROR_COPY: Record<UrlValidationResult["code"], string> = {
  OK: "",
  INVALID_URL: t("urlError.invalid"),
  UNSUPPORTED_SCHEME: t("urlError.unsupportedScheme"),
  URL_HAS_CREDENTIALS: t("urlError.hasCredentials"),
  NO_REGISTRABLE_DOMAIN: t("urlError.noRegistrableDomain"),
  URL_NOT_ALLOWED: t("urlError.notAllowed"),
  UNREACHABLE: t("urlError.unreachable"),
  DUPLICATE: t("urlError.duplicate"),
  ENTITLEMENT_EXCEEDED: t("urlError.entitlementExceeded"),
};

type State =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "done"; result: UrlValidationResult };

export function AddWebsiteWizard() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });

  const result = state.phase === "done" ? state.result : null;
  const step = result?.ok ? 1 : 0;

  async function validate() {
    setState({ phase: "checking" });
    const response = await fetch("/api/websites/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    // A non-2xx is still an answer about the URL; the route returns the same
    // envelope either way so there is one rendering path, not two.
    setState({ phase: "done", result: (await response.json()) as UrlValidationResult });
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <ol className="flex flex-wrap gap-x-1 border-b border-border px-1">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 border-b-2 px-3 py-3 text-caption font-medium",
              index === step
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "grid size-4.5 place-items-center rounded-full text-[10px] font-semibold",
                index < step
                  ? "bg-success-muted text-success"
                  : index === step
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {index < step ? <CheckIcon className="size-3" /> : index + 1}
            </span>
            {/* Labels collapse below sm — the numbered dots still carry position. */}
            <span className="max-sm:sr-only">{label}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-4 py-5">
        <div>
          <label htmlFor="website-url" className="mb-1.5 block text-caption font-semibold">
            {t("addWebsite.urlLabel")}
          </label>
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 max-sm:flex-col max-sm:items-stretch">
            <div className="flex min-w-0 flex-1 items-center gap-2 py-2">
              <GlobeIcon className="text-muted-foreground" />
              <input
                id="website-url"
                type="url"
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setState({ phase: "idle" });
                }}
                placeholder={t("addWebsite.urlPlaceholder")}
                aria-invalid={result !== null && !result.ok}
                aria-describedby={result && !result.ok ? "website-url-error" : undefined}
                className="min-w-0 flex-1 bg-transparent font-mono text-mono outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={validate}
              disabled={url.trim() === "" || state.phase === "checking"}
              className="max-sm:mb-2"
            >
              {state.phase === "checking"
                ? t("addWebsite.checking")
                : t("addWebsite.validate")}
            </Button>
          </div>

          {result && !result.ok ? (
            <p
              id="website-url-error"
              role="alert"
              className="mt-2 flex items-start gap-2 text-small text-danger"
            >
              <AlertCircleIcon className="mt-0.5 shrink-0" />
              {ERROR_COPY[result.code]}
            </p>
          ) : null}
        </div>

        {result?.ok ? <ValidationChecks result={result} /> : null}
      </div>
    </div>
  );
}

/**
 * Outcome vocabulary only: Detected / Not detected / Could not be determined.
 * Never pass/fail, never a compliance judgement (§1.12).
 */
function ValidationChecks({ result }: { result: UrlValidationResult }) {
  return (
    <>
      <dl className="flex flex-col">
        <Check
          label={t("addWebsite.checkAddress")}
          detail={result.normalizedUrl ?? ""}
          state="detected"
        />
        {result.redirectsTo ? (
          <Check
            label={t("addWebsite.checkConnection")}
            detail={result.redirectsTo}
            state="undetermined"
          />
        ) : null}
      </dl>

      <p className="flex gap-2 rounded-md border border-border bg-severity-info-bg p-3 text-caption text-severity-info">
        <AlertCircleIcon className="mt-0.5 shrink-0" />
        <span>
          <strong className="font-semibold">{t("addWebsite.wwwNoticeTitle")}</strong>{" "}
          {t("addWebsite.wwwNoticeBody")}
        </span>
      </p>
    </>
  );
}

function Check({
  label,
  detail,
  state,
}: {
  label: string;
  detail: string;
  state: "detected" | "undetermined";
}) {
  return (
    <div className="flex items-start gap-2.5 border-b border-border py-2.5 last:border-b-0 max-sm:flex-col max-sm:gap-1">
      {state === "detected" ? (
        <CheckIcon className="mt-0.5 shrink-0 text-success" />
      ) : (
        <AlertCircleIcon className="mt-0.5 shrink-0 text-severity-info" />
      )}
      <dt className="w-40 shrink-0 text-small font-medium">{label}</dt>
      <dd className="min-w-0 break-all font-mono text-mono text-muted-foreground">
        {detail}
      </dd>
    </div>
  );
}
