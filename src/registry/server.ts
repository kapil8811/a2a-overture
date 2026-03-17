/**
 * A2A Overture Public Compliance Registry
 * 
 * A lightweight registry server where agents can publish their compliance results.
 * Stores results on disk as JSON files and serves a browsable web UI.
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ComplianceReport } from '../core/types';

export interface RegistryOptions {
  port: number;
  dataDir: string;
}

export interface RegistryEntry {
  id: string;
  report: ComplianceReport;
  submittedAt: string;
  submittedBy?: string;
}

const ENTRIES_FILE = 'registry.json';

function loadEntries(dataDir: string): RegistryEntry[] {
  const filePath = path.join(dataDir, ENTRIES_FILE);
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
}

function saveEntries(dataDir: string, entries: RegistryEntry[]): void {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(path.join(dataDir, ENTRIES_FILE), JSON.stringify(entries, null, 2), 'utf-8');
}

function generateRegistryHtml(entries: RegistryEntry[]): string {
  const sorted = [...entries].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  
  const agentRows = sorted.map(entry => {
    const r = entry.report;
    const passRate = r.summary.total > 0 ? Math.round((r.summary.passed / r.summary.total) * 100) : 0;
    const status = r.summary.failed === 0;
    const statusIcon = status ? '✅' : '❌';
    const statusText = status ? 'CERTIFIED' : 'FAILING';
    const statusClass = status ? 'certified' : 'failing';
    return `
          <tr class="${statusClass}" onclick="showDetail('${entry.id}')">
            <td>${statusIcon}</td>
            <td><strong>${escapeHtml(r.agentName || 'Unknown Agent')}</strong></td>
            <td><code>${escapeHtml(r.agentUrl)}</code></td>
            <td>v${escapeHtml(r.protocolVersion)}</td>
            <td>
              <span class="rate">${passRate}%</span>
              <small>(${r.summary.passed}/${r.summary.total})</small>
            </td>
            <td>${escapeHtml(new Date(entry.submittedAt).toLocaleDateString())}</td>
            <td><a href="/api/entries/${entry.id}/badge.svg" target="_blank">Badge</a></td>
          </tr>`;
  }).join('\n');

  const certified = sorted.filter(e => e.report.summary.failed === 0).length;
  const total = sorted.length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>A2A Overture — Public Compliance Registry</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; }
    .header { background: linear-gradient(135deg, #161b22 0%, #0d1117 100%); border-bottom: 1px solid #30363d; padding: 2rem 1rem; text-align: center; }
    .header h1 { color: #58a6ff; font-size: 2rem; margin-bottom: 0.5rem; }
    .header p { color: #8b949e; }
    
    .stats-bar { display: flex; justify-content: center; gap: 2rem; padding: 1.5rem; background: #161b22; border-bottom: 1px solid #30363d; }
    .stats-bar .stat { text-align: center; }
    .stats-bar .stat .num { font-size: 1.5rem; font-weight: bold; color: #58a6ff; }
    .stats-bar .stat .label { font-size: 0.8rem; color: #8b949e; }
    .stats-bar .stat.certified .num { color: #4caf50; }
    
    .container { max-width: 1100px; margin: 0 auto; padding: 2rem 1rem; }
    
    .actions { display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .actions input { flex: 1; min-width: 200px; padding: 0.6rem 1rem; background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; font-size: 0.9rem; }
    .actions input:focus { outline: none; border-color: #58a6ff; }
    
    table { width: 100%; border-collapse: collapse; }
    th { background: #161b22; color: #8b949e; text-align: left; padding: 0.75rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #30363d; position: sticky; top: 0; }
    td { padding: 0.75rem; border-bottom: 1px solid #21262d; }
    tr { cursor: pointer; transition: background 0.15s; }
    tr:hover { background: #161b22; }
    tr.certified td:first-child { color: #4caf50; }
    tr.failing td:first-child { color: #f44336; }
    td code { background: #161b22; padding: 2px 6px; border-radius: 3px; font-size: 0.85em; }
    .rate { font-weight: bold; }
    tr.certified .rate { color: #4caf50; }
    tr.failing .rate { color: #f44336; }
    td a { color: #58a6ff; text-decoration: none; }
    td a:hover { text-decoration: underline; }
    
    .empty { text-align: center; padding: 3rem; color: #8b949e; }
    .empty h3 { margin-bottom: 1rem; }
    .empty code { display: block; background: #161b22; padding: 1rem; border-radius: 6px; margin: 1rem auto; max-width: 600px; text-align: left; font-size: 0.85rem; }
    
    .detail-modal { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 100; overflow-y: auto; }
    .detail-content { max-width: 800px; margin: 2rem auto; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 2rem; }
    .detail-close { float: right; cursor: pointer; color: #8b949e; font-size: 1.5rem; background: none; border: none; }
    .detail-close:hover { color: #c9d1d9; }
    .detail-tests { margin-top: 1rem; }
    .detail-tests table { font-size: 0.9rem; }
    
    .how-to { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1.5rem; margin-top: 2rem; }
    .how-to h3 { color: #58a6ff; margin-bottom: 0.75rem; }
    .how-to code { display: block; background: #0d1117; padding: 0.75rem; border-radius: 4px; margin: 0.5rem 0; font-size: 0.85rem; overflow-x: auto; }
    .how-to p { color: #8b949e; font-size: 0.9rem; margin: 0.5rem 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎵 A2A Overture Registry</h1>
    <p>Public Compliance Registry for A2A Protocol Agents</p>
  </div>
  
  <div class="stats-bar">
    <div class="stat"><div class="num">${total}</div><div class="label">Registered Agents</div></div>
    <div class="stat certified"><div class="num">${certified}</div><div class="label">Certified</div></div>
    <div class="stat"><div class="num">${total - certified}</div><div class="label">In Progress</div></div>
  </div>

  <div class="container">
    <div class="actions">
      <input type="text" id="search" placeholder="Search agents..." oninput="filterRows(this.value)" />
    </div>

    ${sorted.length === 0 ? `
    <div class="empty">
      <h3>No agents registered yet</h3>
      <p>Be the first to publish your compliance results!</p>
      <code>overture certify https://your-agent.com --json --save report.json<br>overture registry publish report.json --registry http://localhost:3335</code>
    </div>
    ` : `
    <table id="registry-table">
      <thead>
        <tr>
          <th></th>
          <th>Agent</th>
          <th>URL</th>
          <th>Protocol</th>
          <th>Pass Rate</th>
          <th>Last Tested</th>
          <th>Badge</th>
        </tr>
      </thead>
      <tbody>
        ${agentRows}
      </tbody>
    </table>
    `}

    <div class="how-to">
      <h3>📤 Publish Your Results</h3>
      <p>1. Run the compliance suite and save the report:</p>
      <code>overture certify https://your-agent.com --json --save report.json</code>
      <p>2. Publish to this registry:</p>
      <code>overture registry publish report.json --registry ${`http://localhost:PORT`}</code>
      <p>3. Add the compliance badge to your README:</p>
      <code>![A2A Certified](REGISTRY_URL/api/entries/ENTRY_ID/badge.svg)</code>
    </div>
  </div>

  <div class="detail-modal" id="detail-modal" onclick="if(event.target===this)closeDetail()">
    <div class="detail-content" id="detail-content"></div>
  </div>

  <script>
    const entries = ${JSON.stringify(sorted.map(e => ({ id: e.id, report: e.report, submittedAt: e.submittedAt })))};
    
    function filterRows(q) {
      const rows = document.querySelectorAll('#registry-table tbody tr');
      const lower = q.toLowerCase();
      rows.forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(lower) ? '' : 'none';
      });
    }
    
    function showDetail(id) {
      const entry = entries.find(e => e.id === id);
      if (!entry) return;
      const r = entry.report;
      const tests = r.tests.map(t => {
        const icon = t.result === 'pass' ? '✅' : t.result === 'fail' ? '❌' : t.result === 'warn' ? '⚠️' : '⏭️';
        return '<tr><td>'+icon+'</td><td>'+esc(t.name)+'</td><td>'+t.result.toUpperCase()+'</td><td>'+(t.duration||'-')+'</td><td>'+(t.message?esc(t.message):'')+'</td></tr>';
      }).join('');
      document.getElementById('detail-content').innerHTML = 
        '<button class="detail-close" onclick="closeDetail()">&times;</button>' +
        '<h2>'+(r.agentName||'Unknown Agent')+'</h2>' +
        '<p style="color:#8b949e;margin:0.5rem 0">'+esc(r.agentUrl)+' &middot; A2A v'+r.protocolVersion+'</p>' +
        '<p style="margin:1rem 0;font-size:1.2rem">'+(r.summary.failed===0?'✅ CERTIFIED':'❌ FAILING')+' &middot; '+Math.round(r.summary.passed/r.summary.total*100)+'% pass rate</p>' +
        '<div class="detail-tests"><table><tr><th></th><th>Test</th><th>Result</th><th>Duration</th><th>Details</th></tr>'+tests+'</table></div>';
      document.getElementById('detail-modal').style.display = 'block';
    }
    
    function closeDetail() { document.getElementById('detail-modal').style.display = 'none'; }
    function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isValidReport(data: unknown): data is ComplianceReport {
  if (!data || typeof data !== 'object') return false;
  const r = data as Record<string, unknown>;
  return typeof r.agentUrl === 'string' &&
    typeof r.protocolVersion === 'string' &&
    typeof r.timestamp === 'string' &&
    typeof r.duration === 'number' &&
    r.summary !== undefined &&
    Array.isArray(r.tests);
}

export function createRegistryServer(options: RegistryOptions): http.Server {
  const { port, dataDir } = options;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // ─── Web UI ──────────────────────────────────────────
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const entries = loadEntries(dataDir);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(generateRegistryHtml(entries));
      return;
    }

    // ─── API: List entries ───────────────────────────────
    if (req.method === 'GET' && url.pathname === '/api/entries') {
      const entries = loadEntries(dataDir);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(entries));
      return;
    }

    // ─── API: Get single entry ───────────────────────────
    const entryMatch = url.pathname.match(/^\/api\/entries\/([a-zA-Z0-9_-]+)$/);
    if (req.method === 'GET' && entryMatch) {
      const entries = loadEntries(dataDir);
      const entry = entries.find(e => e.id === entryMatch[1]);
      if (!entry) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Entry not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(entry));
      return;
    }

    // ─── API: Get badge SVG for entry ────────────────────
    const badgeMatch = url.pathname.match(/^\/api\/entries\/([a-zA-Z0-9_-]+)\/badge\.svg$/);
    if (req.method === 'GET' && badgeMatch) {
      const entries = loadEntries(dataDir);
      const entry = entries.find(e => e.id === badgeMatch[1]);
      if (!entry) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }

      // Import dynamically to avoid circular deps at module level
      const { generateBadgeSvg } = require('../reporters/badge');
      const svg = generateBadgeSvg(entry.report.summary);
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(svg);
      return;
    }

    // ─── API: Publish (create/update) entry ──────────────
    if (req.method === 'POST' && url.pathname === '/api/entries') {
      let body = '';
      req.on('data', (chunk: string) => { body += chunk; });
      req.on('end', () => {
        let report: unknown;
        try {
          report = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }

        if (!isValidReport(report)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid compliance report format' }));
          return;
        }

        const entries = loadEntries(dataDir);

        // Upsert: if same agentUrl exists, update it
        const existing = entries.findIndex(e => e.report.agentUrl === report.agentUrl);
        const id = existing >= 0 ? entries[existing].id : crypto.randomBytes(8).toString('hex');

        const entry: RegistryEntry = {
          id,
          report,
          submittedAt: new Date().toISOString(),
          submittedBy: req.headers['x-submitted-by'] as string | undefined,
        };

        if (existing >= 0) {
          entries[existing] = entry;
        } else {
          entries.push(entry);
        }

        saveEntries(dataDir, entries);

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: entry.id, message: 'Published successfully', badgeUrl: `/api/entries/${entry.id}/badge.svg` }));
      });
      return;
    }

    // ─── API: Delete entry ───────────────────────────────
    const deleteMatch = url.pathname.match(/^\/api\/entries\/([a-zA-Z0-9_-]+)$/);
    if (req.method === 'DELETE' && deleteMatch) {
      const entries = loadEntries(dataDir);
      const idx = entries.findIndex(e => e.id === deleteMatch[1]);
      if (idx < 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Entry not found' }));
        return;
      }
      entries.splice(idx, 1);
      saveEntries(dataDir, entries);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Deleted' }));
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return server;
}

export function startRegistryServer(options: RegistryOptions): void {
  const server = createRegistryServer(options);
  server.listen(options.port, () => {
    console.log(`\n🎵 A2A Overture Registry`);
    console.log(`   Registry UI: http://localhost:${options.port}`);
    console.log(`   API:         http://localhost:${options.port}/api/entries`);
    console.log(`   Data dir:    ${options.dataDir}\n`);
    console.log(`Publish results:`);
    console.log(`   overture registry publish report.json --registry http://localhost:${options.port}\n`);
  });
}
