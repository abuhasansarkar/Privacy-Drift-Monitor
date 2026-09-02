# Module 25 — WordPress Agency Companion Plugin

> **Tier:** V3 · **Package:** `plugins/wordpress`  
> **Status:** 🟡 Roadmap (V3)

---

## 1. Objective & Business Pain
Over 60% of agency care plan websites are built on WordPress. Installing a companion plugin allows agencies to verify site ownership easily, display monitoring badges in `wp-admin`, and trigger scans upon plugin/theme updates.

## 2. Architecture & Security Invariant
* **Crucial Rule:** The WordPress plugin **never** executes browser crawling or scanning logic in PHP. It is a lightweight client communicating with the cloud platform API.
* **Core Capabilities:**
  1. **Domain Ownership Verification:** Automatically inserts and serves a verification token.
  2. **Admin Dashboard Widget:** Shows the current Privacy Monitoring Score and open issue count.
  3. **Automatic Scan Trigger:** Hooks into `upgrader_process_complete` to trigger a verification scan whenever WordPress core, plugins, or themes are updated.
  4. **Deep-Linking:** Single-click navigation from `wp-admin` directly into the agency dashboard issue view.

## 3. Key Files
* `plugins/wordpress/privacy-drift-monitor.php`: Plugin entry point.
* `plugins/wordpress/includes/class-pdm-api.php`: Authenticated REST client.
* `plugins/wordpress/includes/class-pdm-hooks.php`: Update hooks triggering verification scans.

## 4. Acceptance Criteria
* **Given** a client site running the companion plugin,
* **When** a developer updates WooCommerce or a contact form plugin,
* **Then** the plugin automatically requests a scan via the PDM API,
* **And** any resulting privacy drift is caught within minutes of deployment.
