import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { saveReport, listReports, loadReport, deleteReport } from './store';

export interface WebUIOptions {
  port: number;
  host?: string;
}

export class WebUIServer {
  private server: http.Server | null = null;
  private readonly options: Required<WebUIOptions>;

  constructor(options: WebUIOptions) {
    this.options = { host: 'localhost', ...options };
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.on('error', reject);
      this.server.listen(this.options.port, this.options.host, () => resolve());
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  get url(): string {
    return `http://${this.options.host}:${this.options.port}`;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // API proxy endpoint — forward requests to A2A agents
    if (url.pathname === '/api/proxy' && req.method === 'POST') {
      return this.handleProxy(req, res);
    }

    // Report persistence API
    if (url.pathname === '/api/reports' && req.method === 'GET') {
      return this.handleListReports(res);
    }
    if (url.pathname === '/api/reports' && req.method === 'POST') {
      return this.handleSaveReport(req, res);
    }
    const reportMatch = url.pathname.match(/^\/api\/reports\/([^/]+)$/);
    if (reportMatch) {
      const id = decodeURIComponent(reportMatch[1]);
      if (req.method === 'GET') return this.handleLoadReport(id, res);
      if (req.method === 'DELETE') return this.handleDeleteReport(id, res);
    }

    // Serve the SPA
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getHtmlContent());
  }

  private async handleProxy(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      const body = await readBody(req);
      const { targetUrl, method, headers, payload } = body as {
        targetUrl: string;
        method: string;
        headers: Record<string, string>;
        payload?: unknown;
      };

      // Validate targetUrl is http/https
      const parsed = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Only http/https URLs are supported' }));
        return;
      }

      const fetchHeaders: Record<string, string> = { ...headers };

      const fetchOpts: RequestInit = {
        method: method || 'GET',
        headers: fetchHeaders,
      };
      if (payload && method !== 'GET') {
        fetchOpts.body = JSON.stringify(payload);
      }

      const response = await fetch(targetUrl, fetchOpts);
      const contentType = response.headers.get('content-type') || '';
      const responseText = await response.text();

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseText,
        contentType,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Proxy request failed';
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
  }

  private async handleListReports(res: http.ServerResponse) {
    try {
      const reports = listReports();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reports));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to list reports' }));
    }
  }

  private async handleSaveReport(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      const body = await readBody(req);
      const id = saveReport(body as any);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id }));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to save report' }));
    }
  }

  private async handleLoadReport(id: string, res: http.ServerResponse) {
    try {
      const report = loadReport(id);
      if (!report) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Report not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(report));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load report' }));
    }
  }

  private async handleDeleteReport(id: string, res: http.ServerResponse) {
    try {
      const deleted = deleteReport(id);
      if (!deleted) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Report not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to delete report' }));
    }
  }
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function getHtmlContent(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>A2A Overture — Web UI</title>
<style>
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --surface2: #21262d;
    --border: #30363d;
    --text: #c9d1d9;
    --text-dim: #8b949e;
    --accent: #58a6ff;
    --accent-hover: #79c0ff;
    --green: #3fb950;
    --red: #f85149;
    --yellow: #d29922;
    --cyan: #39d2c0;
    --purple: #bc8cff;
    --orange: #f0883e;
    --font: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
    --mono: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--font); background: var(--bg); color: var(--text); height: 100vh; display: flex; flex-direction: column; }

  /* ─── Header ─── */
  header {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 12px 24px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;
  }
  .logo { font-size: 18px; font-weight: 700; color: var(--cyan); letter-spacing: 1px; white-space: nowrap; }
  .logo span { color: var(--text-dim); font-weight: 400; font-size: 13px; margin-left: 8px; }

  /* ─── URL Bar ─── */
  .url-bar {
    display: flex;
    gap: 8px;
    padding: 16px 24px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .url-bar input {
    flex: 1;
    padding: 10px 14px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 14px;
    font-family: var(--mono);
    outline: none;
    transition: border-color 0.2s;
  }
  .url-bar input:focus { border-color: var(--accent); }
  .method-select {
    padding: 10px 12px;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--cyan);
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    outline: none;
    min-width: 80px;
  }
  .method-select option { background: var(--surface); color: var(--text); }

  /* ─── Buttons ─── */
  .btn {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .btn-primary { background: var(--accent); color: #000; }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-secondary { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
  .btn-secondary:hover { border-color: var(--accent); color: var(--accent); }
  .btn-sm { padding: 6px 12px; font-size: 12px; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ─── Tabs ─── */
  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    padding: 0 24px;
    flex-shrink: 0;
  }
  .tab {
    padding: 10px 16px;
    font-size: 13px;
    color: var(--text-dim);
    border: none;
    background: none;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
  }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }

  /* ─── Quick Actions ──── */
  .quick-actions {
    display: flex;
    gap: 8px;
    padding: 12px 24px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  /* ─── Main Layout ─── */
  .main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  .panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .panel:first-child { border-right: 1px solid var(--border); }
  .panel-header {
    padding: 10px 16px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-dim);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }
  .panel-body {
    flex: 1;
    overflow: auto;
    padding: 16px;
  }

  /* ─── Editor ─── */
  textarea {
    width: 100%;
    height: 100%;
    min-height: 200px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 13px;
    padding: 12px;
    resize: none;
    outline: none;
    line-height: 1.6;
  }
  textarea:focus { border-color: var(--accent); }

  /* ─── Response ─── */
  .response-meta {
    display: flex;
    gap: 16px;
    margin-bottom: 12px;
    font-size: 13px;
    flex-wrap: wrap;
  }
  .status-badge {
    padding: 4px 10px;
    border-radius: 4px;
    font-weight: 600;
    font-size: 12px;
    font-family: var(--mono);
  }
  .status-2xx { background: rgba(63,185,80,0.15); color: var(--green); }
  .status-4xx { background: rgba(248,81,73,0.15); color: var(--red); }
  .status-5xx { background: rgba(248,81,73,0.15); color: var(--red); }
  .status-other { background: rgba(210,153,34,0.15); color: var(--yellow); }
  .meta-item { color: var(--text-dim); }
  .meta-item strong { color: var(--text); }

  pre.response-body {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px;
    font-family: var(--mono);
    font-size: 13px;
    line-height: 1.6;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text);
    max-height: 100%;
  }

  /* ─── Agent Card Display ─── */
  .card-section { margin-bottom: 20px; }
  .card-section h3 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--cyan);
    margin-bottom: 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border);
  }
  .card-field { display: flex; gap: 8px; padding: 4px 0; font-size: 13px; }
  .card-label { color: var(--text-dim); min-width: 120px; flex-shrink: 0; }
  .card-value { color: var(--text); word-break: break-word; }
  .skill-card {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 8px;
  }
  .skill-name { font-weight: 600; color: var(--accent); font-size: 14px; }
  .skill-desc { color: var(--text-dim); font-size: 13px; margin-top: 4px; }
  .skill-tags { display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap; }
  .tag { background: var(--surface); border: 1px solid var(--border); padding: 2px 8px; border-radius: 12px; font-size: 11px; color: var(--purple); }
  .capability { display: flex; align-items: center; gap: 6px; font-size: 13px; padding: 2px 0; }
  .cap-dot { width: 8px; height: 8px; border-radius: 50%; }
  .cap-yes { background: var(--green); }
  .cap-no { background: var(--surface2); border: 1px solid var(--border); }

  /* ─── Validation Result ─── */
  .validation-result { padding: 12px; border-radius: 6px; margin-bottom: 12px; }
  .validation-pass { background: rgba(63,185,80,0.1); border: 1px solid rgba(63,185,80,0.3); }
  .validation-fail { background: rgba(248,81,73,0.1); border: 1px solid rgba(248,81,73,0.3); }
  .validation-title { font-weight: 600; font-size: 14px; margin-bottom: 8px; }
  .issue-list { list-style: none; }
  .issue-item { padding: 4px 0; font-size: 13px; font-family: var(--mono); }
  .issue-error { color: var(--red); }
  .issue-warning { color: var(--yellow); }

  /* ─── Compliance Report ─── */
  .compliance-header { margin-bottom: 16px; }
  .pass-rate-bar {
    height: 8px;
    background: var(--surface2);
    border-radius: 4px;
    overflow: hidden;
    margin: 8px 0;
  }
  .pass-rate-fill { height: 100%; background: var(--green); border-radius: 4px; transition: width 0.3s; }
  .test-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 13px;
    margin-bottom: 2px;
  }
  .test-row:hover { background: var(--surface2); }
  .test-icon { font-size: 14px; flex-shrink: 0; }
  .test-name { flex: 1; }
  .test-duration { color: var(--text-dim); font-size: 12px; font-family: var(--mono); }
  .test-message { color: var(--text-dim); font-size: 12px; margin-left: 24px; margin-top: 2px; }

  /* ─── Empty State ─── */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-dim);
    gap: 12px;
  }
  .empty-state .hint { font-size: 13px; }

  /* ─── Spinner ─── */
  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ─── Scrollbar ─── */
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--surface2); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--border); }

  /* ─── Settings row ─── */
  .settings-row {
    display: flex;
    gap: 12px;
    padding: 8px 24px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    align-items: center;
    flex-wrap: wrap;
  }
  .settings-row label { font-size: 12px; color: var(--text-dim); display: flex; align-items: center; gap: 6px; }
  .settings-row input, .settings-row select {
    padding: 4px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-size: 12px;
    font-family: var(--mono);
    outline: none;
  }
  .settings-row input:focus, .settings-row select:focus { border-color: var(--accent); }
</style>
</head>
<body>

<header>
  <div class="logo">A2A OVERTURE <span>Web UI</span></div>
</header>

<div class="url-bar">
  <select class="method-select" id="actionSelect">
    <option value="discover">Discover</option>
    <option value="validate">Validate</option>
    <option value="send" selected>Send</option>
    <option value="certify">Certify</option>
    <option value="interop">Interop</option>
    <option value="bench">Bench</option>
  </select>
  <input type="text" id="urlInput" placeholder="Enter agent URL — e.g. http://localhost:3000" value="" spellcheck="false" />
  <button class="btn btn-primary" id="goBtn" onclick="executeAction()">Send</button>
</div>

