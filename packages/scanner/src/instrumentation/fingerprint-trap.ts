/**
 * BROWSER FINGERPRINTING TRAP — Module 22 (Phase 15).
 *
 * Injects early traps on Canvas, Audio, and WebGL APIs commonly exploited for
 * cross-site device fingerprinting without consent.
 */

export interface RecordedFingerprintCall {
  api: string;
  timestampMs?: number;
  stackSnippet?: string;
}

export interface FingerprintFact {
  calls: readonly RecordedFingerprintCall[];
  hasFingerprinting: boolean;
  canvasAttempts: number;
  audioAttempts: number;
  webglAttempts: number;
  stackSnippets: readonly string[];
  hasCanvasFingerprint: boolean;
  hasAudioFingerprint: boolean;
  hasWebGLFingerprint: boolean;
  isFingerprintingDetected: boolean;
}

export const FINGERPRINT_TRAP_SCRIPT = `
(() => {
  if (window.__pdm_fingerprint_installed) return;
  window.__pdm_fingerprint_installed = true;
  window.__pdm_fingerprint_calls = [];

  const trap = (api) => {
    try {
      const err = new Error();
      const stack = (err.stack || "").split("\\n").slice(2, 4).join(" ").trim();
      window.__pdm_fingerprint_calls.push({ api, timestampMs: Date.now(), stackSnippet: stack });
    } catch (_) {}
  };

  if (typeof HTMLCanvasElement !== 'undefined') {
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      trap('canvas.toDataURL');
      return origToDataURL.apply(this, args);
    };
    if (typeof CanvasRenderingContext2D !== 'undefined') {
      const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function(...args) {
        trap('canvas.getImageData');
        return origGetImageData.apply(this, args);
      };
    }
  }

  if (typeof WebGLRenderingContext !== 'undefined') {
    const origReadPixels = WebGLRenderingContext.prototype.readPixels;
    WebGLRenderingContext.prototype.readPixels = function(...args) {
      trap('webgl.readPixels');
      return origReadPixels.apply(this, args);
    };
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (AudioCtx && AudioCtx.prototype) {
    const origOsc = AudioCtx.prototype.createOscillator;
    AudioCtx.prototype.createOscillator = function(...args) {
      trap('audio.createOscillator');
      return origOsc.apply(this, args);
    };
  }
})();
`;

/**
 * Parses and deduplicates raw fingerprint calls recorded by the browser trap.
 */
export function parseFingerprintCalls(raw: unknown): FingerprintFact {
  if (!Array.isArray(raw)) {
    return {
      calls: [],
      hasFingerprinting: false,
      canvasAttempts: 0,
      audioAttempts: 0,
      webglAttempts: 0,
      stackSnippets: [],
      hasCanvasFingerprint: false,
      hasAudioFingerprint: false,
      hasWebGLFingerprint: false,
      isFingerprintingDetected: false,
    };
  }

  const validCalls: RecordedFingerprintCall[] = [];
  let canvasAttempts = 0;
  let audioAttempts = 0;
  let webglAttempts = 0;
  const stackSnippets: string[] = [];

  for (const item of raw) {
    if (item && typeof item === "object" && typeof (item as RecordedFingerprintCall).api === "string") {
      const call = item as RecordedFingerprintCall;
      validCalls.push(call);
      if (call.stackSnippet) stackSnippets.push(call.stackSnippet);

      if (call.api.startsWith("canvas.")) canvasAttempts++;
      if (call.api.startsWith("audio.")) audioAttempts++;
      if (call.api.startsWith("webgl.")) webglAttempts++;
    }
  }

  const hasCanvas = canvasAttempts > 0;
  const hasAudio = audioAttempts > 0;
  const hasWebGL = webglAttempts > 0;
  const hasFingerprinting = hasCanvas || hasAudio || hasWebGL || validCalls.length > 0;

  return {
    calls: validCalls,
    hasFingerprinting,
    canvasAttempts,
    audioAttempts,
    webglAttempts,
    stackSnippets,
    hasCanvasFingerprint: hasCanvas,
    hasAudioFingerprint: hasAudio,
    hasWebGLFingerprint: hasWebGL,
    isFingerprintingDetected: hasFingerprinting,
  };
}
