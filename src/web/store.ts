import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ComplianceReport } from '../core/types';

const STORE_DIR = path.join(os.homedir(), '.overture', 'reports');

function ensureDir(): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
}

export interface StoredReport {
  id: string;
  filename: string;
  agentUrl: string;
  agentName?: string;
  timestamp: string;
  summary: ComplianceReport['summary'];
}

/**
 * Save a compliance report to disk.
 * Returns the generated report ID.
 */
export function saveReport(report: ComplianceReport): string {
  ensureDir();
  const agentSlug = sanitizeFilename(report.agentName || report.agentUrl);
  const ts = report.timestamp.replace(/[:.]/g, '-');
  const id = `${agentSlug}_${ts}`;
  const filename = `${id}.json`;
  const filePath = path.join(STORE_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
  return id;
}

/**
 * List all stored reports, newest first.
 */
export function listReports(): StoredReport[] {
  ensureDir();
  const files = fs.readdirSync(STORE_DIR).filter(f => f.endsWith('.json'));
  const reports: StoredReport[] = [];

  for (const filename of files) {
    try {
      const filePath = path.join(STORE_DIR, filename);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const report = JSON.parse(raw) as ComplianceReport;
      reports.push({
        id: filename.replace('.json', ''),
        filename,
        agentUrl: report.agentUrl,
        agentName: report.agentName,
        timestamp: report.timestamp,
        summary: report.summary,
      });
    } catch {
      // Skip malformed files
    }
  }

  // Sort newest first
  reports.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return reports;
}

/**
 * Load a specific report by ID.
 */
export function loadReport(id: string): ComplianceReport | null {
  ensureDir();
  const safe = sanitizeFilename(id);
  const filePath = path.join(STORE_DIR, `${safe}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as ComplianceReport;
  } catch {
    return null;
  }
}

/**
 * Delete a stored report by ID.
 */
export function deleteReport(id: string): boolean {
  ensureDir();
  const safe = sanitizeFilename(id);
  const filePath = path.join(STORE_DIR, `${safe}.json`);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

/**
 * Get the store directory path.
 */
export function getStoreDir(): string {
  ensureDir();
  return STORE_DIR;
}
