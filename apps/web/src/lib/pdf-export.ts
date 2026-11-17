'use client';

export interface PdfExportOptions {
  title: string;
  subtitle?: string;
  companyEmail?: string;
  generatedByEmail?: string | null;
  generatedByName?: string | null;
  kpis?: Array<{ label: string; value: string }>;
  columns?: string[];
  rows?: Array<Array<string | number>>;
  sections?: Array<{ heading: string; body: string }>;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Opens a branded Yakunex Technologies A4 PDF print/save window containing
 * the company logo, company email, KPI summary, structured table, and sections.
 */
export function exportBrandedPdf(opts: PdfExportOptions): void {
  if (typeof window === 'undefined') return;

  const origin = window.location.origin;
  const logoUrl = `${origin}/icon.png`;
  const companyMail = opts.companyEmail || 'info@yakunex.com';
  const generatedAt = new Date().toLocaleString('en-LK', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Colombo',
  });

  const kpiHtml =
    opts.kpis && opts.kpis.length > 0
      ? `<div class="kpis">${opts.kpis
          .map(
            (k) =>
              `<div class="kpi"><div class="kpi-label">${escapeHtml(k.label)}</div><div class="kpi-val">${escapeHtml(k.value)}</div></div>`,
          )
          .join('')}</div>`
      : '';

  const sectionsHtml =
    opts.sections && opts.sections.length > 0
      ? opts.sections
          .map(
            (s) =>
              `<div class="section"><h3>${escapeHtml(s.heading)}</h3><p>${escapeHtml(s.body)}</p></div>`,
          )
          .join('')
      : '';

  const tableHtml =
    opts.columns && opts.columns.length > 0
      ? `<table><thead><tr>${opts.columns
          .map((c) => `<th>${escapeHtml(c)}</th>`)
          .join('')}</tr></thead><tbody>${(opts.rows ?? [])
          .map(
            (r) =>
              `<tr>${r.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`,
          )
          .join('')}</tbody></table>`
      : '';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(opts.title)} — Yakunex Technologies</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif;
      color: #1d1d1f;
      margin: 0;
      padding: 20px;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #c9961e;
      padding-bottom: 14px;
      margin-bottom: 18px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand img { width: 44px; height: 44px; border-radius: 10px; object-fit: cover; border: 1px solid #e5e5ea; }
    .brand-name { font-size: 17px; font-weight: 700; letter-spacing: -0.02em; }
    .brand-sub { font-size: 11px; color: #6e6e73; margin-top: 2px; }
    .meta { text-align: right; font-size: 11px; color: #6e6e73; line-height: 1.5; }
    .meta strong { color: #1d1d1f; }
    h1 { font-size: 21px; margin: 0 0 4px; letter-spacing: -0.02em; }
    .subtitle { font-size: 12px; color: #6e6e73; margin: 0 0 16px; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 18px; }
    .kpi { background: #f2f2f7; border-radius: 12px; padding: 10px 12px; }
    .kpi-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #6e6e73; font-weight: 600; }
    .kpi-val { font-size: 17px; font-weight: 700; margin-top: 4px; }
    .section { background: #f9f9fb; border: 1px solid #e5e5ea; border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; }
    .section h3 { font-size: 13px; margin: 0 0 6px; color: #1d1d1f; }
    .section p { font-size: 12px; margin: 0; color: #3a3a3c; line-height: 1.55; white-space: pre-wrap; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
    th { background: #f2f2f7; color: #6e6e73; text-align: left; padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #d1d1d6; }
    td { padding: 8px 10px; border-bottom: 1px solid #e5e5ea; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    .footer {
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px solid #e5e5ea;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #6e6e73;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <img src="${logoUrl}" alt="Yakunex Logo" />
      <div>
        <div class="brand-name">Yakunex Technologies (Pvt) Ltd.</div>
        <div class="brand-sub">Official Enterprise Document &amp; Report · ${escapeHtml(companyMail)}</div>
      </div>
    </div>
    <div class="meta">
      <div><strong>Company Mail:</strong> ${escapeHtml(companyMail)}</div>
      ${opts.generatedByEmail ? `<div><strong>Exported By:</strong> ${escapeHtml(opts.generatedByName || '')} (${escapeHtml(opts.generatedByEmail)})</div>` : ''}
      <div><strong>Generated:</strong> ${escapeHtml(generatedAt)} (IST)</div>
    </div>
  </div>
  <h1>${escapeHtml(opts.title)}</h1>
  ${opts.subtitle ? `<p class="subtitle">${escapeHtml(opts.subtitle)}</p>` : ''}
  ${kpiHtml}
  ${sectionsHtml}
  ${tableHtml}
  <div class="footer">
    <span>Yakunex Hub Enterprise System · ${escapeHtml(companyMail)}</span>
    <span>Confidential — Internal &amp; Authorized Distribution</span>
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 250);
    };
  </script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=960,height=760');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