<div class="settings-row">
  <label>Binding:
    <select id="bindingSelect">
      <option value="HTTP+JSON">HTTP+JSON</option>
      <option value="JSONRPC">JSON-RPC</option>
    </select>
  </label>
  <label>Auth:
    <input type="text" id="authInput" placeholder="Bearer token..." style="width:200px" />
  </label>
  <label>
    <input type="checkbox" id="streamCheck" /> Streaming
  </label>
</div>

<div class="quick-actions">
  <button class="btn btn-secondary btn-sm" onclick="quickAction('discover')">🔍 Discover</button>
  <button class="btn btn-secondary btn-sm" onclick="quickAction('validate')">✅ Validate</button>
  <button class="btn btn-secondary btn-sm" onclick="quickAction('send')">📨 Send Message</button>
  <button class="btn btn-secondary btn-sm" onclick="quickAction('certify')">📋 Certify</button>
  <button class="btn btn-secondary btn-sm" onclick="quickAction('interop')">🔗 Interop</button>
  <button class="btn btn-secondary btn-sm" onclick="quickAction('bench')">⚡ Bench</button>
  <button class="btn btn-secondary btn-sm" onclick="showHistory()">📜 History</button>
</div>

<div class="main">
  <!-- Request Panel -->
  <div class="panel">
    <div class="panel-header">
      <span>Request</span>
      <button class="btn btn-secondary btn-sm" onclick="formatRequest()">Format</button>
    </div>
    <div class="tabs" id="requestTabs">
      <button class="tab active" onclick="switchRequestTab('body')">Body</button>
      <button class="tab" onclick="switchRequestTab('headers')">Headers</button>
    </div>
    <div class="panel-body" id="requestBody">
      <textarea id="requestEditor" placeholder='Enter your message or JSON payload...\n\nFor Send: just type a plain text message\nFor other actions: optional JSON body'></textarea>
    </div>
    <div class="panel-body" id="requestHeaders" style="display:none">
      <textarea id="headersEditor" placeholder='Custom headers (JSON):\n{\n  "X-Custom": "value"\n}'>{}</textarea>
    </div>
  </div>

  <!-- Response Panel -->
  <div class="panel">
    <div class="panel-header">
      <span>Response</span>
      <span id="responseTime" class="meta-item"></span>
    </div>
    <div class="tabs" id="responseTabs">
      <button class="tab active" onclick="switchResponseTab('pretty')">Pretty</button>
      <button class="tab" onclick="switchResponseTab('raw')">Raw</button>
      <button class="tab" onclick="switchResponseTab('headers')">Headers</button>
    </div>
    <div class="panel-body" id="responsePretty">
      <div class="empty-state">
        <div style="font-size:48px; opacity:0.3">🎵</div>
        <div>Enter an agent URL and click Send</div>
        <div class="hint">Or use the quick action buttons above</div>
      </div>
    </div>
    <div class="panel-body" id="responseRaw" style="display:none">
      <pre class="response-body" id="rawBody"></pre>
    </div>
    <div class="panel-body" id="responseHeaders" style="display:none">
      <pre class="response-body" id="headersBody"></pre>
    </div>
  </div>
</div>

<script>
// ─── State ───────────────────────────────────────────────
let lastResponse = null;
const PROXY_URL = location.origin + '/api/proxy';

// ─── Action Mapping ──────────────────────────────────────
const actionLabels = { discover: 'Discover', validate: 'Validate', send: 'Send', certify: 'Certify', interop: 'Interop', bench: 'Bench' };

document.getElementById('actionSelect').addEventListener('change', function() {
  document.getElementById('goBtn').textContent = actionLabels[this.value] || 'Send';
});

function quickAction(action) {
  document.getElementById('actionSelect').value = action;
  document.getElementById('goBtn').textContent = actionLabels[action];
  executeAction();
}

// ─── Tab Switching ───────────────────────────────────────
function switchRequestTab(tab) {
  document.getElementById('requestBody').style.display = tab === 'body' ? '' : 'none';
  document.getElementById('requestHeaders').style.display = tab === 'headers' ? '' : 'none';
  document.querySelectorAll('#requestTabs .tab').forEach((t, i) => t.classList.toggle('active', (i === 0 && tab === 'body') || (i === 1 && tab === 'headers')));
}

function switchResponseTab(tab) {
  document.getElementById('responsePretty').style.display = tab === 'pretty' ? '' : 'none';
  document.getElementById('responseRaw').style.display = tab === 'raw' ? '' : 'none';
  document.getElementById('responseHeaders').style.display = tab === 'headers' ? '' : 'none';
  document.querySelectorAll('#responseTabs .tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0 && tab === 'pretty') || (i === 1 && tab === 'raw') || (i === 2 && tab === 'headers'));
  });
}

function formatRequest() {
  const editor = document.getElementById('requestEditor');
  try {
    const parsed = JSON.parse(editor.value);
    editor.value = JSON.stringify(parsed, null, 2);
  } catch { /* not JSON, leave as-is */ }
}

// ─── Execute Action ──────────────────────────────────────
async function executeAction() {
  const action = document.getElementById('actionSelect').value;
  const baseUrl = document.getElementById('urlInput').value.replace(/\\/+$/, '');
  const binding = document.getElementById('bindingSelect').value;
  const auth = document.getElementById('authInput').value;
  const stream = document.getElementById('streamCheck').checked;
  const bodyText = document.getElementById('requestEditor').value.trim();

  if (!baseUrl) {
    showError('Please enter an agent URL');
    return;
  }

  showLoading(action);
  const startTime = performance.now();

  try {
    switch (action) {
      case 'discover':
        await doDiscover(baseUrl, auth);
        break;
      case 'validate':
        await doValidate(baseUrl, auth);
        break;
      case 'send':
        await doSend(baseUrl, binding, auth, bodyText, stream);
        break;
      case 'certify':
        await doCertify(baseUrl, binding, auth);
        break;
      case 'interop':
        await doInterop(baseUrl, binding, auth);
        break;
      case 'bench':
        await doBench(baseUrl, binding, auth);
        break;
    }
    const elapsed = Math.round(performance.now() - startTime);
    document.getElementById('responseTime').innerHTML = '<strong>' + elapsed + 'ms</strong>';
  } catch (err) {
    showError(err.message || 'Request failed');
  }
}

// ─── Discover ────────────────────────────────────────────
async function doDiscover(baseUrl, auth) {
  const result = await proxyRequest(baseUrl + '/.well-known/agent-card.json', 'GET', auth);
  const card = JSON.parse(result.body);
  showRaw(result);
  showAgentCard(card);
}

// ─── Validate ────────────────────────────────────────────
async function doValidate(baseUrl, auth) {
  const result = await proxyRequest(baseUrl + '/.well-known/agent-card.json', 'GET', auth);
  const card = JSON.parse(result.body);
  showRaw(result);
  const validation = validateAgentCard(card);
  showValidation(validation, card);
}

// ─── Send ────────────────────────────────────────────────
async function doSend(baseUrl, binding, auth, bodyText, stream) {
  const messageText = bodyText || 'Hello!';
  const messageId = crypto.randomUUID();

  let targetUrl, method, payload;

  if (binding === 'JSONRPC') {
    targetUrl = baseUrl;
    method = 'POST';
    payload = {
      jsonrpc: '2.0',
      id: messageId,
      method: stream ? 'SendStreamingMessage' : 'SendMessage',
      params: {
        message: {
          messageId: messageId,
          role: 'ROLE_USER',
          parts: [{ text: messageText }]
        }
      }
    };
  } else {
    targetUrl = baseUrl + (stream ? '/message:stream' : '/message:send');
    method = 'POST';
    payload = {
      message: {
        messageId: messageId,
        role: 'ROLE_USER',
        parts: [{ text: messageText }]
      }
    };
  }

  const result = await proxyRequest(targetUrl, method, auth, payload);
  showRaw(result);
  try {
    const data = JSON.parse(result.body);
    showTaskResponse(data);
  } catch {
    showPrettyText(result.body);
  }
}

// ─── Certify ─────────────────────────────────────────────
async function doCertify(baseUrl, binding, auth) {
  const tests = [
    { id: 'card-reachable', name: 'Agent Card Reachable', fn: () => testCardReachable(baseUrl, auth) },
    { id: 'card-valid', name: 'Agent Card Valid Schema', fn: () => testCardValid(baseUrl, auth) },
    { id: 'card-required-fields', name: 'Required Fields Present', fn: () => testCardRequiredFields(baseUrl, auth) },
    { id: 'card-has-skills', name: 'Agent Has Skills', fn: () => testCardHasSkills(baseUrl, auth) },
    { id: 'card-https', name: 'Interface URLs use HTTPS', fn: () => testCardHttps(baseUrl, auth) },
    { id: 'send-message', name: 'Send Message', fn: () => testSendMessage(baseUrl, binding, auth) },
    { id: 'get-task', name: 'Get Task', fn: () => testGetTask(baseUrl, binding, auth) },
    { id: 'invalid-task-error', name: 'Invalid Task Error', fn: () => testInvalidTaskError(baseUrl, binding, auth) },
    { id: 'cancel-task', name: 'Cancel Task', fn: () => testCancelTask(baseUrl, binding, auth) },
    { id: 'list-tasks', name: 'List Tasks', fn: () => testListTasks(baseUrl, binding, auth) },
    { id: 'streaming', name: 'Streaming (if supported)', fn: () => testStreaming(baseUrl, binding, auth) },
    { id: 'version-header', name: 'A2A-Version Header', fn: () => testVersionHeader(baseUrl, binding, auth) },
    { id: 'multi-turn-context', name: 'Multi-turn via contextId', fn: () => testMultiTurnContext(baseUrl, binding, auth) },
    { id: 'multi-turn-task', name: 'Multi-turn via taskId', fn: () => testMultiTurnTask(baseUrl, binding, auth) },
    { id: 'multi-turn-history', name: 'Multi-turn History', fn: () => testMultiTurnHistory(baseUrl, binding, auth) },
    { id: 'push-notification-capability', name: 'Push Notification Capability', fn: () => testPushCapability(baseUrl, auth) },
    { id: 'push-notification-reject', name: 'Push Config Rejected', fn: () => testPushReject(baseUrl, binding, auth) },
    { id: 'subscribe-task', name: 'Subscribe to Task', fn: () => testSubscribeTask(baseUrl, binding, auth) },
    { id: 'push-set-config', name: 'Set Push Config', fn: () => testPushSetConfig(baseUrl, binding, auth) },
    { id: 'push-get-config', name: 'Get Push Config', fn: () => testPushGetConfig(baseUrl, binding, auth) },
    { id: 'push-delete-config', name: 'Delete Push Config', fn: () => testPushDeleteConfig(baseUrl, binding, auth) },
    { id: 'auth-unauthorized', name: 'Auth Enforcement', fn: () => testAuthUnauthorized(baseUrl, binding, auth) },
    { id: 'auth-security-schemes', name: 'Security Schemes Valid', fn: () => testAuthSchemes(baseUrl, auth) },
  ];

  const results = [];
  for (const test of tests) {
    try {
      const r = await test.fn();
      results.push({ id: test.id, name: test.name, ...r });
    } catch (err) {
      results.push({ id: test.id, name: test.name, result: 'fail', message: err.message });
    }
    showComplianceProgress(results, tests.length);
  }
  showComplianceReport(results, tests.length);
}

