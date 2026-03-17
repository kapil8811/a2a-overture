# GitHub Action: A2A Overture Compliance Check

Automatically verify your A2A agent's protocol compliance on every pull request.

## Quick Start

Add this to `.github/workflows/a2a-compliance.yml` in your repository:

```yaml
name: A2A Compliance Check
on:
  pull_request:
    branches: [main]

jobs:
  compliance:
    runs-on: ubuntu-latest
    steps:
      # 1. Start your A2A agent (customize this for your setup)
      - uses: actions/checkout@v4
      - name: Start agent
        run: |
          npm install
          npm start &
          sleep 5  # Wait for agent to be ready

      # 2. Run A2A Overture compliance check
      - name: A2A Compliance Check
        uses: a2a-overture/a2a-overture@v1
        with:
          agent-url: http://localhost:3000
          badge-output: a2a-badge.svg
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      # 3. Upload badge as artifact (optional)
      - name: Upload badge
        uses: actions/upload-artifact@v4
        with:
          name: a2a-badge
          path: a2a-badge.svg
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `agent-url` | ✅ | — | URL of the A2A agent to test |
| `binding` | | `HTTP+JSON` | Protocol binding: `HTTP+JSON` or `JSONRPC` |
| `auth-token` | | — | Authorization header (e.g., `Bearer my-token`) |
| `only` | | — | Comma-separated test IDs to run |
| `skip` | | — | Comma-separated test IDs to skip |
| `fail-on-warning` | | `false` | Treat warnings as failures |
| `badge-output` | | — | Path to save SVG compliance badge |
| `report-output` | | `a2a-compliance-report.json` | Path for JSON report |
| `comment-on-pr` | | `true` | Post results as PR comment |

## Outputs

| Output | Description |
|--------|-------------|
| `result` | `pass` or `fail` |
| `passed` | Number of tests passed |
| `failed` | Number of tests failed |
| `warnings` | Number of warnings |
| `skipped` | Number of skipped tests |
| `total` | Total test count |
| `report-json` | Full JSON report |
| `badge-url` | Path to generated badge |

## PR Comment

When `comment-on-pr` is enabled and `GITHUB_TOKEN` is set, the action posts a formatted compliance report as a PR comment:

![PR Comment Example](https://via.placeholder.com/600x300/0d1117/58a6ff?text=PR+Comment+Preview)

## Advanced: With Authentication

```yaml
- name: A2A Compliance Check
  uses: a2a-overture/a2a-overture@v1
  with:
    agent-url: http://localhost:3000
    auth-token: Bearer ${{ secrets.A2A_AUTH_TOKEN }}
    fail-on-warning: true
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Advanced: Run Specific Tests

```yaml
- name: A2A Compliance Check (card only)
  uses: a2a-overture/a2a-overture@v1
  with:
    agent-url: http://localhost:3000
    only: card-reachable,card-valid,card-required-fields
```

## Advanced: Use Results in Subsequent Steps

```yaml
- name: A2A Compliance
  id: a2a
  uses: a2a-overture/a2a-overture@v1
  with:
    agent-url: http://localhost:3000

- name: Check results
  if: steps.a2a.outputs.result == 'fail'
  run: echo "A2A compliance failed with ${{ steps.a2a.outputs.failed }} failures"
```

## Badge

After generating a badge, add it to your README:

```markdown
![A2A Certified](a2a-badge.svg)
```

Or use the registry-hosted badge:

```markdown
![A2A Certified](https://your-registry.com/api/entries/YOUR_ID/badge.svg)
```
