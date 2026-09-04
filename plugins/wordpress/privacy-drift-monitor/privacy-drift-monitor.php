<?php
/**
 * Plugin Name:       Privacy Drift Monitor Companion
 * Plugin URI:        https://privacy-drift-monitor.com
 * Description:       Official companion plugin for Privacy Drift Monitor. Provides automated scan triggering on updates, site ownership verification, and client health dashboard widgets.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            Privacy Drift Monitor
 * Author URI:        https://privacy-drift-monitor.com
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       privacy-drift-monitor
 */

if (!defined('ABSPATH')) {
    exit;
}

define('PDM_PLUGIN_VERSION', '1.0.0');
define('PDM_OPTION_KEY', 'pdm_settings');

/**
 * Get plugin options with default fallbacks.
 *
 * @return array
 */
function pdm_get_options(): array {
    $defaults = [
        'api_url'            => 'https://app.privacy-drift-monitor.com',
        'api_key'            => '',
        'website_id'         => '',
        'verification_token' => '',
        'portal_url'         => '',
    ];
    $options = get_option(PDM_OPTION_KEY, []);
    return wp_parse_args(is_array($options) ? $options : [], $defaults);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Site Verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle verification request via ?pdm_verify=<token>
 */
add_action('init', function () {
    if (!isset($_GET['pdm_verify'])) {
        return;
    }

    $provided = sanitize_text_field(wp_unslash($_GET['pdm_verify']));
    $options = pdm_get_options();
    $expected = trim($options['verification_token']);

    if (!empty($expected) && hash_equals($expected, $provided)) {
        wp_send_json_success([
            'verified'   => true,
            'website_id' => $options['website_id'],
            'version'    => PDM_PLUGIN_VERSION,
        ]);
    } else {
        wp_send_json_error([
            'verified' => false,
            'message'  => 'Invalid or unset verification token',
        ], 403);
    }
});

/**
 * Render verification meta tag in site header.
 */
add_action('wp_head', function () {
    $options = pdm_get_options();
    $token = trim($options['verification_token']);
    if (!empty($token)) {
        echo sprintf(
            '<meta name="pdm-verification" content="%s" />' . "\n",
            esc_attr($token)
        );
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Automatic Scan Trigger on Plugin / Theme Updates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trigger an on-demand scan whenever themes, plugins, or core are updated.
 *
 * @param object $upgrader_object
 * @param array  $options
 */
add_action('upgrader_process_complete', function ($upgrader_object, $options) {
    pdm_trigger_scan('UPDATE_TRIGGERED');
}, 10, 2);

/**
 * Send scan trigger request to PDM Public REST API v1.
 *
 * @param string $reason
 * @return array|WP_Error
 */
function pdm_trigger_scan(string $reason = 'MANUAL'): array|WP_Error {
    $options = pdm_get_options();
    $api_url = rtrim($options['api_url'], '/');
    $api_key = trim($options['api_key']);
    $website_id = trim($options['website_id']);

    if (empty($api_key) || empty($website_id)) {
        return new WP_Error('pdm_not_configured', 'API Key and Website ID must be configured.');
    }

    $endpoint = "{$api_url}/api/v1/websites/{$website_id}/scans";

    $response = wp_remote_post($endpoint, [
        'timeout' => 15,
        'headers' => [
            'Authorization' => "Bearer {$api_key}",
            'Content-Type'  => 'application/json',
            'Accept'        => 'application/json',
            'User-Agent'    => 'PDM-WordPress/' . PDM_PLUGIN_VERSION,
        ],
        'body'    => wp_json_encode([
            'trigger' => $reason,
        ]),
    ]);

    // Invalidate dashboard widget transient cache so the next view gets updated info
    delete_transient('pdm_dashboard_health');

    return $response;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Admin Dashboard Widget
// ─────────────────────────────────────────────────────────────────────────────

add_action('wp_dashboard_setup', function () {
    if (!current_user_can('manage_options')) {
        return;
    }

    wp_add_dashboard_widget(
        'pdm_dashboard_widget',
        __('Privacy Drift Monitor — Site Health', 'privacy-drift-monitor'),
        'pdm_render_dashboard_widget'
    );
});

/**
 * Fetch and render site health status in wp-admin dashboard.
 */
function pdm_render_dashboard_widget() {
    $options = pdm_get_options();

    if (empty($options['api_key']) || empty($options['website_id'])) {
        echo '<p>' . esc_html__('Configure your API Key and Website ID in Settings > Privacy Drift Monitor to view site privacy status.', 'privacy-drift-monitor') . '</p>';
        echo '<p><a href="' . esc_url(admin_url('options-general.php?page=pdm-settings')) . '" class="button button-primary">' . esc_html__('Configure Plugin', 'privacy-drift-monitor') . '</a></p>';
        return;
    }

    $data = get_transient('pdm_dashboard_health');
    if ($data === false) {
        $api_url = rtrim($options['api_url'], '/');
        $endpoint = "{$api_url}/api/v1/websites/{$options['website_id']}";

        $res = wp_remote_get($endpoint, [
            'timeout' => 10,
            'headers' => [
                'Authorization' => "Bearer {$options['api_key']}",
                'Accept'        => 'application/json',
            ],
        ]);

        if (!is_wp_error($res) && wp_remote_retrieve_response_code($res) === 200) {
            $body = json_decode(wp_remote_retrieve_body($res), true);
            if (isset($body['data'])) {
                $data = $body['data'];
                set_transient('pdm_dashboard_health', $data, 15 * MINUTE_IN_SECONDS);
            }
        }
    }

    if (!$data) {
        echo '<p style="color:#d63638;">' . esc_html__('Unable to reach Privacy Drift Monitor API. Please check your settings.', 'privacy-drift-monitor') . '</p>';
        return;
    }

    $health = $data['healthScore'] ?? null;
    $status = $data['monitoringStatus'] ?? 'ACTIVE';
    $scoreColor = '#22c55e';
    if ($health !== null && $health < 75) {
        $scoreColor = $health < 50 ? '#ef4444' : '#f59e0b';
    }

    echo '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:15px;">';
    echo '<div>';
    echo '<span style="font-size:12px; text-transform:uppercase; color:#64748b; font-weight:600; display:block;">' . esc_html__('Health Score', 'privacy-drift-monitor') . '</span>';
    echo '<span style="font-size:32px; font-weight:700; color:' . esc_attr($scoreColor) . ';">' . ($health !== null ? esc_html($health) : '—') . '</span>';
    echo '</div>';
    echo '<div style="text-align:right;">';
    echo '<span style="font-size:12px; text-transform:uppercase; color:#64748b; font-weight:600; display:block;">' . esc_html__('Monitoring Status', 'privacy-drift-monitor') . '</span>';
    echo '<span style="font-weight:600; color:#0f172a;">' . esc_html($status) . '</span>';
    echo '</div>';
    echo '</div>';

    echo '<div style="margin-top:10px; padding-top:10px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">';
    if (!empty($options['portal_url'])) {
        echo '<a href="' . esc_url($options['portal_url']) . '" target="_blank" rel="noopener" class="button">' . esc_html__('Open Client Portal →', 'privacy-drift-monitor') . '</a>';
    }
    echo '<a href="' . esc_url(admin_url('options-general.php?page=pdm-settings')) . '" class="button-link">' . esc_html__('Settings', 'privacy-drift-monitor') . '</a>';
    echo '</div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Admin Settings Page
// ─────────────────────────────────────────────────────────────────────────────

add_action('admin_menu', function () {
    add_options_page(
        __('Privacy Drift Monitor', 'privacy-drift-monitor'),
        __('Privacy Drift Monitor', 'privacy-drift-monitor'),
        'manage_options',
        'pdm-settings',
        'pdm_render_settings_page'
    );
});

add_action('admin_init', function () {
    register_setting('pdm_settings_group', PDM_OPTION_KEY);
});

function pdm_render_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }

    $options = pdm_get_options();
    $message = '';

    // Handle manual scan dispatch
    if (isset($_POST['pdm_trigger_manual_scan']) && check_admin_referer('pdm_manual_scan_action')) {
        $result = pdm_trigger_scan('MANUAL');
        if (is_wp_error($result)) {
            $message = '<div class="notice notice-error"><p>' . esc_html($result->get_error_message()) . '</p></div>';
        } else {
            $code = wp_remote_retrieve_response_code($result);
            if ($code === 202) {
                $message = '<div class="notice notice-success"><p>' . esc_html__('Scan request accepted and enqueued successfully!', 'privacy-drift-monitor') . '</p></div>';
            } else {
                $message = '<div class="notice notice-error"><p>' . sprintf(esc_html__('Scan request returned status %d', 'privacy-drift-monitor'), $code) . '</p></div>';
            }
        }
    }

    ?>
    <div class="wrap">
        <h1><?php echo esc_html__('Privacy Drift Monitor Settings', 'privacy-drift-monitor'); ?></h1>
        <?php echo $message; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>

        <form method="post" action="options.php">
            <?php
            settings_fields('pdm_settings_group');
            ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row">
                        <label for="pdm_api_url"><?php echo esc_html__('API Base URL', 'privacy-drift-monitor'); ?></label>
                    </th>
                    <td>
                        <input name="<?php echo esc_attr(PDM_OPTION_KEY); ?>[api_url]" type="url" id="pdm_api_url" value="<?php echo esc_attr($options['api_url']); ?>" class="regular-text" required />
                        <p class="description"><?php echo esc_html__('Privacy Drift Monitor REST API base URL (e.g. https://app.privacy-drift-monitor.com).', 'privacy-drift-monitor'); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row">
                        <label for="pdm_api_key"><?php echo esc_html__('API Key', 'privacy-drift-monitor'); ?></label>
                    </th>
                    <td>
                        <input name="<?php echo esc_attr(PDM_OPTION_KEY); ?>[api_key]" type="password" id="pdm_api_key" value="<?php echo esc_attr($options['api_key']); ?>" class="regular-text" required />
                        <p class="description"><?php echo esc_html__('Agency REST API key generated in Agency Settings > Developer API.', 'privacy-drift-monitor'); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row">
                        <label for="pdm_website_id"><?php echo esc_html__('Website ID', 'privacy-drift-monitor'); ?></label>
                    </th>
                    <td>
                        <input name="<?php echo esc_attr(PDM_OPTION_KEY); ?>[website_id]" type="text" id="pdm_website_id" value="<?php echo esc_attr($options['website_id']); ?>" class="regular-text" required />
                        <p class="description"><?php echo esc_html__('The UUID of this website in Privacy Drift Monitor.', 'privacy-drift-monitor'); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row">
                        <label for="pdm_verification_token"><?php echo esc_html__('Verification Token', 'privacy-drift-monitor'); ?></label>
                    </th>
                    <td>
                        <input name="<?php echo esc_attr(PDM_OPTION_KEY); ?>[verification_token]" type="text" id="pdm_verification_token" value="<?php echo esc_attr($options['verification_token']); ?>" class="regular-text" />
                        <p class="description"><?php echo esc_html__('Token for automated site verification endpoint (?pdm_verify=token).', 'privacy-drift-monitor'); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row">
                        <label for="pdm_portal_url"><?php echo esc_html__('Client Portal URL', 'privacy-drift-monitor'); ?></label>
                    </th>
                    <td>
                        <input name="<?php echo esc_attr(PDM_OPTION_KEY); ?>[portal_url]" type="url" id="pdm_portal_url" value="<?php echo esc_attr($options['portal_url']); ?>" class="regular-text" />
                        <p class="description"><?php echo esc_html__('Optional direct link to white-labeled client portal for wp-admin widget.', 'privacy-drift-monitor'); ?></p>
                    </td>
                </tr>
            </table>

            <?php submit_button(); ?>
        </form>

        <hr style="margin-top: 30px;" />
        <h2><?php echo esc_html__('On-Demand Scan Dispatch', 'privacy-drift-monitor'); ?></h2>
        <p><?php echo esc_html__('Manually request an immediate verification scan through the PDM Public REST API.', 'privacy-drift-monitor'); ?></p>
        <form method="post" action="">
            <?php wp_nonce_field('pdm_manual_scan_action'); ?>
            <input type="hidden" name="pdm_trigger_manual_scan" value="1" />
            <button type="submit" class="button button-secondary">
                <?php echo esc_html__('Trigger Scan Now', 'privacy-drift-monitor'); ?>
            </button>
        </form>
    </div>
    <?php
}
