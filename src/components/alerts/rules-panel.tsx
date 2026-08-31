"use client";

import { useState } from "react";
import { t } from "@pdm/shared/copy";
import { AlertRuleForm, RuleRowActions, type ScopeOption } from "./rule-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { MutedBadge, SeverityBadge } from "@/components/ui/severity-badge";
import type { Severity } from "@pdm/schemas";

/**
 * RULES TAB — §3.11.
 *
 * ⚠️ THE EDITOR OPENS INLINE, NOT IN A MODAL. §5.21 draws a dialog; a rule has
 * eleven fields including a quiet-hours fieldset, and a dialog at 390px turns
 * that into a scroll trap with the Save button below the fold. The inline panel
 * is the same information with a working small-screen layout, which §11.5
 * ranks above matching the mock.
 */

export interface RuleRow {
  id: string;
  name: string;
  enabled: boolean;
  scopeType: "ALL" | "GROUP" | "CLIENT" | "WEBSITE";
  scopeId: string | null;
  scopeLabel: string;
  triggerTypes: string[];
  triggerLabels: string[];
  minSeverity: Severity;
  minSeverityLabel: string;
  channels: string[];
  digest: string;
  digestLabel: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  criticalOverridesQuietHours: boolean;
  recipients: string[];
}

export function AlertRulesPanel({
  rules,
  clients,
  websites,
  groups,
  timezone,
}: {
  rules: RuleRow[];
  clients: ScopeOption[];
  websites: ScopeOption[];
  groups: ScopeOption[];
  timezone: string;
}) {
  const [editing, setEditing] = useState<RuleRow | "new" | null>(null);

  const columns: Column[] = [
    { key: "rule", label: t("alerts.columnRule") },
    { key: "scope", label: t("alerts.columnScope") },
    { key: "channels", label: t("alerts.columnChannels"), hideBelow: "lg" },
    { key: "schedule", label: t("alerts.columnSchedule"), hideBelow: "lg" },
    { key: "threshold", label: t("alerts.columnThreshold") },
    { key: "quiet", label: t("alerts.columnQuietHours"), hideBelow: "xl" },
    { key: "actions", label: t("alerts.columnEnabled"), align: "end" },
  ];

  const rows: Row[] = rules.map((rule) => ({
    id: rule.id,
    primary: rule.name,
    // The condition line beneath the name (§5.21): the rule's meaning in words,
    // so the table is readable without opening each one.
    secondary: rule.triggerLabels.slice(0, 3).join(" · "),
    dimmed: !rule.enabled,
    cells: {
      rule: null,
      scope: <MutedBadge>{rule.scopeLabel}</MutedBadge>,
      channels: (
        <span className="text-caption text-muted-foreground">
          {rule.channels
            .map((channel) =>
              channel === "email" ? t("alerts.channelEmail") : t("alerts.channelInApp"),
            )
            .join(" · ")}
        </span>
      ),
      schedule: <MutedBadge>{rule.digestLabel}</MutedBadge>,
      threshold: <SeverityBadge severity={rule.minSeverity} />,
      quiet: (
        <span className="font-mono text-mono text-muted-foreground">
          {rule.quietHoursStart && rule.quietHoursEnd
            ? `${rule.quietHoursStart}–${rule.quietHoursEnd}`
            : t("alerts.noQuietHours")}
        </span>
      ),
      actions: (
        <RuleRowActions
          id={rule.id}
          enabled={rule.enabled}
          onEdit={() => setEditing(rule)}
        />
      ),
    },
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={() => setEditing(editing === "new" ? null : "new")}
        >
          {t("alerts.createRule")}
        </Button>
      </div>

      {editing ? (
        <AlertRuleForm
          initial={editing === "new" ? undefined : toValue(editing)}
          clients={clients}
          websites={websites}
          groups={groups}
          timezone={timezone}
          onDone={() => setEditing(null)}
        />
      ) : null}

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={t("alerts.emptyRulesTitle")}
            body={t("alerts.emptyRulesBody")}
            action={
              <Button variant="primary" onClick={() => setEditing("new")}>
                {t("alerts.createRule")}
              </Button>
            }
          />
        ) : (
          <DataList caption={t("alerts.tabRules")} columns={columns} rows={rows} />
        )}
      </Card>
    </div>
  );
}

function toValue(rule: RuleRow) {
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    scopeType: rule.scopeType,
    scopeId: rule.scopeId,
    triggerTypes: rule.triggerTypes,
    minSeverity: rule.minSeverity as string,
    channels: rule.channels,
    digest: rule.digest,
    quietHoursStart: rule.quietHoursStart,
    quietHoursEnd: rule.quietHoursEnd,
    criticalOverridesQuietHours: rule.criticalOverridesQuietHours,
    recipients: rule.recipients,
  };
}
