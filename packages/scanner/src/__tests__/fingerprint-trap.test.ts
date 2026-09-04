import { describe, expect, it } from "vitest";
import {
  FINGERPRINT_TRAP_SCRIPT,
  parseFingerprintCalls,
  type RecordedFingerprintCall,
} from "../instrumentation/fingerprint-trap";

describe("Browser Fingerprinting Trap (PDM-R045)", () => {
  it("provides valid JavaScript trap script with __pdm_fingerprint_calls array initialization", () => {
    expect(FINGERPRINT_TRAP_SCRIPT).toContain("window.__pdm_fingerprint_calls");
    expect(FINGERPRINT_TRAP_SCRIPT).toContain("HTMLCanvasElement.prototype.toDataURL");
    expect(FINGERPRINT_TRAP_SCRIPT).toContain("AudioContext");
    expect(FINGERPRINT_TRAP_SCRIPT).toContain("WebGLRenderingContext");
  });

  it("parses empty fingerprint calls into clean fact object", () => {
    const fact = parseFingerprintCalls([]);
    expect(fact.hasFingerprinting).toBe(false);
    expect(fact.canvasAttempts).toBe(0);
    expect(fact.audioAttempts).toBe(0);
    expect(fact.webglAttempts).toBe(0);
    expect(fact.stackSnippets).toEqual([]);
  });

  it("correctly tallies canvas, audio, and webgl calls and extracts stack snippets", () => {
    const rawCalls: RecordedFingerprintCall[] = [
      {
        api: "canvas.toDataURL",
        timestamp: 100,
        stackSnippet: "at tracker.js:42:10",
      },
      {
        api: "canvas.getImageData",
        timestamp: 120,
        stackSnippet: "at tracker.js:55:12",
      },
      {
        api: "audio.createOscillator",
        timestamp: 150,
        stackSnippet: "at audio-fp.js:12:4",
      },
      {
        api: "webgl.readPixels",
        timestamp: 200,
        stackSnippet: "at gpu-detect.js:88:5",
      },
    ];

    const fact = parseFingerprintCalls(rawCalls);
    expect(fact.hasFingerprinting).toBe(true);
    expect(fact.canvasAttempts).toBe(2);
    expect(fact.audioAttempts).toBe(1);
    expect(fact.webglAttempts).toBe(1);
    expect(fact.stackSnippets).toHaveLength(4);
    expect(fact.stackSnippets).toContain("at tracker.js:42:10");
    expect(fact.stackSnippets).toContain("at audio-fp.js:12:4");
  });
});
