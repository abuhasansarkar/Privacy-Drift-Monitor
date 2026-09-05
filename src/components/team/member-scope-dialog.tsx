"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GlobeIcon, XIcon } from "@/components/ui/icons";
import { setMemberWebsiteScope } from "@/server/actions/team";

export interface WebsiteOption {
  id: string;
  url: string;
}

export function MemberScopeDialog({
  memberId,
  memberName,
  initialScope,
  websites,
}: {
  memberId: string;
  memberName: string;
  initialScope: string[];
  websites: WebsiteOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [allWebsites, setAllWebsites] = useState(initialScope.length === 0);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialScope);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleOpen() {
    setAllWebsites(initialScope.length === 0);
    setSelectedIds(initialScope);
    setError(null);
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
  }

  function toggleWebsite(id: string) {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const nextScope = allWebsites ? [] : selectedIds;

    start(async () => {
      const outcome = await setMemberWebsiteScope({
        memberId,
        websiteScope: nextScope,
      });

      if (!outcome.ok) {
        setError(outcome.message);
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  const scopeLabel =
    initialScope.length === 0
      ? "Scope: All"
      : `Scope: ${initialScope.length} site${initialScope.length === 1 ? "" : "s"}`;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleOpen}
        className="h-8 text-caption text-muted-foreground hover:text-foreground"
        title="Configure website access scope"
      >
        <GlobeIcon />
        {scopeLabel}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="scope-dialog-title"
            className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 id="scope-dialog-title" className="text-h4">
                Website Scope — {memberName}
              </h2>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <XIcon />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 flex flex-col gap-4">
              {error ? (
                <div
                  role="alert"
                  className="rounded-md border border-danger/20 bg-danger/10 p-3 text-small text-danger"
                >
                  {error}
                </div>
              ) : null}

              <p className="text-small text-muted-foreground">
                Specify which websites this member can view and manage.
              </p>

              <label className="flex items-center gap-2.5 rounded-md border border-border p-3 text-small font-medium hover:bg-muted/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allWebsites}
                  onChange={(e) => {
                    setAllWebsites(e.target.checked);
                    if (e.target.checked) setSelectedIds([]);
                  }}
                  className="size-4 rounded border-border"
                />
                <span>Allow access to all websites in agency</span>
              </label>

              {!allWebsites ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                    Restricted Website Access
                  </span>
                  <div className="max-h-52 overflow-y-auto rounded-md border border-border divide-y divide-border">
                    {websites.length === 0 ? (
                      <div className="p-3 text-small text-muted-foreground">
                        No active websites found.
                      </div>
                    ) : (
                      websites.map((site) => (
                        <label
                          key={site.id}
                          className="flex items-center gap-2.5 p-2.5 text-small hover:bg-muted/40 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(site.id)}
                            onChange={() => toggleWebsite(site.id)}
                            className="size-4 rounded border-border"
                          />
                          <span className="font-mono text-caption truncate">{site.url}</span>
                        </label>
                      ))
                    )}
                  </div>
                  {!allWebsites && selectedIds.length === 0 ? (
                    <span className="text-caption text-warning">
                      ⚠️ Note: Selecting no websites with &apos;All Websites&apos; unchecked restricts this member from accessing any sites.
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-2 flex justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={pending}>
                  {pending ? "Saving..." : "Save Scope"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
