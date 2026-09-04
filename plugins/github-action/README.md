# Privacy Drift Pre-Deploy Guard (GitHub Action)

Continuous privacy drift detection and consent compliance guard for CI/CD workflows.

Automatically executes an isolated real-browser scan across multiple consent states (no consent, Reject All, Accept All, withdraw) on your pull request preview environments before code merges to production.

## Features

- **Pre-Deploy Pull Request Gate:** Fails the pull request if newly added scripts fire marketing trackers or set cookies before consent.
- **Score Regression Threshold:** Blocks deployments if the privacy health score drops below your configured threshold (default: 85).
- **Rich Markdown Step Summary:** Generates clear table summaries with direct links to technical evidence in your Privacy Drift Monitor dashboard.

## Usage

Add this step to your GitHub Actions PR deployment pipeline:

```yaml
name: Preview Deployment & Privacy Audit

on:
  pull_request:
    branches: [main]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy Preview Environment
        id: deploy
        run: |
          # Your preview deployment command (e.g. Vercel, Netlify, Cloudflare Pages)
          echo "preview_url=https://preview-pr-${{ github.event.number }}.example.com" >> $GITHUB_OUTPUT

      - name: Run Privacy Drift Guard
        uses: pdm-audit/privacy-drift-action@v1
        with:
          api_key: ${{ secrets.PDM_API_KEY }}
          website_url: ${{ steps.deploy.outputs.preview_url }}
          fail_below_score: 85
          block_pre_consent_trackers: true
          wait_for_scan: true
          timeout_seconds: 180
```

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `api_key` | **Yes** | — | Agency API key from PDM Settings |
| `website_url` | No* | — | Target URL or preview environment URL |
| `website_id` | No* | — | PDM website UUID (alternative to `website_url`) |
| `api_url` | No | `https://app.privacy-drift-monitor.com` | Base URL of PDM instance |
| `fail_below_score` | No | `85` | Minimum health score required to pass |
| `block_pre_consent_trackers` | No | `true` | Fail if pre-consent trackers detected |
| `wait_for_scan` | No | `true` | Wait for scan completion |
| `timeout_seconds` | No | `180` | Max seconds to poll for scan completion |

*\* Either `website_url` or `website_id` must be provided.*
