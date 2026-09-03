/**
 * THE PRE-HYDRATION THEME SCRIPT — PLAN.md §3.3, §11.3, §10.1.
 *
 * ⚠️ THIS STRING LIVES HERE, AWAY FROM THE COMPONENT THAT RENDERS IT, BECAUSE
 * `src/proxy.ts` MUST HASH IT. The strict Content-Security-Policy allows this
 * one inline script by `'sha256-…'` rather than by nonce, and a hash is only
 * safe to hard-wire if the bytes it covers cannot drift from the bytes that
 * ship. Importing the same constant into both places is what makes that true.
 *
 * ⚠️ NO `"use client"` AND NO NODE IMPORTS IN THIS FILE. It is imported by a
 * client component (`theme-provider.tsx`) AND by the proxy, which runs on the
 * Node runtime. Adding `node:crypto` here would pull it into the browser
 * bundle; adding `"use client"` would break the proxy. The hashing happens in
 * `proxy.ts`, which is server-only by construction.
 *
 * ⚠️ EDITING THE SCRIPT CHANGES ITS HASH, AND THAT IS HANDLED AUTOMATICALLY —
 * the proxy derives the hash from this constant at module load, so the policy
 * always follows the script. What is NOT automatic is a SECOND inline script
 * appearing somewhere under the strict policy: that one gets refused by the
 * browser with no error anyone sees. `src/__tests__/inline-scripts.test.ts`
 * holds that line.
 */

export const THEME_STORAGE_KEY = "pdm-theme";

/**
 * Applies the stored theme choice BEFORE hydration, so a dark-mode reader
 * never sees a white flash.
 *
 * Dependency-free and resilient to a blocked `localStorage` (private mode
 * throws on access rather than returning null).
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}`;
