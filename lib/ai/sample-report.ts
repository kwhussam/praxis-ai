import type { CheckData, Report } from "@/lib/ai/report";

export const SAMPLE_REPORT: Report = {
  executive_summary:
    "Dieser Musterbericht zeigt, wie ein fertiger PraxisShield-Bericht aussieht: klare Einordnung, drei nächste Schritte und schnell umsetzbare Aufgaben.",
  overall_risk: "medium",
  security_score: 62,
  ampel: "gelb",
  top_risks: [
    {
      rank: 1,
      title: "Praxis-WLAN sollte getrennt werden",
      plain_language:
        "Gäste, Praxis-PCs und besondere Geräte sollten nicht im selben Netz sein. So bleibt ein einzelnes unsicheres Gerät besser begrenzt.",
      business_impact: "Ein fremdes oder schlecht gesichertes Gerät könnte sonst leichter andere Geräte in der Praxis erreichen.",
      action: "Bitten Sie Ihren IT-Partner bis Freitag, Gäste-WLAN, Praxis-PCs und besondere Geräte zu trennen.",
      effort_hours: "2-4 Stunden",
      cost_estimate: "IT-Dienstleister, 2-4 Stunden",
      priority: "diese_woche",
      evidence_source: "self_reported",
      reliability: "medium"
    },
    {
      rank: 2,
      title: "Datensicherung muss getestet werden",
      plain_language:
        "Eine Datensicherung hilft nur, wenn die Wiederherstellung wirklich funktioniert. Ein kurzer Test schafft Sicherheit.",
      business_impact: "Bei Ausfall oder Verschlüsselung durch Schadsoftware kann die Praxis schneller wieder arbeiten.",
      action: "Lassen Sie bis Ende der Woche eine Wiederherstellung aus der Datensicherung testen.",
      effort_hours: "1-2 Stunden",
      cost_estimate: "Intern oder IT-Dienstleister, 1-2 Stunden",
      priority: "diese_woche",
      evidence_source: "self_reported",
      reliability: "medium"
    },
    {
      rank: 3,
      title: "Schutz gegen gefälschte Praxis-Mails fehlt noch",
      plain_language:
        "Angreifer könnten E-Mails verschicken, die so aussehen, als kämen sie von Ihrer Praxisadresse.",
      business_impact: "Patienten oder Mitarbeitende könnten gefälschte Nachrichten eher für echt halten.",
      action: "Bitten Sie Ihren IT-Partner bis Freitag, den Schutz gegen gefälschte Praxis-Mails zu aktivieren.",
      effort_hours: "1-2 Stunden",
      cost_estimate: "IT-Dienstleister, 1-2 Stunden",
      priority: "diese_woche",
      evidence_source: "not_checked",
      reliability: "low"
    }
  ],
  scores_by_category: {
    access_control: 60,
    backup: 55,
    email_security: 45,
    network: 58,
    dsgvo: 72,
    updates: 70
  },
  dsgvo_compliance: {
    status: "teilweise",
    missing_documents: ["Löschkonzept", "Nachweis zur letzten Datensicherung"],
    liability_risk: "Die wichtigsten Unterlagen sind teilweise vorhanden. Einzelne Nachweise sollten ergänzt werden."
  },
  quick_wins: [
    {
      action: "Bitten Sie Ihren IT-Partner bis Freitag, den Schutz gegen gefälschte Praxis-Mails zu aktivieren.",
      time_minutes: 45,
      impact: "Verringert das Risiko, dass gefälschte E-Mails im Namen der Praxis glaubwürdig wirken."
    },
    {
      action: "Lassen Sie bis Ende der Woche eine Wiederherstellung aus der Datensicherung testen.",
      time_minutes: 60,
      impact: "Zeigt, ob die Praxisdaten im Ernstfall wieder nutzbar sind."
    },
    {
      action: "Benennen Sie heute eine Person, die offene IT-Sicherheitsaufgaben verfolgt.",
      time_minutes: 15,
      impact: "Verhindert, dass wichtige Aufgaben zwischen Praxis und IT-Partner liegen bleiben."
    }
  ],
  not_checked_limitations: [
    {
      area: "WLAN und lokale Geräte",
      reason: "Dies ist ein Musterbericht. Ein echter WLAN-Scan wurde noch nicht ausgeführt.",
      impact: "Router, Kartenterminal, TI-Konnektor und Praxis-PCs können erst nach dem Scan bewertet werden."
    }
  ],
  monthly_monitoring_recommendation: true
};

export const SAMPLE_REPORT_SOURCE: CheckData = {
  practiceId: "sample-report",
  practiceName: "Demo-Praxis Dr. Mustermann",
  domain: "demo.praxisshield.de",
  questionnaire: {},
  wlan: null,
  external: null,
  score: SAMPLE_REPORT.security_score
};

export function createFallbackReport(data: CheckData): Report {
  return {
    ...SAMPLE_REPORT,
    executive_summary:
      "Der KI-Dienst war gerade nicht erreichbar. Deshalb zeigen wir einen lokalen Beispielbericht mit konkreten nächsten Schritten, damit die Ansicht testbar bleibt.",
    security_score: typeof data.score === "number" ? Math.max(0, Math.min(100, Math.round(data.score))) : SAMPLE_REPORT.security_score,
    scores_by_category: SAMPLE_REPORT.scores_by_category,
    top_risks: SAMPLE_REPORT.top_risks,
    quick_wins: SAMPLE_REPORT.quick_wins
  };
}
