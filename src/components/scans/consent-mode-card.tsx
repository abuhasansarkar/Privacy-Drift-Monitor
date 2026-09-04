import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge, SeverityBadge } from "@/components/ui/severity-badge";
import { cn } from "@/lib/cn";

export interface ConsentModeAuditData {
  isConsentModeDetected: boolean;
  preConsentAdStorage: string | null;
  preConsentAnalytics: string | null;
  postRejectAdStorage: string | null;
  postRejectAnalytics: string | null;
  postRejectUserData: string | null;
  postRejectPersonalize: string | null;
  issuesDetected?: string[];
}

export function ConsentModeCard({ audit }: { audit?: ConsentModeAuditData | null }) {
  if (!audit) return null;

  const isDetected = audit.isConsentModeDetected;
  const issues = audit.issuesDetected ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Google Consent Mode v2"
        action={
          isDetected ? (
            <StatusBadge tone="success" label="Detected" />
          ) : (
            <StatusBadge tone="muted" label="Not detected" />
          )
        }
      />

      <div className="p-4 space-y-4">
        {!isDetected ? (
          <p className="text-small text-muted-foreground">
            No Google Consent Mode v2 configuration or signals were observed during this scan.
          </p>
        ) : (
          <>
            {issues.length > 0 ? (
              <div className="rounded-md border border-severity-critical/20 bg-severity-critical-bg/30 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-caption font-semibold text-severity-critical">
                    Potential issues detected:
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {issues.includes("PDM-R051") ? (
                    <SeverityBadge severity="CRITICAL" />
                  ) : null}
                  {issues.includes("PDM-R052") ? (
                    <SeverityBadge severity="HIGH" />
                  ) : null}
                </div>
                <p className="text-caption text-muted-foreground">
                  {issues.includes("PDM-R051")
                    ? "Default consent parameters were set to 'granted' prior to visitor consent."
                    : null}
                  {issues.includes("PDM-R051") && issues.includes("PDM-R052") ? " " : null}
                  {issues.includes("PDM-R052")
                    ? "Reject All action failed to update all parameters to 'denied'."
                    : null}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-caption text-success">
                <StatusBadge tone="success" label="Signal defaults & updates valid" />
                <span className="text-muted-foreground">
                  Parameters properly respect user consent state.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Pre-consent default states */}
              <div className="rounded-md border border-border bg-canvas p-3">
                <h3 className="text-caption font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Pre-Consent Default Signals
                </h3>
                <div className="space-y-1.5 font-mono text-caption">
                  <ParameterRow
                    label="ad_storage"
                    value={audit.preConsentAdStorage}
                    isDefaultCheck
                  />
                  <ParameterRow
                    label="analytics_storage"
                    value={audit.preConsentAnalytics}
                    isDefaultCheck
                  />
                </div>
              </div>

              {/* Post-reject states */}
              <div className="rounded-md border border-border bg-canvas p-3">
                <h3 className="text-caption font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Post-Reject Updated Signals
                </h3>
                <div className="space-y-1.5 font-mono text-caption">
                  <ParameterRow
                    label="ad_storage"
                    value={audit.postRejectAdStorage}
                  />
                  <ParameterRow
                    label="analytics_storage"
                    value={audit.postRejectAnalytics}
                  />
                  <ParameterRow
                    label="ad_user_data"
                    value={audit.postRejectUserData}
                  />
                  <ParameterRow
                    label="ad_personalization"
                    value={audit.postRejectPersonalize}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function ParameterRow({
  label,
  value,
  isDefaultCheck = false,
}: {
  label: string;
  value: string | null;
  isDefaultCheck?: boolean;
}) {
  const isGranted = value === "granted";
  const isDenied = value === "denied";

  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      {value === null ? (
        <span className="text-muted-foreground italic font-sans text-caption">not set</span>
      ) : (
        <span
          className={cn(
            "px-1.5 py-0.5 rounded text-caption font-semibold",
            isGranted
              ? isDefaultCheck
                ? "bg-severity-critical-bg text-severity-critical"
                : "bg-severity-high-bg text-severity-high"
              : isDenied
                ? "bg-success-muted text-success"
                : "bg-muted text-muted-foreground",
          )}
        >
          {value}
        </span>
      )}
    </div>
  );
}