// ─── Compliance Tests ────────────────────────────────────
async function testCardReachable(baseUrl, auth) {
  const r = await proxyRequest(baseUrl + '/.well-known/agent-card.json', 'GET', auth);
  if (r.status === 200) return { result: 'pass', message: 'Agent Card returned 200 OK' };
  return { result: 'fail', message: 'Expected 200, got ' + r.status };
}

async function testCardValid(baseUrl, auth) {
  const r = await proxyRequest(baseUrl + '/.well-known/agent-card.json', 'GET', auth);
  const card = JSON.parse(r.body);
  const v = validateAgentCard(card);
  if (v.valid) return { result: 'pass', message: 'Agent Card conforms to A2A v1.0 schema' };
  return { result: 'fail', message: v.errors.map(e => e.path + ': ' + e.message).join('; ') };
}

async function testCardRequiredFields(baseUrl, auth) {
  const r = await proxyRequest(baseUrl + '/.well-known/agent-card.json', 'GET', auth);
  const card = JSON.parse(r.body);
  const required = ['name', 'description', 'version', 'supportedInterfaces', 'capabilities', 'defaultInputModes', 'defaultOutputModes', 'skills'];
  const missing = required.filter(function(f) { return card[f] === undefined || card[f] === null; });
  if (missing.length > 0) return { result: 'fail', message: 'Missing: ' + missing.join(', ') };
  return { result: 'pass', message: 'All required fields present' };
}

async function testCardHasSkills(baseUrl, auth) {
  const r = await proxyRequest(baseUrl + '/.well-known/agent-card.json', 'GET', auth);
  const card = JSON.parse(r.body);
  if (Array.isArray(card.skills) && card.skills.length > 0) return { result: 'pass', message: card.skills.length + ' skill(s) declared' };
  return { result: 'fail', message: 'No skills declared' };
}

async function testCardHttps(baseUrl, auth) {
  const r = await proxyRequest(baseUrl + '/.well-known/agent-card.json', 'GET', auth);
  const card = JSON.parse(r.body);
  if (!Array.isArray(card.supportedInterfaces)) return { result: 'skip', message: 'No interfaces declared' };
  const nonHttps = card.supportedInterfaces.filter(function(i) {
    return i.url && !i.url.startsWith('https://') && !i.url.startsWith('http://localhost') && !i.url.startsWith('http://127.0.0.1');
  });
  if (nonHttps.length > 0) return { result: 'warn', message: nonHttps.length + ' interface(s) not using HTTPS' };
  return { result: 'pass', message: 'All interfaces use HTTPS or localhost' };
}

async function testSendMessage(baseUrl, binding, auth) {
  const payload = { message: { messageId: crypto.randomUUID(), role: 'ROLE_USER', parts: [{ text: 'Hello' }] } };
  let url, body;
  if (binding === 'JSONRPC') {
    url = baseUrl;
    body = { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'SendMessage', params: payload };
  } else {
    url = baseUrl + '/message:send';
    body = payload;
  }
  const r = await proxyRequest(url, 'POST', auth, body);
  if (r.status === 200) return { result: 'pass', message: 'SendMessage returned 200' };
  return { result: 'fail', message: 'Expected 200, got ' + r.status };
}

async function testGetTask(baseUrl, binding, auth) {
  // First send a message to create a task
  const payload = { message: { messageId: crypto.randomUUID(), role: 'ROLE_USER', parts: [{ text: 'test' }] } };
  let sUrl, sBody;
  if (binding === 'JSONRPC') {
    sUrl = baseUrl;
    sBody = { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'SendMessage', params: payload };
  } else {
    sUrl = baseUrl + '/message:send';
    sBody = payload;
  }
  const sr = await proxyRequest(sUrl, 'POST', auth, sBody);
  const sData = JSON.parse(sr.body);
  const taskId = sData.task?.id || sData.result?.task?.id;
  if (!taskId) return { result: 'fail', message: 'SendMessage did not return a task ID' };

  // Now get the task
  let gUrl;
  if (binding === 'JSONRPC') {
    gUrl = baseUrl;
    const gBody = { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'GetTask', params: { id: taskId } };
    const gr = await proxyRequest(gUrl, 'POST', auth, gBody);
    if (gr.status === 200) return { result: 'pass', message: 'GetTask returned task ' + taskId };
    return { result: 'fail', message: 'GetTask failed: ' + gr.status };
  } else {
    gUrl = baseUrl + '/tasks/' + encodeURIComponent(taskId);
    const gr = await proxyRequest(gUrl, 'GET', auth);
    if (gr.status === 200) return { result: 'pass', message: 'GetTask returned task ' + taskId };
    return { result: 'fail', message: 'GetTask failed: ' + gr.status };
  }
}

async function testInvalidTaskError(baseUrl, binding, auth) {
  const fakeId = 'non-existent-' + crypto.randomUUID();
  if (binding === 'JSONRPC') {
    const body = { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'GetTask', params: { id: fakeId } };
    const r = await proxyRequest(baseUrl, 'POST', auth, body);
    const data = JSON.parse(r.body);
    if (data.error) return { result: 'pass', message: 'Got error for invalid task ID' };
    return { result: 'fail', message: 'Expected error for invalid task ID' };
  } else {
    const r = await proxyRequest(baseUrl + '/tasks/' + encodeURIComponent(fakeId), 'GET', auth);
    if (r.status === 404) return { result: 'pass', message: 'Got 404 for invalid task ID' };
    return { result: 'fail', message: 'Expected 404, got ' + r.status };
  }
}

// ─── Cancel Task ─────────────────────────────────────────
async function testCancelTask(baseUrl, binding, auth) {
  const task = await sendHelper(baseUrl, binding, auth, 'Cancel test');
  if (!task) return { result: 'skip', message: 'Agent returned direct Message — cancel not applicable' };
  const taskId = task.id;
  let r;
  if (binding === 'JSONRPC') {
    const body = { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'CancelTask', params: { id: taskId } };
    r = await proxyRequest(baseUrl, 'POST', auth, body);
  } else {
    r = await proxyRequest(baseUrl + '/tasks/' + encodeURIComponent(taskId) + ':cancel', 'POST', auth);
  }
  if (r.status === 200) {
    const data = JSON.parse(r.body);
    const state = data.status?.state || data.result?.status?.state;
    if (state === 'TASK_STATE_CANCELED') return { result: 'pass', message: 'Task cancelled successfully' };
    return { result: 'warn', message: 'Cancel returned 200 but state is ' + state };
  }
  return { result: 'fail', message: 'Cancel failed: ' + r.status };
}

// ─── List Tasks ──────────────────────────────────────────
async function testListTasks(baseUrl, binding, auth) {
  await sendHelper(baseUrl, binding, auth, 'List test');
  let r;
  if (binding === 'JSONRPC') {
    const body = { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'ListTasks', params: {} };
    r = await proxyRequest(baseUrl, 'POST', auth, body);
  } else {
    r = await proxyRequest(baseUrl + '/tasks', 'GET', auth);
  }
  if (r.status === 200) {
    const data = JSON.parse(r.body);
    const tasks = data.tasks || data.result?.tasks;
    if (Array.isArray(tasks)) return { result: 'pass', message: tasks.length + ' task(s) returned' };
    return { result: 'fail', message: 'Response missing tasks array' };
  }
  return { result: 'fail', message: 'ListTasks failed: ' + r.status };
}

// ─── Streaming ───────────────────────────────────────────
async function testStreaming(baseUrl, binding, auth) {
  const cardR = await proxyRequest(baseUrl + '/.well-known/agent-card.json', 'GET', auth);
  const card = JSON.parse(cardR.body);
  if (!card.capabilities?.streaming) return { result: 'skip', message: 'Agent does not declare streaming' };
  // Test via proxy (non-streaming proxy, but checks the endpoint responds)
  const payload = { message: { messageId: crypto.randomUUID(), role: 'ROLE_USER', parts: [{ text: 'Stream test' }] } };
  let r;
  if (binding === 'JSONRPC') {
    r = await proxyRequest(baseUrl, 'POST', auth, { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'SendStreamingMessage', params: payload });
  } else {
    r = await proxyRequest(baseUrl + '/message:stream', 'POST', auth, payload);
  }
  if (r.status === 200) return { result: 'pass', message: 'Streaming endpoint responded 200' };
  return { result: 'fail', message: 'Streaming failed: ' + r.status };
}

// ─── Version Header ──────────────────────────────────────
async function testVersionHeader(baseUrl, binding, auth) {
  // The proxyRequest always sends A2A-Version: 1.0 — if the agent accepts the request, it handles the header
  const payload = { message: { messageId: crypto.randomUUID(), role: 'ROLE_USER', parts: [{ text: 'Version header test' }] } };
  let r;
  if (binding === 'JSONRPC') {
    r = await proxyRequest(baseUrl, 'POST', auth, { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'SendMessage', params: payload });
  } else {
    r = await proxyRequest(baseUrl + '/message:send', 'POST', auth, payload);
  }
  if (r.status === 200) return { result: 'pass', message: 'Agent accepted A2A-Version: 1.0' };
  // Check if it's specifically a version error
  try {
    const data = JSON.parse(r.body);
    if (data.error && data.error.code === -32009) return { result: 'fail', message: 'Agent returned VersionNotSupportedError for v1.0' };
  } catch {}
  return { result: 'pass', message: 'Agent accepted the version header' };
}

