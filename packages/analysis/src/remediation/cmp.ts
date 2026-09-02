/**
 * CMP SCRIPT BLOCKING & CODE REMEDIATION SNIPPET GENERATOR
 * PLAN-V2 Part VII, Phase 13 Task 13.2.
 *
 * Generates copy-paste script wrappers and gating code for major Consent Management Platforms.
 */

export type SupportedCmp =
  | "cookiebot"
  | "onetrust"
  | "usercentrics"
  | "klaro"
  | "termly"
  | "axeptio"
  | "wordpress"
  | "vanilla_js";

export interface CmpSnippetOptions {
  cmp: SupportedCmp;
  vendorName: string;
  category: "MARKETING" | "ANALYTICS" | "ADVERTISING" | "FUNCTIONAL";
  originalScriptTag?: string;
}

export interface CmpSnippetResult {
  cmp: SupportedCmp;
  cmpName: string;
  instructions: string;
  codeSnippet: string;
  language: "html" | "javascript" | "php";
}

/**
 * Generates exact copy-paste script blocking wrappers for a detected CMP.
 */
export function generateCmpSnippet(options: CmpSnippetOptions): CmpSnippetResult {
  const isAnalytics = options.category === "ANALYTICS";
  const catName = isAnalytics ? "statistics" : "marketing";
  const vendor = options.vendorName;

  switch (options.cmp) {
    case "cookiebot":
      return {
        cmp: "cookiebot",
        cmpName: "Cookiebot",
        instructions: `Change the script type to 'text/plain' and add data-cookieconsent="${catName}". Cookiebot will automatically execute this script once the visitor accepts the '${catName}' category.`,
        codeSnippet: `<!-- Gated for Cookiebot: ${vendor} -->\n<script type="text/plain" data-cookieconsent="${catName}" src="https://example-tracker.com/tag.js" async></script>`,
        language: "html",
      };

    case "onetrust":
      return {
        cmp: "onetrust",
        cmpName: "OneTrust",
        instructions: `Change the script type to 'text/plain' and add the OneTrust category class '${isAnalytics ? "optanon-category-C0002" : "optanon-category-C0004"}'.`,
        codeSnippet: `<!-- Gated for OneTrust: ${vendor} -->\n<script type="text/plain" class="${isAnalytics ? "optanon-category-C0002" : "optanon-category-C0004"}" src="https://example-tracker.com/tag.js" async></script>`,
        language: "html",
      };

    case "usercentrics":
      return {
        cmp: "usercentrics",
        cmpName: "Usercentrics",
        instructions: `Change the script type to 'text/plain' and specify data-usercentrics="${vendor}". Usercentrics Smart Data Protector or Browser SDK will execute this script upon consent.`,
        codeSnippet: `<!-- Gated for Usercentrics: ${vendor} -->\n<script type="text/plain" data-usercentrics="${vendor}" src="https://example-tracker.com/tag.js" async></script>`,
        language: "html",
      };

    case "klaro":
      return {
        cmp: "klaro",
        cmpName: "Klaro",
        instructions: `Change script type to 'text/plain', specify data-type="application/javascript", and add data-name="${vendor.toLowerCase().replace(/\s+/g, "-")}".`,
        codeSnippet: `<!-- Gated for Klaro: ${vendor} -->\n<script type="text/plain" data-type="application/javascript" data-name="${vendor.toLowerCase().replace(/\s+/g, "-")}" src="https://example-tracker.com/tag.js" async></script>`,
        language: "html",
      };

    case "termly":
      return {
        cmp: "termly",
        cmpName: "Termly",
        instructions: `Change script type to 'text/plain' and add data-termly="${catName}".`,
        codeSnippet: `<!-- Gated for Termly: ${vendor} -->\n<script type="text/plain" data-termly="${catName}" src="https://example-tracker.com/tag.js" async></script>`,
        language: "html",
      };

    case "axeptio":
      return {
        cmp: "axeptio",
        cmpName: "Axeptio",
        instructions: `Use Axeptio consent callback to conditionally inject or initialize ${vendor}.`,
        codeSnippet: `<!-- Gated for Axeptio: ${vendor} -->\n<script>\n  void 0 === window._axcb && (window._axcb = []);\n  window._axcb.push(function(axeptio) {\n    axeptio.on("cookies:complete", function(choices) {\n      if (choices.${vendor.toLowerCase().replace(/\s+/g, "_")}) {\n        // Initialize ${vendor}\n        loadScript("https://example-tracker.com/tag.js");\n      }\n    });\n  });\n</script>`,
        language: "html",
      };

    case "wordpress":
      return {
        cmp: "wordpress",
        cmpName: "WordPress / PHP",
        instructions: `Wrap the script tag in your theme's functions.php or header template with a consent check helper.`,
        codeSnippet: `<?php\n// Gated for WordPress: ${vendor}\nif (function_exists('wp_has_consent') && wp_has_consent('${catName}')) {\n    echo '<script src="https://example-tracker.com/tag.js" async></script>';\n}\n?>`,
        language: "php",
      };

    case "vanilla_js":
    default:
      return {
        cmp: "vanilla_js",
        cmpName: "Custom / Vanilla JS",
        instructions: `Listen to your custom consent update event before injecting the script tag dynamically.`,
        codeSnippet: `// Gated for Custom Consent: ${vendor}\nwindow.addEventListener('cookie_consent_update', function(e) {\n  if (e.detail && e.detail.${catName} === true) {\n    var s = document.createElement('script');\n    s.src = 'https://example-tracker.com/tag.js';\n    s.async = true;\n    document.head.appendChild(s);\n  }\n});`,
        language: "javascript",
      };
  }
}
