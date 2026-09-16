export type CanonicalPdfReport = {
  executive_summary: string;
  security_score: number;
  ampel: "rot" | "gelb" | "grün";
  top_risks: Array<{
    rank: number;
    title: string;
    action: string;
    priority: "sofort" | "diese_woche" | "diesen_monat";
    evidence_source: "measured" | "inferred" | "self_reported" | "not_checked" | "unavailable";
    reliability: "high" | "medium" | "low";
  }>;
  scores_by_category: Record<string, number>;
  dsgvo_compliance: {
    status: string;
    missing_documents: string[];
    liability_risk: string;
  };
  quick_wins: Array<{ action: string; time_minutes: number; impact: string }>;
  not_checked_limitations: Array<{ area: string; reason: string; impact: string }>;
};

export type CanonicalPdfManifest = {
  assessment_snapshot: { id: string };
  generated_at: string;
  scoring_version: string;
  report_format_version: string;
  pdf_template_version: string;
};

export function buildPdfSections(input: {
  reportId: string;
  practiceName: string;
  domain?: string;
  report: CanonicalPdfReport;
  manifest: CanonicalPdfManifest;
  manifestSha256: string;
}) {
  return [
    "Deckblatt",
    `PraxisShield AI Sicherheitsbericht für ${input.practiceName}`,
    `Report-ID: ${input.reportId}`,
    `Assessment-Manifest-ID: ${input.manifest.assessment_snapshot.id}`,
    `Manifest-SHA-256: ${input.manifestSha256}`,
    `Format-Version: ${input.manifest.report_format_version}`,
    `Scoring-Version: ${input.manifest.scoring_version}`,
    `PDF-Template-Version: ${input.manifest.pdf_template_version}`,
    `Domain: ${input.domain ?? "nicht angegeben"}`,
    `Erstellt: ${input.manifest.generated_at}`,
    "",
    "Rechtlicher Hinweis",
    "Dieser Bericht ist eine technische Momentaufnahme und ersetzt keine Rechtsberatung oder vollständigen Penetrationstest.",
    "",
    "Executive Summary",
    input.report.executive_summary,
    "",
    "Security Score",
    `Score: ${input.report.security_score}/100`,
    `Ampel: ${input.report.ampel.toUpperCase()}`,
    ...Object.entries(input.report.scores_by_category).map(([category, score]) => `${category}: ${score}/100`),
    "",
    "Kritische Risiken",
    ...input.report.top_risks
      .filter((risk) => risk.priority === "sofort")
      .map(
        (risk) =>
          `${risk.rank}. ${risk.title}: ${risk.action} (Evidenz: ${evidenceSourceLabel(risk.evidence_source)}, Zuverlaessigkeit: ${reliabilityLabel(risk.reliability)})`
      ),
    "",
    "Warnungen",
    ...input.report.top_risks
      .filter((risk) => risk.priority !== "sofort")
      .map(
        (risk) =>
          `${risk.rank}. ${risk.title}: ${risk.action} (Evidenz: ${evidenceSourceLabel(risk.evidence_source)}, Zuverlaessigkeit: ${reliabilityLabel(risk.reliability)})`
      ),
    "",
    "Nicht geprueft / technische Einschraenkungen",
    ...(input.report.not_checked_limitations.length > 0
      ? input.report.not_checked_limitations.map(
          (limitation) => `${limitation.area}: ${limitation.reason} Auswirkung: ${limitation.impact}`
        )
      : ["Keine Einschraenkungen im KI-Bericht angegeben. Dies ersetzt keine Vollpruefung."]),
    "",
    "Geltungsbereich gepruefter Kontrollen",
    "Positive Aussagen gelten nur fuer die tatsaechlich gemessenen oder nachgewiesenen Kontrollen. Nicht gepruefte Bereiche sind nicht als sicher zu werten.",
    "",
    "DSGVO-Status",
    `Status: ${input.report.dsgvo_compliance.status}`,
    `Haftungsrisiko: ${input.report.dsgvo_compliance.liability_risk}`,
    `Fehlende Dokumente: ${input.report.dsgvo_compliance.missing_documents.join(", ") || "keine angegeben"}`,
    "",
    "Maßnahmenplan",
    ...input.report.quick_wins.map((quickWin) => `${quickWin.action} (${quickWin.time_minutes} Minuten): ${quickWin.impact}`),
    "",
    "Methodik",
    "Geprüft wurden Fragebogenangaben, externe Domainsignale und optional lokale WLAN-Messwerte mit dokumentierter Datenherkunft.",
    "",
    "Über PraxisShield",
    "PraxisShield AI unterstuetzt Arztpraxen und IT-Partner bei Cybersecurity-Transparenz, DSGVO-Dokumentation und Monitoring."
  ];
}

export function buildSimplePdf(lines: string[]) {
  const cleanLines = lines.flatMap((line) => wrapPdfLine(line, 86));
  const pages = chunkArray(cleanLines.length > 0 ? cleanLines : [""], 46);
  const fontObjectId = 3 + pages.length * 2;
  const pageObjectIds = pages.map((_page, index) => 3 + index * 2);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`
  ];

  pages.forEach((pageLines, index) => {
    const contentObjectId = 4 + index * 2;
    const stream = [
      "BT",
      "/F1 12 Tf",
      "50 790 Td",
      "16 TL",
      ...pageLines.map((line) => `<${pdfWinAnsiHex(line)}> Tj T*`),
      "ET"
    ].join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
    );
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  let body = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return body;
}

function evidenceSourceLabel(value: CanonicalPdfReport["top_risks"][number]["evidence_source"]) {
  if (value === "measured") return "gemessen";
  if (value === "inferred") return "heuristisch";
  if (value === "self_reported") return "Selbstauskunft";
  if (value === "not_checked") return "nicht geprueft";
  return "nicht verfuegbar";
}

function reliabilityLabel(value: CanonicalPdfReport["top_risks"][number]["reliability"]) {
  if (value === "high") return "hoch";
  if (value === "medium") return "mittel";
  return "niedrig";
}

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

function wrapPdfLine(value: string, maxLength: number) {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (`${current} ${word}`.trim().length > maxLength) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function pdfWinAnsiHex(value: string) {
  const extension: Record<string, number> = {
    "€": 0x80,
    "‚": 0x82,
    "ƒ": 0x83,
    "„": 0x84,
    "…": 0x85,
    "†": 0x86,
    "‡": 0x87,
    "ˆ": 0x88,
    "‰": 0x89,
    "Š": 0x8a,
    "‹": 0x8b,
    "Œ": 0x8c,
    "Ž": 0x8e,
    "‘": 0x91,
    "’": 0x92,
    "“": 0x93,
    "”": 0x94,
    "•": 0x95,
    "–": 0x96,
    "—": 0x97,
    "˜": 0x98,
    "™": 0x99,
    "š": 0x9a,
    "›": 0x9b,
    "œ": 0x9c,
    "ž": 0x9e,
    "Ÿ": 0x9f
  };
  const bytes = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    if (code <= 0xff) return code;
    return extension[character] ?? 0x3f;
  });
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}
