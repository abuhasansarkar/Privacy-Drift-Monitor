# Feature 25 — Multi-Region Geo-Proxy Mesh & Matrix Scanning

> **Phase:** 10 · **Priority:** P1 · **Effort:** L · **Value:** 5
> **Status:** 🟢 Complete — GeoEgressRegion enums, Jurisdiction models, EU/UK strict rules PDM-R026 to PDM-R030 implemented and verified.
> **Plan refs:** PLAN-V2 Part I, Part II §2.1, Part III (Rules PDM-R026–PDM-R030)

## What it is

The **Multi-Region Geo-Proxy Mesh** enables running browser scans through residential and datacenter egress nodes in key regulatory jurisdictions:
- `EU_CENTRAL_DE` (Frankfurt, Germany — GDPR/TDDDG benchmark)
- `EU_WEST_FR` (Paris, France — CNIL benchmark)
- `UK_LONDON` (London, UK — ICO/PECR benchmark)
- `US_WEST_CA` (Los Angeles, California — CCPA/CPRA benchmark)
- `US_EAST_VA` (Ashburn, US East — baseline US traffic)

It enables running **Geo-Matrix Comparison Scans** (`geo_matrix_scan`) to uncover geo-gated banners and location-dependent tracking scripts.

## Why it exists

Global websites frequently serve different cookie consent banners and ad tags based on visitor IP geolocation. A single scan from a US or German IP only sees one side of the website's technical reality.

## Dependencies

- Feature 04 (URL Validation & SSRF Guard)
- Feature 05 (Scan Engine)
- Feature 06 (Consent Engine)
- Feature 09 (Rule Engine)

## Deterministic Rules

| Rule ID | Category | Name & Trigger | Severity | Regulatory Benchmark |
|---|---|---|---|---|
| `PDM-R026` | `EU_GERMANY` | **Unconsented Analytics under Germany TDDDG §25**<br>Any analytics request or cookie firing pre-consent. | **High** | Germany DSK / TDDDG § 25 |
| `PDM-R027` | `EU_FRANCE` | **Cookie Retention Exceeds CNIL 13-Month Rule**<br>Non-essential cookie lifespan exceeds 395 days. | **Medium** | France CNIL Deliberations |
| `PDM-R028` | `EU_ITALY` | **Banner Close ("X") Does Not Block Tracking**<br>Clicking top-right banner close element still allows trackers. | **Critical** | Italy Garante Guidelines |
| `PDM-R029` | `CONSENT_MISSING` | **Cookie Wall / Forcible Gating Detected**<br>Website fully prevents scrolling or content access without consent. | **High** | EDPB Cookie Wall Guidelines |
| `PDM-R030` | `UK_PECR` | **Unconsented Marketing Tag via GTM Consent Mode Default**<br>GTM tags fire before user banner selection. | **Critical** | UK ICO PECR Guidance |

## Build steps

- [x] Add `GeoEgressRegion` and `Jurisdiction` enums to Prisma schema and Zod enums.
- [x] Create `WebsiteJurisdictionConfig` table storing primary and active jurisdiction profiles per monitored site.
- [x] Implement deterministic rules `PDM-R026`, `PDM-R027`, `PDM-R028`, `PDM-R029`, `PDM-R030` in `packages/analysis/src/rules/jurisdictions.ts`.
- [x] Register rules in `SCAN_RULES` with proper precedence ranks.
- [x] Support geo-region selection and comparative diff views in scan details.

## Acceptance criteria

- [x] Jurisdiction benchmarks are enforced as pure deterministic rules over browser recordings.
- [x] SSRF guard remains fully active across all geo-proxy routing nodes.
- [x] Banned compliance terminology is strictly prevented.
