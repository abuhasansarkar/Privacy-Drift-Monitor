import type { ConsentPhase } from "../types";

/**
 * GOOGLE CONSENT MODE V2 INSTRUMENTATION — Phase 13.
 *
 * Hooks into window.dataLayer and window.gtag before any page scripts load.
 * Captures consent default and update signals across all consent journeys.
 */

export interface RecordedConsentEvent {
  source: "dataLayer" | "gtag";
  type: string;
  data: unknown;
  timestamp: number;
}

export interface ConsentModeFact {
  isConsentModeDetected: boolean;
  preConsentAdStorage: string | null;
  preConsentAnalytics: string | null;
  postRejectAdStorage: string | null;
  postRejectAnalytics: string | null;
  postRejectUserData: string | null;
  postRejectPersonalize: string | null;
  issuesDetected: string[];
  rawEvents: RecordedConsentEvent[];
}

export const CONSENT_MODE_INIT_SCRIPT = `
(() => {
  window.__pdm_consent_events = window.__pdm_consent_events || [];

  const record = (source, type, data) => {
    try {
      window.__pdm_consent_events.push({
        source,
        type,
        data: typeof data === 'object' && data !== null ? JSON.parse(JSON.stringify(data)) : data,
        timestamp: Date.now()
      });
    } catch (_) {}
  };

  function wrapDataLayer(dl) {
    if (!dl || dl.__pdm_wrapped) return dl;
    const proxy = new Proxy(dl, {
      set(target, prop, val) {
        if (prop === 'push' || (!isNaN(prop) && prop !== 'length')) {
          record('dataLayer', 'push', val);
        }
        return Reflect.set(target, prop, val);
      }
    });
    try {
      Object.defineProperty(proxy, '__pdm_wrapped', { value: true, enumerable: false });
    } catch (_) {}
    return proxy;
  }

  let internalDl = wrapDataLayer(window.dataLayer || []);
  try {
    Object.defineProperty(window, 'dataLayer', {
      configurable: true,
      enumerable: true,
      get() {
        return internalDl;
      },
      set(val) {
        internalDl = wrapDataLayer(val);
      }
    });
  } catch (_) {
    window.dataLayer = internalDl;
  }

  // Intercept window.gtag
  let internalGtag = window.gtag;
  const wrapGtag = (fn) => {
    const wrapped = function(...args) {
      try {
        if (args[0] === 'consent') {
          record('gtag', args[1] || 'unknown', args[2] || {});
        }
      } catch (_) {}
      if (typeof fn === 'function') {
        return fn.apply(this, args);
      }
    };
    wrapped.__pdm_wrapped = true;
    return wrapped;
  };

  if (typeof internalGtag === 'function') {
    internalGtag = wrapGtag(internalGtag);
  } else {
    internalGtag = wrapGtag(function() {
      (window.dataLayer = window.dataLayer || []).push(arguments);
    });
  }

  try {
    Object.defineProperty(window, 'gtag', {
      configurable: true,
      enumerable: true,
      get() {
        return internalGtag;
      },
      set(val) {
        if (val && !val.__pdm_wrapped) {
          internalGtag = wrapGtag(val);
        } else {
          internalGtag = val;
        }
      }
    });
  } catch (_) {
    window.gtag = internalGtag;
  }
})();
`;

interface NormalizedConsentCommand {
  phase: ConsentPhase;
  command: "default" | "update";
  params: Record<string, string>;
  timestamp: number;
}

