/**
 * GOOGLE TAG MANAGER (GTM) AUTO-REMEDIATION RECIPE GENERATOR
 * PLAN-V2 Part VII, Phase 13 Task 13.1.
 *
 * Generates official Google Tag Manager container export JSON (v2 format)
 * pre-configured with Google Consent Mode v2 and custom CMP event triggers.
 */

export interface GtmRecipeOptions {
  containerName?: string;
  vendorName?: string;
  vendorSlug?: string;
  category?: "MARKETING" | "ANALYTICS" | "ADVERTISING" | "FUNCTIONAL";
  consentEventName?: string;
}

export interface GtmContainerExport {
  exportFormatVersion: number;
  exportTime: string;
  containerVersion: {
    container: {
      name: string;
      publicId: string;
      usageContext: string[];
    };
    tag: Array<Record<string, unknown>>;
    trigger: Array<Record<string, unknown>>;
    variable: Array<Record<string, unknown>>;
  };
}

/**
 * Generates a full downloadable GTM Container JSON file pre-configured for Consent Mode v2
 * and gated tag execution.
 */
export function generateGtmRecipe(options: GtmRecipeOptions = {}): GtmContainerExport {
  const containerName = options.containerName ?? "Privacy Drift Monitor — Consent Mode v2 Fix";
  const vendorName = options.vendorName ?? "Marketing Tracker";
  const consentType = options.category === "ANALYTICS" ? "analytics_storage" : "ad_storage";
  const customEvent = options.consentEventName ?? (options.category === "ANALYTICS" ? "consent_analytics" : "consent_marketing");

  return {
    exportFormatVersion: 2,
    exportTime: new Date().toISOString(),
    containerVersion: {
      container: {
        name: containerName,
        publicId: "GTM-PDMFIX",
        usageContext: ["WEB"],
      },
      tag: [
        {
          name: "Consent Mode v2 — Default Settings (Privacy Drift Monitor)",
          type: "html",
          parameter: [
            {
              type: "template",
              key: "html",
              value: `<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag('consent', 'default', {\n    'ad_storage': 'denied',\n    'analytics_storage': 'denied',\n    'ad_user_data': 'denied',\n    'ad_personalization': 'denied',\n    'wait_for_update': 500\n  });\n</script>`,
            },
          ],
          firingTriggerId: ["2147479553"], // Consent Initialization trigger
        },
        {
          name: `${vendorName} — Gated Tag (${consentType})`,
          type: "html",
          parameter: [
            {
              type: "template",
              key: "html",
              value: `<!-- ${vendorName} tracking snippet gated behind '${customEvent}' event and '${consentType}' consent -->`,
            },
          ],
          firingTriggerId: ["101"],
          consentSettings: {
            consentStatus: "NEEDED",
            consentType: [consentType],
          },
        },
      ],
      trigger: [
        {
          triggerId: "101",
          name: `Consent Event — ${customEvent}`,
          type: "CUSTOM_EVENT",
          customEventFilter: [
            {
              type: "EQUALS",
              parameter: [
                { type: "template", key: "arg0", value: "{{_event}}" },
                { type: "template", key: "arg1", value: customEvent },
              ],
            },
          ],
        },
      ],
      variable: [
        {
          name: "Event Name",
          type: "aev",
          parameter: [{ type: "template", key: "varType", value: "EVENT_NAME" }],
        },
      ],
    },
  };
}
