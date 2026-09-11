/**
 * ENV DRIFT GATE — dev-doc/tasks/T05-env-drift.md.
 *
 * Compares the KEYS in `.env.example` against the keys in `.env` and fails if
 * the contract file declares something the local environment does not have.
 *
 * ⚠️ IT COMPARES KEYS, NEVER VALUES, AND PRINTS NEITHER. `.env` holds real
 * credentials; a gate that echoed a value would put secrets into CI logs and
 * terminal scrollback, which is a worse defect than the drift it detects.
 *
 * ⚠️ THE FAILURE THIS EXISTS TO CATCH IS SILENT, NOT LOUD. `PORTAL_TOKEN_SECRET`
 * was missing from `.env` for an unknown length of time. One of its three call
 * sites throws — that one is findable. The other two fall back to an EMPTY
 * salt and keep working, so IP hashes were being computed unsalted while every
 * page rendered correctly and every gate passed. A missing variable that breaks
 * loudly needs no gate; a missing variable that quietly downgrades a security
 * control is exactly what does.
 *
 * `.env.example` is the contract. A key that is genuinely optional belongs in
 * OPTIONAL below with the reason, not omitted from the example file — otherwise
 * the next person cannot tell "not needed" from "nobody wrote it down".
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

/**
 * Keys allowed to be absent, and why.
 *
 * Everything here must degrade to a DOCUMENTED, SAFE state when unset — not
 * merely a state that happens not to crash.
 */
const OPTIONAL: Record<string, string> = {
  STRIPE_PORTAL_CONFIGURATION_ID: "Stripe uses the account default portal when unset.",
  OTEL_EXPORTER_OTLP_ENDPOINT: "No OTLP collector in local development.",
  NEXT_PUBLIC_POSTHOG_KEY: "Product analytics is off locally.",
  NEXT_PUBLIC_POSTHOG_HOST: "Paired with NEXT_PUBLIC_POSTHOG_KEY.",
  SENTRY_DSN: "Sentry stays uninitialised locally rather than half-configured.",
  NEXT_PUBLIC_SENTRY_DSN: "Browser half of SENTRY_DSN.",
};

/**
 * Keys that must be present AND non-empty.
 *
 * An empty value is the dangerous case for these: each one silently weakens a
 * control rather than failing, which is how the original defect survived.
 *
 * ⚠️ PRODUCTION-ONLY REQUIREMENTS (F-009) are checked separately below, because
 * this gate runs in local development where a Turnstile secret legitimately
 * does not exist (the challenge is allowed to be off in dev — but not to be
 * silently off in production).
 */
const MUST_BE_SET = ["PORTAL_TOKEN_SECRET", "DATABASE_URL", "REDIS_URL"];

/** Required in production; optional in development with a logged warning. */
const PRODUCTION_REQUIRED: Record<string, string> = {
  TURNSTILE_SECRET_KEY:
    "Without it the free scanner's Turnstile challenge silently disables — the remaining abuse controls are the per-domain limit and the (now unspoofable) per-IP budgets.",
  FREE_SCAN_IP_SALT:
    "Without it hashIp falls back to an empty salt, making the free scanner's per-IP identity unsalted.",
};

function parseKeys(path: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match) out.set(match[1]!, match[2]!.trim());
  }
  return out;
}

const examplePath = join(ROOT, ".env.example");
const envPath = join(ROOT, ".env");

if (!existsSync(examplePath)) {
  console.error("✖ .env.example is missing — it is the contract this gate reads.");
  process.exit(1);
}

if (!existsSync(envPath)) {
  console.log("• No .env file — skipping (CI supplies variables directly).");
  process.exit(0);
}

const example = parseKeys(examplePath);
const env = parseKeys(envPath);

const missing = [...example.keys()].filter((k) => !env.has(k) && !(k in OPTIONAL));
const empty = MUST_BE_SET.filter((k) => !env.get(k));
const undeclared = [...env.keys()].filter((k) => !example.has(k));

for (const key of missing) {
  console.error(`✖ ${key} is in .env.example but not in .env`);
}
for (const key of empty) {
  console.error(`✖ ${key} is present but EMPTY — it must be set`);
}
// Not a failure: a local override is legitimate. But an undeclared key is how
// a variable ends up used in code and absent from the contract, so it is named.
for (const key of undeclared) {
  console.warn(`• ${key} is in .env but not documented in .env.example`);
}

if (missing.length > 0 || empty.length > 0) {
  console.error(
    `\n✖ Environment drift: ${missing.length} missing, ${empty.length} empty.\n` +
      `  .env.example is the contract. Add the key there if it is new, or to\n` +
      `  OPTIONAL in scripts/check-env.ts if it is genuinely optional — with the\n` +
      `  reason it is safe to omit.`,
  );
  process.exit(1);
}

/*
 * ⚠️ PRODUCTION GATE (F-009). The free scanner's abuse controls depend on the
 * Turnstile secret and the IP salt being set; unset, the challenge silently
 * disables and per-IP hashes degrade to unsalted. Development keeps working —
 * the keys are optional there by design — but a production deployment without
 * them is a configuration failure, not a default.
 */
if (process.env.NODE_ENV === "production") {
  const prodMissing = Object.keys(PRODUCTION_REQUIRED).filter((k) => !env.get(k));
  for (const key of prodMissing) {
    console.error(`✖ ${key} is required in production — ${PRODUCTION_REQUIRED[key]}`);
  }
  if (prodMissing.length > 0) {
    console.error(
      `\n✖ ${prodMissing.length} production-required variable(s) unset. The free\n` +
        `  scanner's abuse controls fail open without them.`,
    );
    process.exit(1);
  }
} else {
  for (const key of Object.keys(PRODUCTION_REQUIRED)) {
    if (!env.get(key)) {
      console.warn(`• ${key} unset — acceptable in development, REQUIRED in production.`);
    }
  }
}

console.log(
  `✔ Environment check passed (${example.size} declared, ${Object.keys(OPTIONAL).length} optional).`,
);
