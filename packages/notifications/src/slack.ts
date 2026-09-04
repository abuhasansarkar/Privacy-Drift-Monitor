import { assertSafeUrl } from "@pdm/scanner";

/**
 * SLACK BLOCK KIT INTEGRATION — PLAN-V3 Part II System 7, Phase 16.
 *
 * Formats high-severity alerts and privacy drift notifications into interactive
 * Slack Block Kit messages and posts them to incoming webhook URLs.
 */

export interface SlackAlertOptions {
  webhookUrl: string;
  websiteUrl: string;
  websiteLabel?: string;
  title: string;
  severity: string;
  body?: string;
  healthScore?: number | null;
  previousScore?: number | null;
  issuesCount?: number;
  criticalCount?: number;
  driftDetected?: boolean;
  dashboardUrl?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export interface SlackDeliveryResult {
  success: boolean;
  statusCode: number | null;
  error?: string;
}

/**
 * Builds the Slack Block Kit payload structure.
 */
export function buildSlackBlocks(options: SlackAlertOptions): Record<string, unknown> {
  const label = options.websiteLabel || options.websiteUrl;
  const isCritical = options.severity.toUpperCase() === "CRITICAL";
  const emoji = isCritical ? ":rotating_light:" : ":warning:";

  const scoreText =
    options.previousScore !== undefined && options.previousScore !== null
      ? `${options.previousScore} ➔ ${options.healthScore ?? "—"}`
      : `${options.healthScore ?? "—"}`;

  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} ${options.title}`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Website:*\n<${options.websiteUrl}|${label}>`,
        },
        {
          type: "mrkdwn",
          text: `*Health Score:*\n${scoreText}`,
        },
        {
          type: "mrkdwn",
          text: `*Severity:*\n${options.severity}`,
        },
        {
          type: "mrkdwn",
          text: `*Issues:*\n${options.issuesCount ?? 0} (Critical: ${options.criticalCount ?? 0})`,
        },
      ],
    },
  ];

  if (options.body) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: options.body,
      },
    });
  }

  if (options.dashboardUrl) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View in Dashboard",
            emoji: true,
          },
          url: options.dashboardUrl,
          style: isCritical ? "danger" : "primary",
        },
      ],
    });
  }

  return { blocks };
}

/**
 * Sends a rich Block Kit alert to a Slack incoming webhook URL.
 * Enforces SSRF guard pre-flight checks and timeout bounding.
 */
export async function sendSlackAlert(
  options: SlackAlertOptions,
): Promise<SlackDeliveryResult> {
  const {
    webhookUrl,
    timeoutMs = 10_000,
    fetchFn = fetch,
  } = options;

  try {
    // 1. SSRF Safety Check: prevent internal/loopback exploitation
    await assertSafeUrl(webhookUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "SSRF blocked";
    return {
      success: false,
      statusCode: null,
      error: `SSRF_BLOCKED: ${message}`,
    };
  }

  const payload = buildSlackBlocks(options);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const success = response.status >= 200 && response.status < 300;
    return {
      success,
      statusCode: response.status,
      error: success ? undefined : `Slack rejected with HTTP ${response.status}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      statusCode: null,
      error: message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
