"use client";

import { useState, useTransition } from "react";
import { classifyUrlArchetype, type UrlArchetype } from "@pdm/scanner/spider/archetypes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  discoverSitemapAction,
  saveAuthConfigAction,
  saveSitemapConfigAction,
  toggleAuthConfigAction,
} from "@/server/actions/crawl-settings";

interface CrawlSettingsViewProps {
  websiteId: string;
  websiteUrl: string;
  sitemapConfig: {
    maxPages: number;
    discoveredUrls: string[];
    selectedUrls: string[];
    lastCrawledAt: Date | string | null;
  } | null;
  authConfig: {
    loginUrl: string;
    usernameSelector: string;
    passwordSelector: string;
    submitSelector: string;
    isActive: boolean;
    hasSecrets: boolean;
  } | null;
}

const ARCHETYPE_BADGE_STYLES: Record<UrlArchetype, string> = {
  HOME: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  CART: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  CHECKOUT: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  FORM: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  BLOG: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  GENERIC: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

export function CrawlSettingsView({
  websiteId,
  websiteUrl,
  sitemapConfig,
  authConfig,
}: CrawlSettingsViewProps) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // ── Sitemap State ────────────────────────────────────────────────────────
  const [maxPages, setMaxPages] = useState<number>(sitemapConfig?.maxPages ?? 5);
  const [discoveredUrls, setDiscoveredUrls] = useState<string[]>(
    sitemapConfig?.discoveredUrls ?? [websiteUrl],
  );
  const [selectedUrls, setSelectedUrls] = useState<string[]>(
    sitemapConfig?.selectedUrls ?? [websiteUrl],
  );

  // ── Auth Scan State ──────────────────────────────────────────────────────
  const [authActive, setAuthActive] = useState<boolean>(authConfig?.isActive ?? false);
  const [loginUrl, setLoginUrl] = useState<string>(authConfig?.loginUrl ?? "");
  const [usernameSelector, setUsernameSelector] = useState<string>(
    authConfig?.usernameSelector ?? 'input[type="email"], #username',
  );
  const [passwordSelector, setPasswordSelector] = useState<string>(
    authConfig?.passwordSelector ?? 'input[type="password"], #password',
  );
  const [submitSelector, setSubmitSelector] = useState<string>(
    authConfig?.submitSelector ?? 'button[type="submit"]',
  );
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");

  function handleDiscoverSitemap() {
    setFeedback(null);
    startTransition(async () => {
      const res = await discoverSitemapAction(websiteId, maxPages);
      if (res.ok) {
        setDiscoveredUrls(res.data.discoveredUrls);
        setSelectedUrls(res.data.selectedUrls);
        setFeedback({
          type: "success",
          text: `Discovered ${res.data.discoveredUrls.length} URLs across site archetypes. Selected ${res.data.selectedUrls.length} pages for multi-page scans.`,
        });
      } else {
        setFeedback({ type: "error", text: res.message });
      }
    });
  }

  function handleSaveSitemap() {
    setFeedback(null);
    startTransition(async () => {
      const res = await saveSitemapConfigAction(websiteId, {
        maxPages,
        selectedUrls,
      });
      if (res.ok) {
        setFeedback({
          type: "success",
          text: `Saved multi-page crawl configuration with ${selectedUrls.length} monitored URLs.`,
        });
      } else {
        setFeedback({ type: "error", text: res.message });
      }
    });
  }

  function toggleUrlSelection(url: string) {
    if (selectedUrls.includes(url)) {
      if (selectedUrls.length === 1) {
        setFeedback({ type: "error", text: "At least one target page must remain selected." });
        return;
      }
      setSelectedUrls(selectedUrls.filter((u) => u !== url));
    } else {
      if (selectedUrls.length >= maxPages) {
        setFeedback({
          type: "error",
          text: `Page limit is currently set to ${maxPages}. Increase page limit to select more pages.`,
        });
        return;
      }
      setSelectedUrls([...selectedUrls, url]);
    }
  }

  function handleSaveAuthScan() {
    setFeedback(null);
    startTransition(async () => {
      const res = await saveAuthConfigAction(websiteId, {
        loginUrl,
        usernameSelector,
        passwordSelector,
        submitSelector,
        username,
        password: password || undefined,
        isActive: authActive,
      });

      if (res.ok) {
        setPassword("");
        setFeedback({
          type: "success",
          text: "Authenticated scan configuration encrypted and saved securely.",
        });
      } else {
        setFeedback({ type: "error", text: res.message });
      }
    });
  }

  function handleToggleAuth(newActive: boolean) {
    setAuthActive(newActive);
    startTransition(async () => {
      const res = await toggleAuthConfigAction(websiteId, newActive);
      if (!res.ok) {
        setAuthActive(!newActive);
        setFeedback({ type: "error", text: res.message });
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {feedback ? (
        <div
          className={`rounded-lg border px-4 py-3 text-small ${
            feedback.type === "success"
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      {/* ── CARD 1: Multi-Page Sitemap Spider ─────────────────────────────── */}
      <Card>
        <div className="p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-h3 font-semibold">Multi-Page Sitemap Crawling</h2>
            <p className="text-small text-muted-foreground">
              Scan across high-value archetypal pages (such as checkout, cart, and lead forms)
              rather than the homepage alone to uncover deep tracking pixels.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="max-pages-input" className="text-caption font-medium text-foreground">
                Max Crawl Pages
              </label>
              <select
                id="max-pages-input"
                className="h-9 rounded-md border border-border bg-background px-3 py-1 text-small shadow-sm"
                value={maxPages}
                disabled={isPending}
                onChange={(e) => setMaxPages(Number(e.target.value))}
              >
                <option value={1}>1 Page (Root Only)</option>
                <option value={3}>3 Pages (Home, Cart, Form)</option>
                <option value={5}>5 Pages (Diverse Archetypes)</option>
                <option value={10}>10 Pages (Deep Audit)</option>
              </select>
            </div>

            <Button
              variant="secondary"
              disabled={isPending}
              onClick={handleDiscoverSitemap}
            >
              {isPending ? "Spidering..." : "Spider Sitemap.xml"}
            </Button>

            <Button
              variant="primary"
              disabled={isPending || selectedUrls.length === 0}
              onClick={handleSaveSitemap}
            >
              Save Selected Pages
            </Button>
          </div>

          {sitemapConfig?.lastCrawledAt ? (
            <p className="mt-3 text-caption text-muted-foreground">
              Last crawled: {new Date(sitemapConfig.lastCrawledAt).toLocaleString()}
            </p>
          ) : null}

          {/* Discovered URLs List */}
          <div className="mt-6 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-caption font-medium uppercase tracking-wider text-muted-foreground">
                Discovered Pages ({selectedUrls.length} of {discoveredUrls.length} active)
              </span>
            </div>

            <div className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border bg-background">
              {discoveredUrls.map((url) => {
                const archetype = classifyUrlArchetype(url, websiteUrl);
                const isSelected = selectedUrls.includes(url);
                const badgeStyle = ARCHETYPE_BADGE_STYLES[archetype];

                return (
                  <div
                    key={url}
                    className={`flex items-center justify-between p-3 text-small transition-colors ${
                      isSelected ? "bg-muted/30" : "opacity-60"
                    }`}
                  >
                    <label className="flex cursor-pointer items-center gap-3 font-mono text-small">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border"
                        checked={isSelected}
                        onChange={() => toggleUrlSelection(url)}
                      />
                      <span className="truncate max-w-xl">{url}</span>
                    </label>

                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-caption font-semibold ${badgeStyle}`}
                    >
                      {archetype}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* ── CARD 2: Behind-Login Authenticated Scanning ───────────────────── */}
      <Card>
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="text-h3 font-semibold">Behind-Login Authenticated Scanning</h2>
              <p className="text-small text-muted-foreground">
                Configure form-based authentication to monitor member dashboards and customer portals.
                Credentials are encrypted with AES-256-GCM and never exposed.
              </p>
            </div>

            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={authActive}
                disabled={isPending || !authConfig?.hasSecrets}
                onChange={(e) => handleToggleAuth(e.target.checked)}
              />
              <span className="text-small font-medium">
                {authActive ? "Active" : "Disabled"}
              </span>
            </label>
          </div>

          <form
            className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveAuthScan();
            }}
          >
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label htmlFor="auth-login-url" className="text-caption font-medium text-foreground">
                Login Page URL
              </label>
              <Input
                id="auth-login-url"
                type="url"
                placeholder="https://example.com/login"
                value={loginUrl}
                disabled={isPending}
                onChange={(e) => setLoginUrl(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-username-sel" className="text-caption font-medium text-foreground">
                Username / Email Selector
              </label>
              <Input
                id="auth-username-sel"
                type="text"
                placeholder='input[type="email"], #username'
                value={usernameSelector}
                disabled={isPending}
                onChange={(e) => setUsernameSelector(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-password-sel" className="text-caption font-medium text-foreground">
                Password Selector
              </label>
              <Input
                id="auth-password-sel"
                type="text"
                placeholder='input[type="password"], #password'
                value={passwordSelector}
                disabled={isPending}
                onChange={(e) => setPasswordSelector(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label htmlFor="auth-submit-sel" className="text-caption font-medium text-foreground">
                Submit Button Selector
              </label>
              <Input
                id="auth-submit-sel"
                type="text"
                placeholder='button[type="submit"], #btn-login'
                value={submitSelector}
                disabled={isPending}
                onChange={(e) => setSubmitSelector(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-username-val" className="text-caption font-medium text-foreground">
                Audit Account Username / Email
              </label>
              <Input
                id="auth-username-val"
                type="text"
                placeholder="audit-bot@youragency.com"
                value={username}
                disabled={isPending}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-password-val" className="text-caption font-medium text-foreground">
                Password {authConfig?.hasSecrets ? "(leave blank to keep existing)" : ""}
              </label>
              <Input
                id="auth-password-val"
                type="password"
                placeholder={authConfig?.hasSecrets ? "••••••••••••" : "Enter password"}
                value={password}
                disabled={isPending}
                onChange={(e) => setPassword(e.target.value)}
                required={!authConfig?.hasSecrets}
              />
            </div>

            <div className="mt-2 flex items-center justify-end gap-3 md:col-span-2">
              <Button variant="primary" type="submit" disabled={isPending}>
                {isPending ? "Encrypting & Saving..." : "Save Authentication Settings"}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
