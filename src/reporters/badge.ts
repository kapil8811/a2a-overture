/**
 * SVG badge generator for A2A compliance status.
 * Produces shields.io-style badges without any external service dependency.
 */

export interface BadgeInput {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
}

export function generateBadgeSvg(summary: BadgeInput): string {
  const passRate = summary.total > 0 ? Math.round((summary.passed / summary.total) * 100) : 0;
  const status = summary.failed === 0 ? 'passing' : 'failing';
  const color = summary.failed === 0 ? '#4c1' : '#e05d44';
  const label = 'A2A Certified';
  const value = summary.failed === 0 ? `${passRate}%` : `${summary.failed} failing`;

  const labelWidth = label.length * 6.5 + 12;
  const valueWidth = value.length * 6.5 + 12;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text aria-hidden="true" x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text aria-hidden="true" x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
}

/**
 * Generate a detailed SVG badge with test breakdown
 */
export function generateDetailedBadgeSvg(summary: BadgeInput, agentName?: string): string {
  const passRate = summary.total > 0 ? Math.round((summary.passed / summary.total) * 100) : 0;
  const status = summary.failed === 0;
  const mainColor = status ? '#4c1' : '#e05d44';
  const agent = agentName || 'Agent';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="120" role="img" aria-label="A2A Overture Compliance">
  <title>A2A Overture Compliance - ${agent}</title>
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#2d2d2d;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1a1a1a;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="280" height="120" rx="6" fill="url(#grad)"/>
  <rect x="0" y="0" width="280" height="4" rx="3" fill="${mainColor}"/>
  
  <!-- Title -->
  <text x="140" y="28" fill="#fff" text-anchor="middle" font-family="Verdana,sans-serif" font-size="13" font-weight="bold">A2A Overture</text>
  <text x="140" y="44" fill="#aaa" text-anchor="middle" font-family="Verdana,sans-serif" font-size="9">${agent}</text>
  
  <!-- Status -->
  <circle cx="140" cy="68" r="14" fill="${mainColor}" opacity="0.2"/>
  <text x="140" y="73" fill="${mainColor}" text-anchor="middle" font-family="Verdana,sans-serif" font-size="14" font-weight="bold">${status ? '✓' : '✗'}</text>
  
  <!-- Stats -->
  <text x="40" y="103" fill="#4c1" text-anchor="middle" font-family="Verdana,sans-serif" font-size="11" font-weight="bold">${summary.passed}</text>
  <text x="40" y="113" fill="#888" text-anchor="middle" font-family="Verdana,sans-serif" font-size="8">passed</text>
  
  <text x="100" y="103" fill="#e05d44" text-anchor="middle" font-family="Verdana,sans-serif" font-size="11" font-weight="bold">${summary.failed}</text>
  <text x="100" y="113" fill="#888" text-anchor="middle" font-family="Verdana,sans-serif" font-size="8">failed</text>
  
  <text x="160" y="103" fill="#dfb317" text-anchor="middle" font-family="Verdana,sans-serif" font-size="11" font-weight="bold">${summary.warnings}</text>
  <text x="160" y="113" fill="#888" text-anchor="middle" font-family="Verdana,sans-serif" font-size="8">warnings</text>
  
  <text x="220" y="103" fill="#aaa" text-anchor="middle" font-family="Verdana,sans-serif" font-size="11" font-weight="bold">${passRate}%</text>
  <text x="220" y="113" fill="#888" text-anchor="middle" font-family="Verdana,sans-serif" font-size="8">coverage</text>
</svg>`;
}