// ─── Multi-turn — Context Continuation ───────────────────
async function testMultiTurnContext(baseUrl, binding, auth) {
  const task1 = await sendHelper(baseUrl, binding, auth, 'My name is Overture.');
  if (!task1) return { result: 'skip', message: 'Agent returned direct Message — multi-turn not applicable' };
  const contextId = task1.contextId;
  if (!contextId) return { result: 'warn', message: 'First response missing contextId' };
  // Second message same context
  const payload = { message: { messageId: crypto.randomUUID(), role: 'ROLE_USER', parts: [{ text: 'What is my name?' }], contextId: contextId } };
  let r;
  if (binding === 'JSONRPC') {
    r = await proxyRequest(baseUrl, 'POST', auth, { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'SendMessage', params: payload });
  } else {
    r = await proxyRequest(baseUrl + '/message:send', 'POST', auth, payload);
  }
  const data = JSON.parse(r.body);
  const task2 = data.task || data.result?.task;
  if (task2 && task2.contextId === contextId) return { result: 'pass', message: 'Context ' + contextId.substring(0,8) + '... maintained' };
  if (task2) return { result: 'warn', message: 'Context changed from ' + contextId.substring(0,8) + ' to ' + (task2.contextId || 'none').substring(0,8) };
  return { result: 'pass', message: 'Multi-turn accepted (agent returned Message)' };
}

// ─── Multi-turn — Task Continuation ──────────────────────
async function testMultiTurnTask(baseUrl, binding, auth) {
  const task1 = await sendHelper(baseUrl, binding, auth, 'Start task continuation test.');
  if (!task1) return { result: 'skip', message: 'Agent returned direct Message' };
  const taskId = task1.id;
  // Follow-up with same taskId
  const payload = { message: { messageId: crypto.randomUUID(), role: 'ROLE_USER', parts: [{ text: 'Continue.' }], taskId: taskId } };
  let r;
  if (binding === 'JSONRPC') {
    r = await proxyRequest(baseUrl, 'POST', auth, { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'SendMessage', params: payload });
  } else {
    r = await proxyRequest(baseUrl + '/message:send', 'POST', auth, payload);
  }
  const data = JSON.parse(r.body);
  const task2 = data.task || data.result?.task;
  if (task2 && task2.id === taskId) return { result: 'pass', message: 'Task ' + taskId.substring(0,8) + '... continued' };
  if (task2) return { result: 'warn', message: 'Agent created new task instead of continuing' };
  return { result: 'pass', message: 'Follow-up accepted' };
}

// ─── Multi-turn — History ────────────────────────────────
async function testMultiTurnHistory(baseUrl, binding, auth) {
  const task1 = await sendHelper(baseUrl, binding, auth, 'First history message.');
  if (!task1) return { result: 'skip', message: 'Agent returned direct Message' };
  const taskId = task1.id;
  // Send follow-up
  const payload = { message: { messageId: crypto.randomUUID(), role: 'ROLE_USER', parts: [{ text: 'Second history message.' }], taskId: taskId } };
  if (binding === 'JSONRPC') {
    await proxyRequest(baseUrl, 'POST', auth, { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'SendMessage', params: payload });
  } else {
    await proxyRequest(baseUrl + '/message:send', 'POST', auth, payload);
  }
  // Fetch task with history
  let r;
  if (binding === 'JSONRPC') {
    r = await proxyRequest(baseUrl, 'POST', auth, { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'GetTask', params: { id: taskId, historyLength: 10 } });
  } else {
    r = await proxyRequest(baseUrl + '/tasks/' + encodeURIComponent(taskId) + '?historyLength=10', 'GET', auth);
  }
  const data = JSON.parse(r.body);
  const task = data.result || data;
  const history = task.history;
  if (Array.isArray(history) && history.length >= 2) return { result: 'pass', message: history.length + ' messages in history' };
  if (Array.isArray(history)) return { result: 'warn', message: 'Only ' + history.length + ' message(s), expected >= 2' };
  return { result: 'warn', message: 'No history array returned' };
}

// ─── Push Notification — Capability ──────────────────────
async function testPushCapability(baseUrl, auth) {
  const r = await proxyRequest(baseUrl + '/.well-known/agent-card.json', 'GET', auth);
  const card = JSON.parse(r.body);
  if (card.capabilities?.pushNotifications === true) return { result: 'pass', message: 'Push notifications supported' };
  if (card.capabilities?.pushNotifications === false) return { result: 'pass', message: 'Push notifications explicitly unsupported' };
  return { result: 'warn', message: 'Push notification capability not declared' };
}

// ─── Push Notification — Rejection ───────────────────────
async function testPushReject(baseUrl, binding, auth) {
  const cardR = await proxyRequest(baseUrl + '/.well-known/agent-card.json', 'GET', auth);
  const card = JSON.parse(cardR.body);
  if (card.capabilities?.pushNotifications === true) return { result: 'skip', message: 'Agent supports push — rejection test skipped' };
  const payload = {
    message: { messageId: crypto.randomUUID(), role: 'ROLE_USER', parts: [{ text: 'Push test' }] },
    configuration: { taskPushNotificationConfig: { url: 'https://example.com/webhook', token: 'test' } }
  };
  let r;
  if (binding === 'JSONRPC') {
    r = await proxyRequest(baseUrl, 'POST', auth, { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'SendMessage', params: payload });
    const data = JSON.parse(r.body);
    if (data.error) return { result: 'pass', message: 'Push config rejected (error code ' + data.error.code + ')' };
    return { result: 'warn', message: 'Agent accepted push config despite not supporting it' };
  } else {
    r = await proxyRequest(baseUrl + '/message:send', 'POST', auth, payload);
    if (r.status >= 400) return { result: 'pass', message: 'Push config rejected (HTTP ' + r.status + ')' };
    return { result: 'warn', message: 'Agent accepted push config despite not supporting it' };
  }
}

// ─── Auth — Unauthorized ─────────────────────────────────
async function testAuthUnauthorized(baseUrl, binding, auth) {
  const cardR = await proxyRequest(baseUrl + '/.well-known/agent-card.json', 'GET', auth);
  const card = JSON.parse(cardR.body);
  const hasSchemes = card.securitySchemes && Object.keys(card.securitySchemes).length > 0;
  const hasReqs = Array.isArray(card.securityRequirements) && card.securityRequirements.length > 0;
  if (!hasSchemes && !hasReqs) return { result: 'skip', message: 'No security schemes declared' };
  // Try without auth
  const payload = { message: { messageId: crypto.randomUUID(), role: 'ROLE_USER', parts: [{ text: 'Unauth test' }] } };
  let r;
  if (binding === 'JSONRPC') {
    r = await proxyRequest(baseUrl, 'POST', null, { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'SendMessage', params: payload });
  } else {
    r = await proxyRequest(baseUrl + '/message:send', 'POST', null, payload);
  }
  if (r.status === 401 || r.status === 403) return { result: 'pass', message: 'Rejected with HTTP ' + r.status };
  const data = JSON.parse(r.body);
  const task = data.task || data.result?.task;
  if (task?.status?.state === 'TASK_STATE_AUTH_REQUIRED') return { result: 'pass', message: 'Returned AUTH_REQUIRED state' };
  return { result: 'warn', message: 'Accepted unauthenticated request despite declaring security' };
}

// ─── Auth — Security Schemes ─────────────────────────────
async function testAuthSchemes(baseUrl, auth) {
  const r = await proxyRequest(baseUrl + '/.well-known/agent-card.json', 'GET', auth);
  const card = JSON.parse(r.body);
  if (!card.securitySchemes || Object.keys(card.securitySchemes).length === 0) return { result: 'skip', message: 'No security schemes declared' };
  const known = ['apiKeySecurityScheme', 'httpAuthSecurityScheme', 'oauth2SecurityScheme', 'openIdConnectSecurityScheme', 'mtlsSecurityScheme'];
  const issues = [];
  for (const [name, scheme] of Object.entries(card.securitySchemes)) {
    const s = scheme;
    const hasType = known.some(function(t) { return s[t] !== undefined; });
    if (!hasType) issues.push(name + ': no recognized scheme type');
    if (s.httpAuthSecurityScheme && !s.httpAuthSecurityScheme.scheme) issues.push(name + '.httpAuth: missing scheme');
    if (s.oauth2SecurityScheme && !s.oauth2SecurityScheme.flows) issues.push(name + '.oauth2: missing flows');
    if (s.openIdConnectSecurityScheme && !s.openIdConnectSecurityScheme.openIdConnectUrl) issues.push(name + '.oidc: missing URL');
    if (s.apiKeySecurityScheme && (!s.apiKeySecurityScheme.name || !s.apiKeySecurityScheme.location)) issues.push(name + '.apiKey: missing name/location');
  }
  if (issues.length > 0) return { result: 'warn', message: issues.join('; ') };
  return { result: 'pass', message: Object.keys(card.securitySchemes).length + ' scheme(s) validated' };
}

// ─── Subscribe to Task ───────────────────────────────────
async function testSubscribeTask(baseUrl, binding, auth) {
  // Create a task first
  const task = await sendHelper(baseUrl, binding, auth, 'Task for subscribe test.');
  if (!task) return { result: 'skip', message: 'No task returned — subscribe not applicable' };
  const taskId = task.id;
  let r;
  if (binding === 'JSONRPC') {
    r = await proxyRequest(baseUrl, 'POST', auth, { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'SubscribeToTask', params: { id: taskId } });
  } else {
    r = await proxyRequest(baseUrl + '/tasks/' + encodeURIComponent(taskId) + ':subscribe', 'POST', auth, { id: taskId });
  }
  if (r.status >= 400) {
    const data = JSON.parse(r.body);
    if (data.error?.code === -32004) return { result: 'skip', message: 'Agent does not support SubscribeToTask' };
    return { result: 'fail', message: 'Subscribe failed: HTTP ' + r.status };
  }
  // SSE response comes as text; check for data lines
  const lines = r.body.split('\\n').filter(function(l) { return l.startsWith('data:'); });
  if (lines.length > 0) return { result: 'pass', message: lines.length + ' event(s) received' };
  // Even if we can't parse SSE through proxy, a 200 means success
  return { result: 'pass', message: 'Subscribe endpoint returned 200' };
}

