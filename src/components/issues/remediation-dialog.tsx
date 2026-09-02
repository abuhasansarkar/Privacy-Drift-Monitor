"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateGtmRecipe, generateCmpSnippet, type SupportedCmp } from "@pdm/analysis";
import { Button } from "@/components/ui/button";
import { startScan } from "@/server/actions/scans";

interface RemediationDialogProps {
  issueId: string;
  websiteId: string;
  ruleId: string;
  vendorName: string;
  category?: "MARKETING" | "ANALYTICS" | "ADVERTISING" | "FUNCTIONAL";
}

export function RemediationDialog({
  websiteId,
  vendorName,
  category = "MARKETING",
}: RemediationDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedCmp, setSelectedCmp] = useState<SupportedCmp>("cookiebot");
  const [copied, setCopied] = useState(false);
  const [reScanPending, startReScan] = useTransition();
  const [reScanStatus, setReScanStatus] = useState<string | null>(null);

  const cmpSnippet = generateCmpSnippet({
    cmp: selectedCmp,
    vendorName,
    category,
  });

  function downloadGtmRecipe() {
    const recipe = generateGtmRecipe({
      vendorName,
      category,
      containerName: `PDM Fix — ${vendorName}`,
    });

    const blob = new Blob([JSON.stringify(recipe, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gtm-remediation-${vendorName.toLowerCase().replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCopy() {
    navigator.clipboard.writeText(cmpSnippet.codeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function triggerDeployAndVerify() {
    setReScanStatus(null);
    startReScan(async () => {
      const res = await startScan({ websiteId });
      if (res.ok) {
        setReScanStatus("Verification scan started! Redirecting...");
        setTimeout(() => {
          setOpen(false);
          router.refresh();
        }, 1200);
      } else {
        setReScanStatus(`Failed to trigger re-scan: ${res.message}`);
      }
    });
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <span>🛠️</span> Fix Recipe & Remediation
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-large font-bold">Automated Fix Recipe</h3>
                <p className="text-small text-muted-foreground">
                  Gating instructions for <span className="font-semibold text-foreground">{vendorName}</span>
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {/* Option 1: GTM 1-Click Import */}
              <div className="rounded-lg border border-border/80 bg-muted/40 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold">Google Tag Manager Container JSON</h4>
                    <p className="text-small text-muted-foreground">
                      Consent Mode v2 triggers ready for direct import into GTM
                    </p>
                  </div>
                  <Button variant="primary" onClick={downloadGtmRecipe}>
                    Download GTM JSON
                  </Button>
                </div>
              </div>

              {/* Option 2: CMP Script Blocking Code */}
              <div className="rounded-lg border border-border/80 bg-muted/40 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">CMP Script Wrapper Snippet</h4>
                  <select
                    value={selectedCmp}
                    onChange={(e) => setSelectedCmp(e.target.value as SupportedCmp)}
                    className="rounded-md border border-border bg-card px-2.5 py-1 text-small"
                  >
                    <option value="cookiebot">Cookiebot</option>
                    <option value="onetrust">OneTrust</option>
                    <option value="usercentrics">Usercentrics</option>
                    <option value="klaro">Klaro</option>
                    <option value="termly">Termly</option>
                    <option value="axeptio">Axeptio</option>
                    <option value="wordpress">WordPress / PHP</option>
                    <option value="vanilla_js">Vanilla JS</option>
                  </select>
                </div>

                <p className="mt-2 text-small text-muted-foreground">
                  {cmpSnippet.instructions}
                </p>

                <div className="relative mt-2">
                  <pre className="overflow-x-auto rounded bg-background p-3 font-mono text-xs text-foreground border border-border">
                    <code>{cmpSnippet.codeSnippet}</code>
                  </pre>
                  <button
                    onClick={handleCopy}
                    className="absolute right-2 top-2 rounded bg-card/80 px-2 py-1 text-xs border border-border hover:bg-card"
                  >
                    {copied ? "Copied! ✓" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Option 3: Deploy & Verify */}
              <div className="flex items-center justify-between pt-2">
                <div>
                  {reScanStatus && (
                    <span className="text-small text-info font-medium">
                      {reScanStatus}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Close
                  </Button>
                  <Button
                    variant="primary"
                    onClick={triggerDeployAndVerify}
                    disabled={reScanPending}
                  >
                    {reScanPending ? "Scheduling Re-Scan..." : "🚀 Deploy & Verify (Re-Scan)"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
