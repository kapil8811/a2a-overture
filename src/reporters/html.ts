/**
 * Shareable HTML compliance report generator.
 * Produces a self-contained HTML file with embedded styles and data.
 */

import { ComplianceReport } from '../core/types';
import { generateDetailedBadgeSvg } from './badge';

export function generateHtmlReport(report: ComplianceReport): string {
  const { summary } = report;
  const passRate = summary.total > 0 ? Math.round((summary.passed / summary.total) * 100) : 0;
  const verdict = summary.failed === 0 ? 'PASS' : 'FAIL';
  const verdictColor = summary.failed === 0 ? '#4caf50' : '#f44336';
  const badgeSvg = generateDetailedBadgeSvg(summary, report.agentName);
  const badgeBase64 = Buffer.from(badgeSvg).toString('base64');

  const testRows = report.tests.map(t => {
    const icon = t.result === 'pass' ? '✅' : t.result === 'fail' ? '❌' : t.result === 'warn' ? '⚠️' : '⏭️';
    const rowClass = t.result === 'fail' ? 'fail' : t.result === 'warn' ? 'warn' : t.result === 'skip' ? 'skip' : '';
    return `
        <tr class="${rowClass}">
          <td>${icon}</td>
          <td><strong>${escapeHtml(t.name)}</strong><br><small>${escapeHtml(t.description)}</small></td>
          <td>${t.result.toUpperCase()}</td>
          <td>${t.duration ? t.duration + 'ms' : '-'}</td>
          <td>${t.message ? escapeHtml(t.message) : ''}</td>
        </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>A2A Compliance Report — ${escapeHtml(report.agentName || report.agentUrl)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; line-height: 1.6; }
    .container { max-width: 960px; margin: 0 auto; padding: 2rem 1rem; }
    
    .header { text-align: center; margin-bottom: 2rem; }
    .header h1 { color: #58a6ff; font-size: 1.8rem; margin-bottom: 0.5rem; }
    .header .subtitle { color: #8b949e; font-size: 0.9rem; }
    
    .verdict { text-align: center; margin: 2rem 0; padding: 1.5rem; border-radius: 12px; background: #161b22; border: 1px solid #30363d; }
    .verdict .badge { font-size: 2rem; font-weight: bold; color: ${verdictColor}; }
    .verdict .rate { font-size: 1.2rem; color: #8b949e; margin-top: 0.5rem; }
    
    .badge-container { text-align: center; margin: 1.5rem 0; }
    .badge-container img { max-width: 280px; }
    .badge-embed { margin-top: 0.5rem; }
    .badge-embed code { background: #161b22; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; color: #8b949e; word-break: break-all; cursor: pointer; display: inline-block; max-width: 100%; border: 1px solid #30363d; }
    .badge-embed code:hover { border-color: #58a6ff; }
    
    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 2rem 0; }
    .meta-item { background: #161b22; padding: 1rem; border-radius: 8px; border: 1px solid #30363d; }
    .meta-item .label { color: #8b949e; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; }
    .meta-item .value { color: #c9d1d9; font-size: 1.1rem; font-weight: 600; margin-top: 0.25rem; }
    
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin: 2rem 0; }
    .stat { text-align: center; padding: 1rem; border-radius: 8px; background: #161b22; border: 1px solid #30363d; }
    .stat .num { font-size: 1.5rem; font-weight: bold; }
    .stat .label { font-size: 0.8rem; color: #8b949e; margin-top: 0.25rem; }
    .stat.pass .num { color: #4caf50; }
    .stat.fail .num { color: #f44336; }
    .stat.warn .num { color: #ff9800; }
    .stat.skip .num { color: #8b949e; }
    
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th { background: #161b22; color: #8b949e; text-align: left; padding: 0.75rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #30363d; }
    td { padding: 0.75rem; border-bottom: 1px solid #21262d; vertical-align: top; }
    td small { color: #8b949e; }
    tr.fail { background: rgba(244,67,54,0.05); }
    tr.warn { background: rgba(255,152,0,0.05); }
    tr.skip { opacity: 0.6; }
    tr:hover { background: #161b22; }
    
    .section { margin: 2rem 0; }
    .section h2 { color: #58a6ff; font-size: 1.2rem; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid #30363d; }
    
    .footer { text-align: center; margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #21262d; color: #8b949e; font-size: 0.8rem; }
    .footer a { color: #58a6ff; text-decoration: none; }
    
    .share-section { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1.5rem; margin: 2rem 0; }
    .share-section h3 { color: #c9d1d9; margin-bottom: 1rem; }
    .share-code { background: #0d1117; border: 1px solid #30363d; border-radius: 4px; padding: 0.75rem; font-family: monospace; font-size: 0.8rem; color: #c9d1d9; overflow-x: auto; margin: 0.5rem 0; cursor: pointer; }
    .share-code:hover { border-color: #58a6ff; }
    .share-label { font-size: 0.8rem; color: #8b949e; margin-top: 0.75rem; }
    
    @media (max-width: 600px) {
      .stats { grid-template-columns: repeat(2, 1fr); }
      .meta { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎵 A2A Overture Compliance Report</h1>
      <div class="subtitle">Agent-to-Agent Protocol Compliance Certification</div>
    </div>

    <div class="verdict">
      <div class="badge">${verdict}</div>
      <div class="rate">${passRate}% compliance rate &middot; ${summary.passed}/${summary.total} tests passed</div>
    </div>
    
    <div class="badge-container">
      <img src="data:image/svg+xml;base64,${badgeBase64}" alt="A2A Compliance Badge" />
    </div>

    <div class="meta">
      <div class="meta-item">
        <div class="label">Agent</div>
        <div class="value">${escapeHtml(report.agentName || 'Unknown')}</div>
      </div>
      <div class="meta-item">
        <div class="label">URL</div>
        <div class="value">${escapeHtml(report.agentUrl)}</div>
      </div>
      <div class="meta-item">
        <div class="label">Protocol Version</div>
        <div class="value">A2A v${escapeHtml(report.protocolVersion)}</div>
      </div>
      <div class="meta-item">
        <div class="label">Tested</div>
        <div class="value">${escapeHtml(report.timestamp)}</div>
      </div>
      <div class="meta-item">
        <div class="label">Duration</div>
        <div class="value">${report.duration}ms</div>
      </div>
    </div>

    <div class="stats">
      <div class="stat pass"><div class="num">${summary.passed}</div><div class="label">Passed</div></div>
      <div class="stat fail"><div class="num">${summary.failed}</div><div class="label">Failed</div></div>
      <div class="stat warn"><div class="num">${summary.warnings}</div><div class="label">Warnings</div></div>
      <div class="stat skip"><div class="num">${summary.skipped}</div><div class="label">Skipped</div></div>
    </div>

    <div class="section">
      <h2>Test Results</h2>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Test</th>
            <th>Result</th>
            <th>Duration</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${testRows}
        </tbody>
      </table>
    </div>
    
    <div class="share-section">
      <h3>📋 Share Your Results</h3>
      <div class="share-label">Markdown badge (for README):</div>
      <div class="share-code" onclick="navigator.clipboard.writeText(this.textContent)">![A2A Certified](a2a-badge.svg)</div>
      <div class="share-label">JSON Report (for CI/CD):</div>
      <div class="share-code" onclick="navigator.clipboard.writeText(this.textContent)">overture certify ${escapeHtml(report.agentUrl)} --json --save report.json</div>
    </div>

    <div class="footer">
      Generated by <a href="https://github.com/a2a-overture">A2A Overture</a> &middot; ${escapeHtml(report.timestamp)}
    </div>

    <!-- Embedded report data for machine consumption -->
    <script type="application/json" id="compliance-data">
${JSON.stringify(report, null, 2)}
    </script>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
