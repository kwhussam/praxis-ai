import RNHTMLtoPDF from "react-native-html-to-pdf";

import type { Report } from "@/lib/ai/report";

type ExportOptions = {
  practiceName: string;
  domain?: string;
  report: Report;
};

const ampelColors: Record<Report["ampel"], string> = {
  rot: "#FF4757",
  gelb: "#FFA502",
  grün: "#2ED573"
};

export async function exportReportPdf({ practiceName, domain, report }: ExportOptions) {
  const fileName = `PraxisShield-Bericht-${slugify(practiceName)}-${new Date().toISOString().slice(0, 10)}`;
  const result = await RNHTMLtoPDF.convert({
    html: buildReportHtml({ practiceName, domain, report }),
    fileName,
    base64: false
  });

  if (!result.filePath) {
    throw new Error("PDF-Bericht konnte nicht gespeichert werden.");
  }

  return result.filePath;
}

export function buildReportHtml({ practiceName, domain, report }: ExportOptions) {
  const ampelColor = ampelColors[report.ampel];
  const generatedAt = new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 34px;
      color: #0A1628;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
      background: #F4F7FB;
    }
    .page {
      background: #ffffff;
      border-radius: 18px;
      overflow: hidden;
      border: 1px solid #DDE6F2;
    }
    .hero {
      padding: 34px;
      color: #F8FBFF;
      background: #0A1628;
    }
    .brand {
      color: #7FB4FF;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    h1 {
      margin: 12px 0 4px;
      font-size: 31px;
      line-height: 1.15;
    }
    .meta {
      color: #9AA9BF;
      font-size: 13px;
    }
    .summary {
      margin-top: 24px;
      font-size: 18px;
      max-width: 660px;
    }
    .score-row {
      display: flex;
      gap: 14px;
      margin-top: 26px;
    }
    .score-box {
      min-width: 132px;
      padding: 16px;
      border: 1px solid rgba(255,255,255,0.16);
      border-radius: 14px;
      background: rgba(255,255,255,0.08);
    }
    .score-label {
      color: #9AA9BF;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .score-value {
      margin-top: 8px;
      font-size: 28px;
      font-weight: 900;
    }
    .ampel {
      display: inline-block;
      width: 13px;
      height: 13px;
      margin-right: 8px;
      border-radius: 999px;
      background: ${ampelColor};
    }
    .section {
      padding: 28px 34px;
      border-top: 1px solid #E5ECF5;
    }
    h2 {
      margin: 0 0 16px;
      font-size: 22px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      padding: 11px 10px;
      border-bottom: 1px solid #E5ECF5;
      text-align: left;
      vertical-align: top;
    }
    th {
      color: #4B5B70;
      font-size: 11px;
      text-transform: uppercase;
    }
    .risk-title {
      font-weight: 800;
    }
    .pill {
      display: inline-block;
      padding: 5px 9px;
      border-radius: 999px;
      color: #ffffff;
      background: #2D7EF8;
      font-size: 11px;
      font-weight: 800;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .metric {
      padding: 13px;
      border: 1px solid #E5ECF5;
      border-radius: 12px;
      background: #F8FBFF;
    }
    .metric strong {
      display: block;
      margin-top: 7px;
      font-size: 22px;
    }
    .quick-win {
      margin-bottom: 10px;
      padding: 13px 15px;
      border-left: 4px solid #2ED573;
      border-radius: 10px;
      background: #F4FBF7;
    }
    .footer {
      padding: 22px 34px 30px;
      color: #627086;
      font-size: 12px;
      border-top: 1px solid #E5ECF5;
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="brand">PraxisShield AI</div>
      <h1>Cybersecurity-Bericht für ${escapeHtml(practiceName)}</h1>
      <div class="meta">${domain ? `Domain: ${escapeHtml(domain)} · ` : ""}Erstellt am ${generatedAt}</div>
      <p class="summary">${escapeHtml(report.executive_summary)}</p>
      <div class="score-row">
        <div class="score-box">
          <div class="score-label">Sicherheitswert</div>
          <div class="score-value">${report.security_score}/100</div>
        </div>
        <div class="score-box">
          <div class="score-label">Ampel</div>
          <div class="score-value"><span class="ampel"></span>${escapeHtml(report.ampel.toUpperCase())}</div>
        </div>
        <div class="score-box">
          <div class="score-label">Gesamtrisiko</div>
          <div class="score-value">${escapeHtml(report.overall_risk)}</div>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>Wichtigste Risiken und Maßnahmenplan</h2>
      <table>
        <thead>
          <tr>
            <th>Rang</th>
            <th>Risiko</th>
            <th>Auswirkung</th>
            <th>Maßnahme</th>
            <th>Aufwand/Kosten</th>
            <th>Priorität</th>
          </tr>
        </thead>
        <tbody>
          ${report.top_risks.map((risk) => `<tr>
            <td>${risk.rank}</td>
            <td><div class="risk-title">${escapeHtml(risk.title)}</div>${escapeHtml(risk.plain_language)}</td>
            <td>${escapeHtml(risk.business_impact)}</td>
            <td>${escapeHtml(risk.action)}</td>
            <td>${escapeHtml(risk.effort_hours)}<br />${escapeHtml(risk.cost_estimate)}</td>
            <td><span class="pill">${escapeHtml(priorityLabel(risk.priority))}</span></td>
          </tr>`).join("")}
        </tbody>
      </table>
    </section>

    <section class="section">
      <h2>Bewertung nach Kategorien</h2>
      <div class="grid">
        ${Object.entries(report.scores_by_category).map(([label, score]) => `<div class="metric">
          ${escapeHtml(categoryLabel(label))}
          <strong>${score}/100</strong>
        </div>`).join("")}
      </div>
    </section>

    <section class="section">
      <h2>DSGVO und Dokumentation</h2>
      <p><strong>Status:</strong> ${escapeHtml(dsgvoStatusLabel(report.dsgvo_compliance.status))}</p>
      <p><strong>Haftungseinschätzung:</strong> ${escapeHtml(report.dsgvo_compliance.liability_risk)}</p>
      <p><strong>Fehlende Dokumente:</strong> ${report.dsgvo_compliance.missing_documents.length > 0 ? escapeHtml(report.dsgvo_compliance.missing_documents.join(", ")) : "Keine wesentlichen Lücken angegeben."}</p>
    </section>

    <section class="section">
      <h2>Sofort umsetzbare Verbesserungen</h2>
      ${report.quick_wins.map((quickWin) => `<div class="quick-win">
        <strong>${escapeHtml(quickWin.action)}</strong><br />
        ${quickWin.time_minutes} Minuten · ${escapeHtml(quickWin.impact)}
      </div>`).join("")}
    </section>

    <footer class="footer">
      Dieser Bericht dient der internen Dokumentation und Abstimmung mit IT-Dienstleistern. Er ersetzt keine juristische Beratung.
      Monatliche Überwachung empfohlen: ${report.monthly_monitoring_recommendation ? "Ja" : "Nein"}.
    </footer>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function categoryLabel(value: string) {
  const labels: Record<string, string> = {
    access_control: "Zugänge",
    backup: "Backups",
    email_security: "E-Mail-Sicherheit",
    network: "Netzwerk/WLAN",
    dsgvo: "DSGVO",
    updates: "Updates"
  };

  return labels[value] ?? value;
}

function priorityLabel(value: Report["top_risks"][number]["priority"]) {
  if (value === "sofort") return "Sofort";
  if (value === "diese_woche") return "Diese Woche";
  return "Diesen Monat";
}

function dsgvoStatusLabel(value: Report["dsgvo_compliance"]["status"]) {
  if (value === "nicht_konform") return "Nicht konform";
  if (value === "teilweise") return "Teilweise konform";
  return "Konform";
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 42);

  return slug || "arztpraxis";
}
