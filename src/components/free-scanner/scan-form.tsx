"use client";

import Script from "next/script";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { AlertTriangleIcon, GlobeIcon, SearchIcon } from "@/components/ui/icons";

/**
 * THE FREE-SCAN FORM — PLAN.md §3.2, Phase 6 task 6.5.
 *
 * ⚠️ THE TURNSTILE WIDGET HERE IS A CONVENIENCE, NOT A CONTROL. The control is
 * `verifyTurnstile` on the server; this only obtains a token to hand it. A
 * missing site key therefore degrades to submitting an empty token, which the
 * server accepts only when it has no secret either (development) and rejects
 * everywhere else — the failure mode is "the scanner stops working", never "the
 * challenge is silently off".
 *
 * ⚠️ THE ERROR MESSAGES ARE LOOKED UP FROM A CODE, never returned as prose by
 * the API. One of them is deliberately vague and the rest are specific; keeping
 * the mapping on this side means the server never has to decide how much to
 * say, and never accidentally says more.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const ERROR_COPY: Record<string, string> = {
  INVALID_URL: t("freeScanner.errorInvalidUrl"),
  BLOCKED_ADDRESS: t("freeScanner.errorBlockedAddress"),
  DOMAIN_BLOCKED: t("freeScanner.errorDomainBlocked"),
  CHALLENGE_FAILED: t("freeScanner.errorChallenge"),
  RATE_LIMITED_IP: t("freeScanner.errorRateLimitedIp"),
  RATE_LIMITED_DOMAIN: t("freeScanner.errorRateLimitedDomain"),
  AT_CAPACITY: t("freeScanner.errorCapacity"),
};

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
    };
  }
}

export interface FreeScanFormProps {
  variant?: "default" | "hero";
  placeholder?: string;
  buttonText?: string;
  className?: string;
  hideDisclaimer?: boolean;
}

export function FreeScanForm({
  variant = "default",
  placeholder,
  buttonText,
  className,
  hideDisclaimer = false,
}: FreeScanFormProps) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const tokenRef = useRef("");
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  function mountWidget() {
    if (!SITE_KEY || !widgetRef.current || !window.turnstile) return;
    if (widgetIdRef.current !== null) return;
    widgetIdRef.current = window.turnstile.render(widgetRef.current, {
      sitekey: SITE_KEY,
      callback: (token: string) => {
        tokenRef.current = token;
      },
    });
  }

  function submit() {
    start(async () => {
      setError(null);
      const response = await fetch("/api/public/free-scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, turnstileToken: tokenRef.current }),
      }).catch(() => null);

      if (!response) {
        setError(t("freeScanner.errorGeneric"));
        return;
      }

      const data: unknown = await response.json().catch(() => null);

      if (response.status === 202) {
        const token = (data as { token?: unknown } | null)?.token;
        if (typeof token === "string") {
          router.push(`/free-scanner/${token}`);
          return;
        }
      }

      const code = (data as { error?: unknown } | null)?.error;
      setError(
        (typeof code === "string" ? ERROR_COPY[code] : undefined) ??
          t("freeScanner.errorGeneric"),
      );
      /*
       * ⚠️ THE WIDGET IS RESET ON EVERY FAILURE. A Turnstile token is
       * single-use: after a rejected submission the token in hand has already
       * been redeemed, and re-submitting it fails the challenge rather than the
       * thing the user actually got wrong — which reads as the form being
       * broken.
       */
      if (widgetIdRef.current !== null) window.turnstile?.reset(widgetIdRef.current);
      tokenRef.current = "";
    });
  }

  const isHero = variant === "hero";

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      {SITE_KEY ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          onLoad={mountWidget}
        />
      ) : null}

      <form
        className={
          isHero
            ? "flex w-full flex-col gap-2 rounded-xl border border-border bg-card/90 p-2 shadow-lg backdrop-blur-md sm:flex-row sm:items-center"
            : "flex flex-col gap-2 sm:flex-row"
        }
        onSubmit={(event) => {
          event.preventDefault();
          /*
           * ⚠️ VALIDATED HERE, NOT BY DISABLING THE BUTTON. The submit control
           * used to carry `disabled={url.length < 4}`, so the product's single
           * most important call to action rendered greyed-out to every visitor
           * who had not yet typed — a dead-looking primary button is the first
           * thing a stranger sees above the fold, and a disabled control also
           * tells somebody who presses it exactly nothing about why.
           *
           * The button is now always live and says what is missing.
           */
          if (url.trim().length < 4) {
            setError(t("freeScanner.errorUrlRequired"));
            return;
          }
          submit();
        }}
      >
        <label className="sr-only" htmlFor="free-scan-url">
          {t("freeScanner.urlLabel")}
        </label>
        <div className="relative flex flex-1 items-center">
          <GlobeIcon className="pointer-events-none absolute left-3.5 size-4 text-muted-foreground" />
          <input
            id="free-scan-url"
            name="url"
            type="text"
            inputMode="url"
            autoComplete="url"
            required
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={placeholder ?? t("freeScanner.urlPlaceholder")}
            className={
              isHero
                ? "h-12 w-full rounded-lg border-0 bg-transparent pl-10 pr-3 text-body-lg text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:outline-none"
                : "h-11 flex-1 rounded-md border border-border bg-background pl-10 pr-3 text-body"
            }
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={pending}
          className={isHero ? "h-12 px-6 font-medium shadow-sm transition hover:opacity-95" : ""}
        >
          {pending ? (
            t("freeScanner.submitting")
          ) : (
            <>
              <SearchIcon className="mr-1.5 size-4" />
              {buttonText ?? t("freeScanner.submit")}
            </>
          )}
        </Button>
      </form>

      <div ref={widgetRef} />

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-small text-danger">
          <AlertTriangleIcon className="mt-0.5" />
          {error}
        </p>
      ) : null}

      {!hideDisclaimer ? (
        <p className="text-caption text-muted-foreground">
          {t("freeScanner.disclaimer")}
        </p>
      ) : null}
    </div>
  );
}

