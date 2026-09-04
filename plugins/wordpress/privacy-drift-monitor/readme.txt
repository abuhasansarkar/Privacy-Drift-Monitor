=== Privacy Drift Monitor Companion ===
Contributors: privacydriftmonitor
Tags: privacy, gdpr, consent, cookies, drift, monitoring
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Official companion plugin for Privacy Drift Monitor. Provides automated scan triggering on updates, site ownership verification, and client health dashboard widgets.

== Description ==

Privacy Drift Monitor Companion connects your WordPress site directly to your agency's Privacy Drift Monitor workspace.

= Features =
* **Automated Post-Update Scans:** Triggers an immediate technical verification scan whenever plugins, themes, or core updates are applied via `upgrader_process_complete`.
* **Site Ownership Verification:** Seamless automated token endpoint (`?pdm_verify=<token>`) and header meta tags.
* **Dashboard Health Widget:** Displays the latest Privacy Health Score and monitoring status directly in wp-admin.
* **Zero Crawl Overhead:** The plugin never executes browser crawls or scans in PHP; all monitoring is offloaded to the isolated cloud engine.

== Installation ==

1. Upload the `privacy-drift-monitor` folder to the `/wp-content/plugins/` directory.
2. Activate the plugin through the 'Plugins' menu in WordPress.
3. Go to **Settings > Privacy Drift Monitor** to enter your API Key and Website ID.
4. Save changes and verify connectivity.

== Frequently Asked Questions ==

= Does this plugin scan my website in PHP? =
No. The plugin is an ultra-lightweight REST API client. All scans are executed by Privacy Drift Monitor's isolated Playwright headless browser cluster.

= Where do I get an API Key? =
Agency administrators can generate an API key from the Agency Settings > Developer API section of Privacy Drift Monitor.
