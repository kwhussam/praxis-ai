# PraxisShield Scoring 1.0.0

Die Scoring-Engine ist regelbasiert, versioniert und auditierbar. Jeder Gesamtscore entsteht aus `SCORING_RULES` in `lib/security/scoring.ts`; jede Regel liefert Punkte, Kategorie, technische Evidenz, Finding und Empfehlung.

## Evidence & Coverage

Zusätzlich zum Sicherheitswert berechnet die Engine einen separaten `evidence_coverage_score`. Dieser Wert verändert den Sicherheits-Score nicht, sondern bewertet, wie belastbar die Datengrundlage je Prüfmodul ist.

Jedes `rule_results`-Element enthält `evidence_coverage` mit:

- `source`: `measured`, `inferred`, `self_reported` oder `unavailable`.
- `score`: Coverage-Wert von 0 bis 100 für dieses Prüfmodul.
- `label`: deutschsprachige Anzeige für die UI.
- `detail`: kurze Begründung der Einordnung.

Die Gewichtung erfolgt anhand der maximalen Regelpunkte:

- `measured` = 100: technisch gemessen, z. B. WLAN-Verschlüsselung oder DMARC aus externem Check.
- `inferred` = 70: aus anderen Befunden abgeleitet, z. B. aggregierte aktive Findings.
- `self_reported` = 45: per Fragebogen/Selbstauskunft erfasst.
- `unavailable` = 0: nicht verfügbar oder nicht zuverlässig auslesbar.

## Kategorien

- `access_control`: Zugriffsschutz, insbesondere MFA.
- `backup`: Backup-Frequenz und dokumentierte Restore-Tests.
- `email_security`: SPF/DKIM/DMARC, aktuell mit Schwerpunkt DMARC-Policy.
- `network`: WLAN-Verschlüsselung, aktive externe/WLAN-Findings und lokale technische Netzwerkprüfungen.
- `dsgvo`: Schulungen und Datenschutzdokumentation.
- `updates`: Patch- und Update-Stand.

## Ampel

- `grün`: Score ab 75.
- `gelb`: Score ab 50.
- `rot`: Score unter 50.

Berichte und gespeicherte Checks müssen `scoring_version` mitführen, damit spätere Audits nachvollziehen können, welche Regelversion verwendet wurde.

## Lokale Netzwerkprüfungen

Der WLAN-Scanner erzeugt strukturierte `NetworkSecurityFinding`-Objekte für WLAN-Verschlüsselung, WPA3-Empfehlung, Router-HTTP, Telnet, SMB, UPnP/SSDP, RDP, Datenbankports, Drucker-, NAS-, Kamera-/IoT-Hinweise, vorsichtige medizinische Geräte-Metadaten, IPv6, DNS-Resolver, DHCP-Konsistenz, Gastnetz-Heuristik, Segmentierungs-Score, Rogue-AP-/Rogue-Device-Hinweise, Router-Firmware-Hinweise, Default-Passwort-Risiko und Firewall-Basischeck. Kritische Dienste wie Telnet, RDP oder offen erreichbare Datenbankports reduzieren den lokalen WLAN-Risikoscore direkt über `scoreImpact`; das globale Scoring berücksichtigt die aggregierten Befunde zusätzlich über `NETWORK_SECURITY_PROBES`.

Die Prüfungen sind local-first und dürfen keine Patientendaten, Dateien, SMB-/NFS-Freigaben, Druckjobs, Datenbankinhalte oder medizinische Protokollinhalte lesen. Nicht verfügbare native Plattformfunktionen werden als `unknown`/`unavailable` dokumentiert und nicht als offene Ports gewertet. JetDirect 9100 wird nur per TCP-Connect geprüft; es werden keine Nutzdaten an RAW-Druckports gesendet.