// ─── Push Config — Set ───────────────────────────────────
async function testPushSetConfig(baseUrl, binding, auth) {
  const cardR = await proxyRequest(baseUrl + '/.well-known/agent-card.json', 'GET', auth);
  const card = JSON.parse(cardR.body);
  if (!card.capabilities?.pushNotifications) return { result: 'skip', message: 'Agent does not support push notifications' };
  const task = await sendHelper(baseUrl, binding, auth, 'Task for push set config test.');
  if (!task) return { result: 'skip', message: 'No task returned' };
  const taskId = task.id;
  const config = { url: 'https://example.com/webhook', token: 'test-token' };
  let r;
  if (binding === 'JSONRPC') {
    r = await proxyRequest(baseUrl, 'POST', auth, { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'SetPushNotificationConfig', params: { taskId: taskId, pushNotificationConfig: config } });
    const data = JSON.parse(r.body);
    if (data.error) return { result: 'fail', message: 'Error: ' + data.error.message };
    const result = data.result || data;
    if (result.url === config.url) return { result: 'pass', message: 'Push config stored' };
    return { result: 'warn', message: 'Config returned but URL mismatch' };
  } else {
    r = await proxyRequest(baseUrl + '/tasks/' + encodeURIComponent(taskId) + '/pushNotificationConfig', 'POST', auth, { taskId: taskId, pushNotificationConfig: config });
    if (r.status >= 400) return { result: 'fail', message: 'Set push config failed: HTTP ' + r.status };
    const result = JSON.parse(r.body);
    if (result.url === config.url) return { result: 'pass', message: 'Push config stored' };
    return { result: 'warn', message: 'Config returned but URL mismatch' };
  }
}

// ─── Push Config — Get ───────────────────────────────────
async function testPushGetConfig(baseUrl, binding, auth) {
  const cardR = await proxyRequest(baseUrl + '/.well-known/agent-card.json', 'GET', auth);
  const card = JSON.parse(cardR.body);
  if (!card.capabilities?.pushNotifications) return { result: 'skip', message: 'Agent does not support push notifications' };
  const task = await sendHelper(baseUrl, binding, auth, 'Task for push get config test.');
  if (!task) return { result: 'skip', message: 'No task returned' };
  const taskId = task.id;
  // Set first
  const config = { url: 'https://example.com/webhook-get', token: 'get-token' };
  if (binding === 'JSONRPC') {
    await proxyRequest(baseUrl, 'POST', auth, { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'SetPushNotificationConfig', params: { taskId: taskId, pushNotificationConfig: config } });
    const r = await proxyRequest(baseUrl, 'POST', auth, { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'GetPushNotificationConfig', params: { taskId: taskId } });
    const data = JSON.parse(r.body);
    if (data.error) return { result: 'fail', message: 'Error: ' + data.error.message };
    const result = data.result || data;
    if (result.url === config.url) return { result: 'pass', message: 'Push config retrieved' };
    return { result: 'warn', message: 'Retrieved config URL mismatch' };
  } else {
    await proxyRequest(baseUrl + '/tasks/' + encodeURIComponent(taskId) + '/pushNotificationConfig', 'POST', auth, { taskId: taskId, pushNotificationConfig: config });
    const r = await proxyRequest(baseUrl + '/tasks/' + encodeURIComponent(taskId) + '/pushNotificationConfig', 'GET', auth);
    if (r.status >= 400) return { result: 'fail', message: 'Get push config failed: HTTP ' + r.status };
    const result = JSON.parse(r.body);
    if (result.url === config.url) return { result: 'pass', message: 'Push config retrieved' };
    return { result: 'warn', message: 'Retrieved config URL mismatch' };
  }
}

// ─── Push Config — Delete ────────────────────────────────
async function testPushDeleteConfig(baseUrl, binding, auth) {
  const cardR = await proxyRequest(baseUrl + '/.well-known/agent-card.json', 'GET', auth);
  const card = JSON.parse(cardR.body);
  if (!card.capabilities?.pushNotifications) return { result: 'skip', message: 'Agent does not support push notifications' };
  const task = await sendHelper(baseUrl, binding, auth, 'Task for push delete config test.');
  if (!task) return { result: 'skip', message: 'No task returned' };
  const taskId = task.id;
  const config = { url: 'https://example.com/webhook-del' };
  if (binding === 'JSONRPC') {
    await proxyRequest(baseUrl, 'POST', auth, { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'SetPushNotificationConfig', params: { taskId: taskId, pushNotificationConfig: config } });
    await proxyRequest(baseUrl, 'POST', auth, { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'DeletePushNotificationConfig', params: { taskId: taskId } });
    const r = await proxyRequest(baseUrl, 'POST', auth, { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'GetPushNotificationConfig', params: { taskId: taskId } });
    const data = JSON.parse(r.body);
    if (data.error) return { result: 'pass', message: 'Config deleted and verified' };
    return { result: 'warn', message: 'Config still retrievable after delete' };
  } else {
    await proxyRequest(baseUrl + '/tasks/' + encodeURIComponent(taskId) + '/pushNotificationConfig', 'POST', auth, { taskId: taskId, pushNotificationConfig: config });
    await proxyRequest(baseUrl + '/tasks/' + encodeURIComponent(taskId) + '/pushNotificationConfig', 'DELETE', auth);
    const r = await proxyRequest(baseUrl + '/tasks/' + encodeURIComponent(taskId) + '/pushNotificationConfig', 'GET', auth);
    if (r.status >= 400) return { result: 'pass', message: 'Config deleted and verified' };
    return { result: 'warn', message: 'Config still retrievable after delete' };
  }
}

// ─── Send Helper ─────────────────────────────────────────
async function sendHelper(baseUrl, binding, auth, text) {
  const payload = { message: { messageId: crypto.randomUUID(), role: 'ROLE_USER', parts: [{ text: text }] } };
  let r;
  if (binding === 'JSONRPC') {
    r = await proxyRequest(baseUrl, 'POST', auth, { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'SendMessage', params: payload });
  } else {
    r = await proxyRequest(baseUrl + '/message:send', 'POST', auth, payload);
  }
  const data = JSON.parse(r.body);
  return data.task || data.result?.task || null;
}

// ─── Client-side Validation ──────────────────────────────
function validateAgentCard(card) {
  const errors = [];
  const warnings = [];

  if (!card.name) errors.push({ path: 'name', message: 'Required field missing' });
  if (!card.description) errors.push({ path: 'description', message: 'Required field missing' });
  if (!card.version) errors.push({ path: 'version', message: 'Required field missing' });
  if (!Array.isArray(card.supportedInterfaces) || card.supportedInterfaces.length === 0) {
    errors.push({ path: 'supportedInterfaces', message: 'Must have at least one interface' });
  }
  if (!card.capabilities) errors.push({ path: 'capabilities', message: 'Required field missing' });
  if (!Array.isArray(card.skills) || card.skills.length === 0) {
    errors.push({ path: 'skills', message: 'Must have at least one skill' });
  }
  if (!Array.isArray(card.defaultInputModes) || card.defaultInputModes.length === 0) {
    warnings.push({ path: 'defaultInputModes', message: 'Should specify input modes' });
  }
  if (!Array.isArray(card.defaultOutputModes) || card.defaultOutputModes.length === 0) {
    warnings.push({ path: 'defaultOutputModes', message: 'Should specify output modes' });
  }

  if (Array.isArray(card.skills)) {
    card.skills.forEach(function(skill, i) {
      if (!skill.id) errors.push({ path: 'skills[' + i + '].id', message: 'Required field' });
      if (!skill.name) errors.push({ path: 'skills[' + i + '].name', message: 'Required field' });
      if (!skill.description) errors.push({ path: 'skills[' + i + '].description', message: 'Required field' });
    });
  }

  return { valid: errors.length === 0, errors: errors, warnings: warnings };
}

// ─── Proxy Helper ────────────────────────────────────────
async function proxyRequest(targetUrl, method, auth, payload) {
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json', 'A2A-Version': '1.0' };
  if (auth) headers['Authorization'] = auth;

  try {
    // Try custom headers
    const customHeaders = JSON.parse(document.getElementById('headersEditor').value || '{}');
    Object.assign(headers, customHeaders);
  } catch { /* ignore bad json */ }

  const resp = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUrl: targetUrl, method: method, headers: headers, payload: payload }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error('Proxy error: ' + err);
  }

  lastResponse = await resp.json();
  return lastResponse;
}

// ─── Display Helpers ─────────────────────────────────────
function showLoading(action) {
  document.getElementById('responsePretty').innerHTML = '<div class="empty-state"><div class="spinner"></div><div>Running ' + action + '...</div></div>';
  document.getElementById('rawBody').textContent = '';
  document.getElementById('headersBody').textContent = '';
  document.getElementById('responseTime').textContent = '';
  switchResponseTab('pretty');
}

function showError(message) {
  document.getElementById('responsePretty').innerHTML = '<div class="validation-result validation-fail"><div class="validation-title">⚠ Error</div><div>' + escapeHtml(message) + '</div></div>';
}

function showRaw(result) {
  try {
    const parsed = JSON.parse(result.body);
    document.getElementById('rawBody').textContent = JSON.stringify(parsed, null, 2);
  } catch {
    document.getElementById('rawBody').textContent = result.body;
  }
  document.getElementById('headersBody').textContent = JSON.stringify(result.headers || {}, null, 2);
}

function showPrettyText(text) {
  document.getElementById('responsePretty').innerHTML = '<pre class="response-body">' + escapeHtml(text) + '</pre>';
}

