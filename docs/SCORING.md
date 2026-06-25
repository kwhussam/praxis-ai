# PraxisShield Scoring 1.0.0

Die Scoring-Engine ist regelbasiert, versioniert und auditierbar. Jeder Gesamtscore entsteht aus `SCORING_RULES` in `lib/security/scoring.ts`; jede Regel liefert Punkte, Kategorie, technische Evidenz, Finding und Empfehlung.

## Kategorien

- `access_control`: Zugriffsschutz, insbesondere MFA.
- `backup`: Backup-Frequenz und dokumentierte Restore-Tests.
- `email_security`: SPF/DKIM/DMARC, aktuell mit Schwerpunkt DMARC-Policy.
- `network`: WLAN-Verschlüsselung und aktive externe oder WLAN-Findings.
- `dsgvo`: Schulungen und Datenschutzdokumentation.
- `updates`: Patch- und Update-Stand.

## Ampel

- `grün`: Score ab 75.
- `gelb`: Score ab 50.
- `rot`: Score unter 50.

Berichte und gespeicherte Checks müssen `scoring_version` mitführen, damit spätere Audits nachvollziehen können, welche Regelversion verwendet wurde.