function extractConsentCommands(
  phase: ConsentPhase,
  event: RecordedConsentEvent,
): NormalizedConsentCommand[] {
  const commands: NormalizedConsentCommand[] = [];

  if (event.source === "gtag") {
    const cmd = event.type.toLowerCase();
    if ((cmd === "default" || cmd === "update") && typeof event.data === "object" && event.data !== null) {
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(event.data as Record<string, unknown>)) {
        if (typeof v === "string") {
          params[k.toLowerCase()] = v.toLowerCase();
        }
      }
      commands.push({
        phase,
        command: cmd,
        params,
        timestamp: event.timestamp,
      });
    }
  } else if (event.source === "dataLayer" && event.data) {
    const data = event.data;
    // data could be ['consent', 'default', { ... }] or an arguments-like object
    let args: unknown[] | null = null;
    if (Array.isArray(data)) {
      args = data;
    } else if (typeof data === "object" && data !== null) {
      const maybeArgs = Object.values(data);
      if (maybeArgs.length >= 3 && maybeArgs[0] === "consent") {
        args = maybeArgs;
      }
    }

    if (args && args[0] === "consent" && typeof args[1] === "string" && typeof args[2] === "object" && args[2] !== null) {
      const cmd = (args[1] as string).toLowerCase();
      if (cmd === "default" || cmd === "update") {
        const params: Record<string, string> = {};
        for (const [k, v] of Object.entries(args[2] as Record<string, unknown>)) {
          if (typeof v === "string") {
            params[k.toLowerCase()] = v.toLowerCase();
          }
        }
        commands.push({
          phase,
          command: cmd,
          params,
          timestamp: event.timestamp,
        });
      }
    }
  }

  return commands;
}

/**
 * Parses all recorded consent events across all phases of a scan into a structured fact.
 */
export function parseConsentModeEvents(
  phaseEvents: Array<{ phase: ConsentPhase; events: RecordedConsentEvent[] }>,
): ConsentModeFact {
  const allEvents: RecordedConsentEvent[] = [];
  const commands: NormalizedConsentCommand[] = [];

  for (const { phase, events } of phaseEvents) {
    for (const evt of events) {
      allEvents.push(evt);
      commands.push(...extractConsentCommands(phase, evt));
    }
  }

  const isConsentModeDetected = commands.length > 0;
  if (!isConsentModeDetected) {
    return {
      isConsentModeDetected: false,
      preConsentAdStorage: null,
      preConsentAnalytics: null,
      postRejectAdStorage: null,
      postRejectAnalytics: null,
      postRejectUserData: null,
      postRejectPersonalize: null,
      issuesDetected: [],
      rawEvents: allEvents,
    };
  }

  // Pre-consent analysis (NO_CONSENT phase or default commands)
  const defaults = commands.filter((c) => c.command === "default");
  const lastDefault = defaults[defaults.length - 1];
  const preConsentAdStorage = lastDefault?.params["ad_storage"] ?? null;
  const preConsentAnalytics = lastDefault?.params["analytics_storage"] ?? null;

  // Post-reject analysis (REJECT_ALL phase updates)
  const rejectUpdates = commands.filter((c) => c.phase === "REJECT_ALL" && c.command === "update");
  const lastRejectUpdate = rejectUpdates[rejectUpdates.length - 1];

  const postRejectAdStorage = lastRejectUpdate?.params["ad_storage"] ?? null;
  const postRejectAnalytics = lastRejectUpdate?.params["analytics_storage"] ?? null;
  const postRejectUserData = lastRejectUpdate?.params["ad_user_data"] ?? null;
  const postRejectPersonalize = lastRejectUpdate?.params["ad_personalization"] ?? null;

  const issuesDetected: string[] = [];

  // PDM-R051: Default state set to granted before consent
  if (preConsentAdStorage === "granted" || preConsentAnalytics === "granted") {
    issuesDetected.push("PDM-R051");
  }

  // PDM-R052: Reject All journey executed, but update missing or un-denied
  const ranRejectAll = phaseEvents.some((p) => p.phase === "REJECT_ALL");
  if (ranRejectAll) {
    if (!lastRejectUpdate) {
      issuesDetected.push("PDM-R052");
    } else {
      const anyNotDenied =
        postRejectAdStorage === "granted" ||
        postRejectAnalytics === "granted" ||
        postRejectUserData === "granted" ||
        postRejectPersonalize === "granted";
      if (anyNotDenied) {
        issuesDetected.push("PDM-R052");
      }
    }
  }

  return {
    isConsentModeDetected: true,
    preConsentAdStorage,
    preConsentAnalytics,
    postRejectAdStorage,
    postRejectAnalytics,
    postRejectUserData,
    postRejectPersonalize,
    issuesDetected,
    rawEvents: allEvents,
  };
}