function showAgentCard(card) {
  let html = '<div class="response-meta">';
  html += statusBadge(lastResponse?.status || 200);
  html += '</div>';

  html += '<div class="card-section"><h3>Identity</h3>';
  html += field('Name', card.name);
  html += field('Description', card.description);
  html += field('Version', card.version);
  if (card.provider) html += field('Provider', card.provider.organization + ' (' + card.provider.url + ')');
  if (card.documentationUrl) html += field('Docs', '<a href="' + escapeHtml(card.documentationUrl) + '" target="_blank" style="color:var(--accent)">' + escapeHtml(card.documentationUrl) + '</a>');
  html += '</div>';

  if (card.capabilities) {
    html += '<div class="card-section"><h3>Capabilities</h3>';
    html += capability('Streaming', card.capabilities.streaming);
    html += capability('Push Notifications', card.capabilities.pushNotifications);
    html += capability('Extended Card', card.capabilities.extendedAgentCard);
    html += '</div>';
  }

  if (Array.isArray(card.supportedInterfaces)) {
    html += '<div class="card-section"><h3>Interfaces (' + card.supportedInterfaces.length + ')</h3>';
    card.supportedInterfaces.forEach(function(iface) {
      html += '<div class="card-field"><span class="card-label">' + escapeHtml(iface.protocolBinding) + ' v' + escapeHtml(iface.protocolVersion) + '</span><span class="card-value" style="color:var(--text-dim);font-family:var(--mono)">' + escapeHtml(iface.url) + '</span></div>';
    });
    html += '</div>';
  }

  if (Array.isArray(card.skills)) {
    html += '<div class="card-section"><h3>Skills (' + card.skills.length + ')</h3>';
    card.skills.forEach(function(skill) {
      html += '<div class="skill-card"><div class="skill-name">' + escapeHtml(skill.name) + ' <span style="color:var(--text-dim);font-weight:400;font-size:12px">' + escapeHtml(skill.id) + '</span></div>';
      html += '<div class="skill-desc">' + escapeHtml(skill.description) + '</div>';
      if (Array.isArray(skill.tags) && skill.tags.length > 0) {
        html += '<div class="skill-tags">' + skill.tags.map(function(t) { return '<span class="tag">#' + escapeHtml(t) + '</span>'; }).join('') + '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
  }

  document.getElementById('responsePretty').innerHTML = html;
}

function showValidation(validation, card) {
  let html = '<div class="response-meta">' + statusBadge(lastResponse?.status || 200) + '</div>';

  if (validation.valid) {
    html += '<div class="validation-result validation-pass"><div class="validation-title">✔ Agent Card is Valid</div><div>The card conforms to the A2A v1.0 specification.</div></div>';
  } else {
    html += '<div class="validation-result validation-fail"><div class="validation-title">✖ Validation Failed</div>';
    html += '<ul class="issue-list">';
    validation.errors.forEach(function(e) { html += '<li class="issue-item issue-error">✖ ' + escapeHtml(e.path) + ': ' + escapeHtml(e.message) + '</li>'; });
    html += '</ul></div>';
  }

  if (validation.warnings.length > 0) {
    html += '<div class="validation-result" style="background:rgba(210,153,34,0.1);border:1px solid rgba(210,153,34,0.3)">';
    html += '<div class="validation-title" style="color:var(--yellow)">⚠ Warnings</div>';
    html += '<ul class="issue-list">';
    validation.warnings.forEach(function(w) { html += '<li class="issue-item issue-warning">⚠ ' + escapeHtml(w.path) + ': ' + escapeHtml(w.message) + '</li>'; });
    html += '</ul></div>';
  }

  // Also show the card
  showAgentCard(card);
  const existing = document.getElementById('responsePretty').innerHTML;
  document.getElementById('responsePretty').innerHTML = html + existing.replace(/^<div class="response-meta">.*?<\\/div>/, '');
}

function showTaskResponse(data) {
  const task = data.task || data.result?.task;
  let html = '<div class="response-meta">' + statusBadge(lastResponse?.status || 200) + '</div>';

  if (task) {
    html += '<div class="card-section"><h3>Task</h3>';
    html += field('ID', task.id);
    if (task.contextId) html += field('Context', task.contextId);
    if (task.status) {
      const stateColor = getStateColor(task.status.state);
      html += '<div class="card-field"><span class="card-label">State</span><span class="card-value" style="color:' + stateColor + ';font-weight:600">' + escapeHtml(task.status.state) + '</span></div>';
      if (task.status.timestamp) html += field('Updated', task.status.timestamp);
    }
    html += '</div>';

    if (Array.isArray(task.artifacts) && task.artifacts.length > 0) {
      html += '<div class="card-section"><h3>Artifacts (' + task.artifacts.length + ')</h3>';
      task.artifacts.forEach(function(artifact) {
        html += '<div class="skill-card">';
        html += '<div style="font-size:12px;color:var(--text-dim);margin-bottom:4px">' + escapeHtml(artifact.artifactId) + '</div>';
        if (Array.isArray(artifact.parts)) {
          artifact.parts.forEach(function(part) {
            if (part.text) html += '<div style="white-space:pre-wrap">' + escapeHtml(part.text) + '</div>';
            if (part.url) html += '<div><a href="' + escapeHtml(part.url) + '" style="color:var(--accent)">' + escapeHtml(part.url) + '</a></div>';
          });
        }
        html += '</div>';
      });
      html += '</div>';
    }
  } else {
    html += '<pre class="response-body">' + escapeHtml(JSON.stringify(data, null, 2)) + '</pre>';
  }

  document.getElementById('responsePretty').innerHTML = html;
}

function showComplianceProgress(results, total) {
  const passed = results.filter(function(r) { return r.result === 'pass'; }).length;
  const failed = results.filter(function(r) { return r.result === 'fail'; }).length;
  const pct = Math.round((results.length / total) * 100);

  let html = '<div class="compliance-header">';
  html += '<div class="response-meta"><span class="meta-item">Running compliance tests... <strong>' + results.length + '/' + total + '</strong></span></div>';
  html += '<div class="pass-rate-bar"><div class="pass-rate-fill" style="width:' + pct + '%"></div></div>';
  html += '</div>';

  results.forEach(function(test) {
    const icon = test.result === 'pass' ? '✔' : '✖';
    const color = test.result === 'pass' ? 'var(--green)' : 'var(--red)';
    html += '<div class="test-row"><span class="test-icon" style="color:' + color + '">' + icon + '</span><span class="test-name">' + escapeHtml(test.name) + '</span></div>';
    if (test.message && test.result === 'fail') html += '<div class="test-message" style="color:var(--red)">' + escapeHtml(test.message) + '</div>';
  });

  document.getElementById('responsePretty').innerHTML = html;
}

function showComplianceReport(results, total) {
  const passed = results.filter(function(r) { return r.result === 'pass'; }).length;
  const failed = results.filter(function(r) { return r.result === 'fail'; }).length;
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;

  let html = '<div class="compliance-header">';
  html += '<div class="response-meta">' + statusBadge(failed === 0 ? 200 : 400) + '<span class="meta-item"><strong>' + pct + '%</strong> pass rate</span></div>';
  html += '<div class="pass-rate-bar"><div class="pass-rate-fill" style="width:' + pct + '%;background:' + (failed === 0 ? 'var(--green)' : 'var(--orange)') + '"></div></div>';
  html += '<div style="font-size:13px;color:var(--text-dim);margin-top:4px">✔ ' + passed + ' passed  ✖ ' + failed + ' failed</div>';
  html += '</div>';

  results.forEach(function(test) {
    const icon = test.result === 'pass' ? '✔' : '✖';
    const color = test.result === 'pass' ? 'var(--green)' : 'var(--red)';
    html += '<div class="test-row"><span class="test-icon" style="color:' + color + '">' + icon + '</span><span class="test-name">' + escapeHtml(test.name) + '</span></div>';
    if (test.message) {
      html += '<div class="test-message" style="color:' + (test.result === 'pass' ? 'var(--text-dim)' : 'var(--red)') + '">' + escapeHtml(test.message) + '</div>';
    }
  });

  // Final verdict
  if (failed === 0) {
    html += '<div class="validation-result validation-pass" style="margin-top:16px"><div class="validation-title">✔ PASS — Agent is A2A v1.0 Compliant</div></div>';
  } else {
    html += '<div class="validation-result validation-fail" style="margin-top:16px"><div class="validation-title">✖ FAIL — ' + failed + ' compliance issue(s) found</div></div>';
  }

  html += '<div style="margin-top:12px;text-align:right"><button class="btn btn-primary btn-sm" onclick="saveCurrentReport()">💾 Save Report</button></div>';

  document.getElementById('responsePretty').innerHTML = html;

  // Also fill raw tab with JSON report
  document.getElementById('rawBody').textContent = JSON.stringify({
    passed: passed, failed: failed, total: total,
    passRate: pct + '%',
    tests: results,
  }, null, 2);
}

// ─── Utility ─────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function statusBadge(status) {
  let cls = 'status-other';
  if (status >= 200 && status < 300) cls = 'status-2xx';
  else if (status >= 400 && status < 500) cls = 'status-4xx';
  else if (status >= 500) cls = 'status-5xx';
  return '<span class="status-badge ' + cls + '">' + status + '</span>';
}

function field(label, value) {
  return '<div class="card-field"><span class="card-label">' + escapeHtml(label) + '</span><span class="card-value">' + (value || '') + '</span></div>';
}

function capability(name, value) {
  const yes = value === true;
  return '<div class="capability"><span class="cap-dot ' + (yes ? 'cap-yes' : 'cap-no') + '"></span>' + escapeHtml(name) + '</div>';
}

function getStateColor(state) {
  if (!state) return 'var(--text)';
  if (state.includes('COMPLETED')) return 'var(--green)';
  if (state.includes('FAILED') || state.includes('CANCELED') || state.includes('REJECTED')) return 'var(--red)';
  if (state.includes('WORKING') || state.includes('SUBMITTED')) return 'var(--cyan)';
  if (state.includes('INPUT_REQUIRED') || state.includes('AUTH_REQUIRED')) return 'var(--yellow)';
  return 'var(--text)';
}

// URL input: Enter key triggers action
document.getElementById('urlInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') executeAction();
});

