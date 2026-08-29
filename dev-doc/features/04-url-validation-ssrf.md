# Feature 04 — URL Validation & SSRF Guard

> **Phase:** 1 · **Priority:** P0 · **Effort:** M · **Value:** 5
> **Status:** ⬜ Not started
> **⚠️ Security-critical. Low probability, Critical impact (§12.7).**
> **Plan refs:** Part X §10.3 (SSRF), Part III §3.6 (error matrix), Part XII §12.1

## What it is

`packages/scanner/src/net/guard.ts` — `assertSafeUrl(url): Promise<PinnedTarget>`. The module
that stands between a user-supplied string and a browser that will fetch it.

## Why it exists

The product's entire job is to load URLs supplied by users — including, on the free scanner,
by **anonymous** users. Without this guard the product is a hosted SSRF-as-a-service that will
be used to reach cloud metadata endpoints and internal networks.

## Dependencies

None. **Build this before anything accepts a URL** — features 03, 05 and 18 all sit on top
of it.

## Scope

**In:** scheme validation · DNS resolution · private/loopback/link-local/metadata IP rejection ·
**IP pinning** · **revalidation on every redirect hop** · redirect-depth limit · the full test
vector suite · reachability probing · normalization.

**Out:** the egress firewall itself (infrastructure, Phase 7) — but note it is the *fallback*
that holds if this module has a bug.

## Build steps

- [ ] Scheme allowlist: `http` and `https` only
- [ ] Parse and normalize before resolving (see feature 03 for normalization rules)
- [ ] DNS resolve to all A/AAAA records
- [ ] Reject if **any** resolved address is private, loopback, link-local, unique-local,
      multicast, reserved, or a cloud metadata address (169.254.169.254 and equivalents)
- [ ] **Pin the validated IP** and connect to that address — resolving twice invites a
      DNS-rebinding race between check and use
- [ ] **Re-run the entire guard on every redirect hop**, not just the initial URL. A redirect
      to `http://169.254.169.254/` is the classic bypass
- [ ] Cap redirect depth at 3
- [ ] Reachability probe: DNS + HEAD/GET, classifying DNS failure, TLS failure, 4xx/5xx,
      redirect, and bot challenge distinctly
- [ ] Wire into: the add-website Server Action, every scan navigation, and the free scanner
- [ ] **Test vector suite** — decimal/octal/hex IP encodings, IPv6-mapped IPv4, `0.0.0.0`,
      `[::1]`, DNS names resolving to private space, redirect chains into private space,
      userinfo tricks (`http://evil.com@127.0.0.1/`), and metadata endpoints

## User-facing messages

The block message is **deliberately vague**: *"We can't monitor this address."* Do not tell an
attacker which check failed. Every other condition gets a specific, helpful message — the full
matrix is Part III §3.6.

Log every SSRF block as a **security event** with the actual reason.

## Acceptance criteria

- [ ] All SSRF vectors in the suite are blocked
- [ ] Redirect hops are revalidated — a redirect into private space is blocked
- [ ] A blocked address logs a security event and returns the vague message
- [ ] DNS NXDOMAIN, TLS failure, 401/403, bot challenge and redirect-to-other-domain each
      produce their own distinct user message
- [ ] The guard is applied identically on authenticated and anonymous (free scanner) paths

## Tests required

| Level | What |
|---|---|
| Unit | The full SSRF vector suite. **This is a coverage-gated module (≥85% on `packages/scanner`)** |
| Unit | URL normalization and the validation error matrix |
| Security | Manual vector suite pre-release and quarterly |

## Failure modes

| Mode | Handling |
|---|---|
| DNS times out | Treat as unreachable, allow-with-warning on add; fail the scan with a retryable class |
| DNS returns mixed public/private | **Reject** — any private address in the set is a block |
| Site resolves publicly but redirects internally | Blocked at the hop revalidation |

## Defence in depth

The app-level guard is **layer one**. Layer two is an infrastructure egress firewall on the
scanner workers, and layer three is having **no metadata credentials on scanner workers at
all**. The risk register's fallback is explicit: "egress firewall holds even if the app guard
has a bug." Do not treat any one layer as sufficient.