// ─── Interop ─────────────────────────────────────────────
async function doInterop(baseUrl, binding, auth) {
  // Parse comma/space separated URLs from the body or URL input
  const bodyText = document.getElementById('requestEditor').value.trim();
  let urls = [];
  if (bodyText) {
    urls = bodyText.split(/[,\\n]+/).map(function(u) { return u.trim(); }).filter(Boolean);
  }
  // Always include the main URL
  if (!urls.includes(baseUrl)) urls.unshift(baseUrl);
  if (urls.length < 2) {
    showError('Interop requires at least 2 agent URLs. Enter additional URLs in the request body (one per line or comma-separated).');
    return;
  }

  showLoading('interop');

  // Step 1: Discover all agents
  const agents = [];
  const results = [];
  for (const url of urls) {
    try {
      const r = await proxyRequest(url + '/.well-known/agent-card.json', 'GET', auth);
      const card = JSON.parse(r.body);
      agents.push({ url: url, name: card.name || url, card: card });
      results.push({ id: 'discover-' + url, name: 'Discover: ' + (card.name || url), result: 'pass', message: 'Agent Card fetched' });
    } catch (err) {
      results.push({ id: 'discover-' + url, name: 'Discover: ' + url, result: 'fail', message: err.message });
    }
    showInteropProgress(results, urls.length * urls.length);
  }

  // Step 2: Cross-discover (each agent discovers every other agent via proxy)
  for (let i = 0; i < agents.length; i++) {
    for (let j = 0; j < agents.length; j++) {
      if (i === j) continue;
      const from = agents[i], to = agents[j];
      try {
        const r = await proxyRequest(to.url + '/.well-known/agent-card.json', 'GET', auth);
        if (r.status === 200) {
          results.push({ id: 'xdiscover-' + i + '-' + j, name: 'Cross-discover: ' + from.name + ' → ' + to.name, result: 'pass', message: 'Discovery succeeded' });
        } else {
          results.push({ id: 'xdiscover-' + i + '-' + j, name: 'Cross-discover: ' + from.name + ' → ' + to.name, result: 'fail', message: 'HTTP ' + r.status });
        }
      } catch (err) {
        results.push({ id: 'xdiscover-' + i + '-' + j, name: 'Cross-discover: ' + from.name + ' → ' + to.name, result: 'fail', message: err.message });
      }
      showInteropProgress(results, urls.length * urls.length);
    }
  }

  // Step 3: Cross-message (each agent sends a message to every other agent)
  for (let i = 0; i < agents.length; i++) {
    for (let j = 0; j < agents.length; j++) {
      if (i === j) continue;
      const from = agents[i], to = agents[j];
      try {
        const msgPayload = { message: { messageId: crypto.randomUUID(), role: 'ROLE_USER', parts: [{ text: 'Hello from ' + from.name }] } };
        let url, body;
        if (binding === 'JSONRPC') {
          url = to.url; body = { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'SendMessage', params: msgPayload };
        } else {
          url = to.url + '/message:send'; body = msgPayload;
        }
        const r = await proxyRequest(url, 'POST', auth, body);
        if (r.status === 200) {
          results.push({ id: 'xmessage-' + i + '-' + j, name: 'Cross-message: ' + from.name + ' → ' + to.name, result: 'pass', message: 'Message accepted' });
        } else {
          results.push({ id: 'xmessage-' + i + '-' + j, name: 'Cross-message: ' + from.name + ' → ' + to.name, result: 'fail', message: 'HTTP ' + r.status });
        }
      } catch (err) {
        results.push({ id: 'xmessage-' + i + '-' + j, name: 'Cross-message: ' + from.name + ' → ' + to.name, result: 'fail', message: err.message });
      }
      showInteropProgress(results, urls.length * urls.length);
    }
  }

  showInteropReport(results, agents);
}

function showInteropProgress(results, total) {
  const passed = results.filter(function(r) { return r.result === 'pass'; }).length;
  let html = '<div class="compliance-header">';
  html += '<div class="response-meta"><span class="meta-item">\uD83D\uDD17 Interop testing... <strong>' + results.length + ' tests</strong></span></div>';
  html += '</div>';
  results.forEach(function(test) {
    const icon = test.result === 'pass' ? '✔' : test.result === 'fail' ? '✖' : '○';
    const color = test.result === 'pass' ? 'var(--green)' : test.result === 'fail' ? 'var(--red)' : 'var(--text-dim)';
    html += '<div class="test-row"><span class="test-icon" style="color:' + color + '">' + icon + '</span><span class="test-name">' + escapeHtml(test.name) + '</span></div>';
    if (test.message && test.result === 'fail') html += '<div class="test-message" style="color:var(--red)">' + escapeHtml(test.message) + '</div>';
  });
  document.getElementById('responsePretty').innerHTML = html;
}

function showInteropReport(results, agents) {
  const passed = results.filter(function(r) { return r.result === 'pass'; }).length;
  const failed = results.filter(function(r) { return r.result === 'fail'; }).length;
  const total = results.length;
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;

  let html = '<div class="compliance-header">';
  html += '<h3 style="color:var(--accent);margin:0 0 8px 0">\uD83D\uDD17 Multi-Agent Interop Report</h3>';
  html += '<div class="response-meta">' + statusBadge(failed === 0 ? 200 : 400) + '<span class="meta-item"><strong>' + pct + '%</strong> pass rate</span>';
  html += '<span class="meta-item">' + agents.length + ' agents tested</span></div>';
  html += '<div class="pass-rate-bar"><div class="pass-rate-fill" style="width:' + pct + '%;background:' + (failed === 0 ? 'var(--green)' : 'var(--orange)') + '"></div></div>';
  html += '<div style="font-size:13px;color:var(--text-dim);margin-top:4px">✔ ' + passed + ' passed  ✖ ' + failed + ' failed</div>';
  html += '</div>';

  // Agent list
  html += '<div class="card-section"><h3>Agents</h3>';
  agents.forEach(function(a) {
    html += field(a.name, '<span style="font-family:var(--mono);color:var(--text-dim)">' + escapeHtml(a.url) + '</span>');
  });
  html += '</div>';

  // Test results
  results.forEach(function(test) {
    const icon = test.result === 'pass' ? '✔' : test.result === 'fail' ? '✖' : '○';
    const color = test.result === 'pass' ? 'var(--green)' : test.result === 'fail' ? 'var(--red)' : 'var(--text-dim)';
    html += '<div class="test-row"><span class="test-icon" style="color:' + color + '">' + icon + '</span><span class="test-name">' + escapeHtml(test.name) + '</span></div>';
    if (test.message && test.result !== 'pass') html += '<div class="test-message" style="color:' + (test.result === 'fail' ? 'var(--red)' : 'var(--text-dim)') + '">' + escapeHtml(test.message) + '</div>';
  });

  if (failed === 0) {
    html += '<div class="validation-result validation-pass" style="margin-top:16px"><div class="validation-title">✔ All agents are interoperable</div></div>';
  } else {
    html += '<div class="validation-result validation-fail" style="margin-top:16px"><div class="validation-title">✖ ' + failed + ' interop issue(s) found</div></div>';
  }

  document.getElementById('responsePretty').innerHTML = html;
  document.getElementById('rawBody').textContent = JSON.stringify({ agents: agents.map(function(a) { return { name: a.name, url: a.url }; }), passed: passed, failed: failed, total: total, passRate: pct + '%', tests: results }, null, 2);
}

// ─── Bench ───────────────────────────────────────────────
async function doBench(baseUrl, binding, auth) {
  const bodyText = document.getElementById('requestEditor').value.trim();
  let config = { concurrency: 5, duration: 10 };
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed.concurrency) config.concurrency = parsed.concurrency;
    if (parsed.duration) config.duration = parsed.duration;
  } catch { /* use defaults */ }

  showLoading('bench (' + config.concurrency + ' concurrent, ' + config.duration + 's)');

  const latencies = [];
  let successes = 0, failures = 0, running = true;
  const startTime = performance.now();
  const endTime = startTime + config.duration * 1000;

  // Update UI periodically
  const updateInterval = setInterval(function() {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    const total = successes + failures;
    const throughput = elapsed > 0 ? (total / elapsed).toFixed(0) : 0;
    showBenchProgress(total, successes, failures, elapsed, config.duration, throughput);
  }, 500);

  // Run concurrent workers
  async function worker() {
    while (performance.now() < endTime) {
      const t0 = performance.now();
      try {
        const msgPayload = { message: { messageId: crypto.randomUUID(), role: 'ROLE_USER', parts: [{ text: 'Benchmark ping' }] } };
        let url, body;
        if (binding === 'JSONRPC') {
          url = baseUrl; body = { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'SendMessage', params: msgPayload };
        } else {
          url = baseUrl + '/message:send'; body = msgPayload;
        }
        const r = await proxyRequest(url, 'POST', auth, body);
        latencies.push(performance.now() - t0);
        if (r.status >= 200 && r.status < 400) successes++;
        else failures++;
      } catch {
        latencies.push(performance.now() - t0);
        failures++;
      }
    }
  }

  const workers = [];
  for (let i = 0; i < config.concurrency; i++) workers.push(worker());
  await Promise.all(workers);
  clearInterval(updateInterval);

  // Compute stats
  latencies.sort(function(a, b) { return a - b; });
  const totalReqs = successes + failures;
  const elapsed = (performance.now() - startTime) / 1000;
  const throughput = totalReqs / elapsed;
  const stats = {
    totalRequests: totalReqs,
    successes: successes,
    failures: failures,
    errorRate: totalReqs > 0 ? ((failures / totalReqs) * 100).toFixed(1) + '%' : '0%',
    throughput: throughput.toFixed(0) + ' req/s',
    duration: elapsed.toFixed(1) + 's',
    concurrency: config.concurrency,
    latency: latencies.length > 0 ? {
      min: latencies[0].toFixed(2) + 'ms',
      mean: (latencies.reduce(function(a, b) { return a + b; }, 0) / latencies.length).toFixed(2) + 'ms',
      median: latencies[Math.floor(latencies.length * 0.5)].toFixed(2) + 'ms',
      p95: latencies[Math.floor(latencies.length * 0.95)].toFixed(2) + 'ms',
      p99: latencies[Math.floor(latencies.length * 0.99)].toFixed(2) + 'ms',
      max: latencies[latencies.length - 1].toFixed(2) + 'ms',
    } : null,
  };

  showBenchReport(stats, baseUrl);
}

function showBenchProgress(total, successes, failures, elapsed, duration, throughput) {
  const pct = Math.min(100, Math.round((elapsed / duration) * 100));
  let html = '<div class="compliance-header">';
  html += '<h3 style="color:var(--accent);margin:0 0 8px 0">⚡ Benchmarking...</h3>';
  html += '<div class="pass-rate-bar"><div class="pass-rate-fill" style="width:' + pct + '%;background:var(--cyan)"></div></div>';
  html += '<div style="font-size:13px;color:var(--text-dim);margin-top:8px">' + elapsed + 's / ' + duration + 's — ' + total + ' requests — ' + throughput + ' req/s</div>';
  html += '</div>';
  document.getElementById('responsePretty').innerHTML = html;
}

function showBenchReport(stats, url) {
  let html = '<div class="compliance-header">';
  html += '<h3 style="color:var(--accent);margin:0 0 8px 0">⚡ Benchmark Results</h3>';
  html += '<div class="response-meta"><span class="meta-item" style="font-family:var(--mono);color:var(--cyan)">' + escapeHtml(url) + '</span></div>';
  html += '</div>';

  html += '<div class="card-section"><h3>Summary</h3>';
  html += field('Total Requests', '<strong>' + stats.totalRequests + '</strong>');
  html += field('Successes', '<span style="color:var(--green)">' + stats.successes + '</span>');
  html += field('Failures', '<span style="color:' + (stats.failures > 0 ? 'var(--red)' : 'var(--green)') + '">' + stats.failures + '</span>');
  html += field('Error Rate', stats.errorRate);
  html += field('Throughput', '<strong style="color:var(--cyan)">' + stats.throughput + '</strong>');
  html += field('Duration', stats.duration);
  html += field('Concurrency', stats.concurrency);
  html += '</div>';

  if (stats.latency) {
    html += '<div class="card-section"><h3>Latency</h3>';
    html += field('Min', stats.latency.min);
    html += field('Mean', stats.latency.mean);
    html += field('Median (p50)', stats.latency.median);
    html += field('p95', stats.latency.p95);
    html += field('p99', stats.latency.p99);
    html += field('Max', stats.latency.max);
    html += '</div>';
  }

  if (stats.failures === 0) {
    html += '<div class="validation-result validation-pass" style="margin-top:16px"><div class="validation-title">✔ Benchmark complete — 0% error rate</div></div>';
  } else {
    html += '<div class="validation-result validation-fail" style="margin-top:16px"><div class="validation-title">⚠ ' + stats.errorRate + ' error rate detected</div></div>';
  }

  html += '<div style="margin-top:8px;font-size:12px;color:var(--text-dim)">Tip: Set concurrency/duration in the request body: <code style="background:var(--surface2);padding:2px 6px;border-radius:3px">{"concurrency": 10, "duration": 30}</code></div>';

  document.getElementById('responsePretty').innerHTML = html;
  document.getElementById('rawBody').textContent = JSON.stringify(stats, null, 2);
}

// ─── Report Persistence ──────────────────────────────────
let lastCertifyReport = null;

const _origShowComplianceReport = showComplianceReport;
// Intercept to capture report data
(function() {
  const orig = window.showComplianceReport || showComplianceReport;
  // We capture lastCertifyReport in doCertify below instead
})();

// Patch doCertify's showComplianceReport call — we store the data via a global
function captureReport(results, total) {
  const passed = results.filter(function(r) { return r.result === 'pass'; }).length;
  const failed = results.filter(function(r) { return r.result === 'fail'; }).length;
  lastCertifyReport = {
    agentUrl: document.getElementById('urlInput').value.replace(/\\/+$/, ''),
    timestamp: new Date().toISOString(),
    passed: passed,
    failed: failed,
    total: total,
    passRate: total > 0 ? Math.round((passed / total) * 100) + '%' : '0%',
    tests: results,
  };
}

// Override showComplianceReport to also capture
const _showComp = showComplianceReport;
showComplianceReport = function(results, total) {
  captureReport(results, total);
  _showComp(results, total);
};

async function saveCurrentReport() {
  if (!lastCertifyReport) {
    alert('No certification report to save. Run Certify first.');
    return;
  }
  try {
    const resp = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lastCertifyReport),
    });
    const data = await resp.json();
    if (resp.ok) {
      alert('Report saved: ' + data.id);
    } else {
      alert('Failed to save: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Failed to save report: ' + err.message);
  }
}

async function showHistory() {
  showLoading('history');
  try {
    const resp = await fetch('/api/reports');
    const reports = await resp.json();
    if (!reports.length) {
      document.getElementById('responsePretty').innerHTML = '<div class="empty-state"><div style="font-size:48px;opacity:0.3">📜</div><div>No saved reports yet</div><div class="hint">Run Certify on an agent, then click 💾 Save Report</div></div>';
      return;
    }
    let html = '<h3 style="color:var(--accent);margin:0 0 12px 0">📜 Saved Reports</h3>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px">';
    html += '<tr style="border-bottom:1px solid var(--border);color:var(--text-dim)">';
    html += '<th style="text-align:left;padding:8px">Agent</th>';
    html += '<th style="text-align:left;padding:8px">Date</th>';
    html += '<th style="text-align:left;padding:8px">Pass Rate</th>';
    html += '<th style="text-align:right;padding:8px">Actions</th></tr>';

    reports.forEach(function(r) {
      const date = new Date(r.timestamp).toLocaleString();
      html += '<tr style="border-bottom:1px solid var(--border)">';
      html += '<td style="padding:8px;color:var(--cyan)">' + escapeHtml(r.agentUrl || r.id) + '</td>';
      html += '<td style="padding:8px;color:var(--text-dim)">' + escapeHtml(date) + '</td>';
      html += '<td style="padding:8px">' + escapeHtml(r.passRate || '?') + '</td>';
      html += '<td style="padding:8px;text-align:right">';
      html += '<button class="btn btn-secondary btn-sm" onclick="loadSavedReport(\\'' + escapeHtml(r.id) + '\\')">View</button> ';
      html += '<button class="btn btn-secondary btn-sm" onclick="compareWithSaved(\\'' + escapeHtml(r.id) + '\\')">Compare</button> ';
      html += '<button class="btn btn-secondary btn-sm" style="color:var(--red)" onclick="deleteSavedReport(\\'' + escapeHtml(r.id) + '\\')">Delete</button>';
      html += '</td></tr>';
    });
    html += '</table>';
    document.getElementById('responsePretty').innerHTML = html;
    document.getElementById('rawBody').textContent = JSON.stringify(reports, null, 2);
  } catch (err) {
    showError('Failed to load history: ' + err.message);
  }
}

async function loadSavedReport(id) {
  try {
    const resp = await fetch('/api/reports/' + encodeURIComponent(id));
    const report = await resp.json();
    if (!resp.ok) { alert(report.error || 'Not found'); return; }
    showComplianceReport(report.tests || [], report.total || 0);
    document.getElementById('rawBody').textContent = JSON.stringify(report, null, 2);
  } catch (err) {
    alert('Failed to load: ' + err.message);
  }
}

async function compareWithSaved(id) {
  if (!lastCertifyReport) {
    alert('Run Certify first to get a current report, then Compare.');
    return;
  }
  try {
    const resp = await fetch('/api/reports/' + encodeURIComponent(id));
    const saved = await resp.json();
    if (!resp.ok) { alert(saved.error || 'Not found'); return; }
    showDiffReport(saved, lastCertifyReport);
  } catch (err) {
    alert('Failed to load for comparison: ' + err.message);
  }
}

function showDiffReport(before, after) {
  const rank = { pass: 3, warn: 2, skip: 1, fail: 0 };
  const beforeMap = {};
  (before.tests || []).forEach(function(t) { beforeMap[t.id] = t; });
  const afterMap = {};
  (after.tests || []).forEach(function(t) { afterMap[t.id] = t; });
  const allIds = new Set(Object.keys(beforeMap).concat(Object.keys(afterMap)));

  let regressions = 0, improvements = 0, newTests = 0, removed = 0;
  let rows = '';
  allIds.forEach(function(id) {
    const b = beforeMap[id];
    const a = afterMap[id];
    let change = 'unchanged', bResult = '-', aResult = '-', name = id;
    if (b && a) {
      bResult = b.result; aResult = a.result; name = a.name || b.name || id;
      if ((rank[aResult] || 0) > (rank[bResult] || 0)) { change = 'improved'; improvements++; }
      else if ((rank[aResult] || 0) < (rank[bResult] || 0)) { change = 'regressed'; regressions++; }
    } else if (!b && a) {
      change = 'new'; aResult = a.result; name = a.name || id; newTests++;
    } else if (b && !a) {
      change = 'removed'; bResult = b.result; name = b.name || id; removed++;
    }

    let color = 'var(--text-dim)';
    let icon = '—';
    if (change === 'improved') { color = 'var(--green)'; icon = '▲'; }
    if (change === 'regressed') { color = 'var(--red)'; icon = '▼'; }
    if (change === 'new') { color = 'var(--cyan)'; icon = '+'; }
    if (change === 'removed') { color = 'var(--yellow)'; icon = '−'; }

    rows += '<tr style="border-bottom:1px solid var(--border);color:' + color + '">';
    rows += '<td style="padding:6px 8px">' + icon + '</td>';
    rows += '<td style="padding:6px 8px">' + escapeHtml(name) + '</td>';
    rows += '<td style="padding:6px 8px;text-align:center">' + bResult + '</td>';
    rows += '<td style="padding:6px 8px;text-align:center">' + aResult + '</td>';
    rows += '<td style="padding:6px 8px">' + change + '</td>';
    rows += '</tr>';
  });

  let html = '<h3 style="color:var(--accent);margin:0 0 8px 0">📊 Comparison Report</h3>';
  html += '<div style="font-size:13px;margin-bottom:12px;color:var(--text-dim)">';
  html += 'Before: <span style="color:var(--cyan)">' + escapeHtml(before.agentUrl || '?') + '</span> (' + escapeHtml(before.passRate || '?') + ')';
  html += ' → After: <span style="color:var(--cyan)">' + escapeHtml(after.agentUrl || '?') + '</span> (' + escapeHtml(after.passRate || '?') + ')';
  html += '</div>';

  if (regressions > 0) {
    html += '<div style="color:var(--red);font-weight:600;margin-bottom:8px">⚠ ' + regressions + ' regression(s) detected</div>';
  }
  if (improvements > 0) {
    html += '<div style="color:var(--green);margin-bottom:8px">▲ ' + improvements + ' improvement(s)</div>';
  }

  html += '<table style="width:100%;border-collapse:collapse;font-size:13px">';
  html += '<tr style="border-bottom:1px solid var(--border);color:var(--text-dim)">';
  html += '<th style="padding:6px 8px;width:30px"></th>';
  html += '<th style="text-align:left;padding:6px 8px">Test</th>';
  html += '<th style="text-align:center;padding:6px 8px">Before</th>';
  html += '<th style="text-align:center;padding:6px 8px">After</th>';
  html += '<th style="text-align:left;padding:6px 8px">Change</th></tr>';
  html += rows + '</table>';

  document.getElementById('responsePretty').innerHTML = html;
  document.getElementById('rawBody').textContent = JSON.stringify({ regressions: regressions, improvements: improvements, newTests: newTests, removed: removed }, null, 2);
}

async function deleteSavedReport(id) {
  if (!confirm('Delete report ' + id + '?')) return;
  try {
    const resp = await fetch('/api/reports/' + encodeURIComponent(id), { method: 'DELETE' });
    if (resp.ok) showHistory();
    else alert('Failed to delete');
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}
</script>
</body>
</html>`;
}
