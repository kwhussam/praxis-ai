# Sicherheitsrichtlinie

## Unterstützte Versionen

PraxisShield befindet sich vor der allgemeinen Verfügbarkeit. Sicherheitskorrekturen werden nur
für den aktuellen Stand des Standardbranches und die jeweils aktuelle produktive Mobile-Version
bereitgestellt. Ältere Vorabversionen erhalten keine separaten Sicherheitsupdates.

## Schwachstellen vertraulich melden

Bitte keine vermutete Schwachstelle, Zugangsdaten, personenbezogenen Daten oder Praxisdaten in
einem öffentlichen Issue veröffentlichen. Verwenden Sie stattdessen GitHubs Funktion
[Privately report a security vulnerability](https://github.com/kwhussam/praxis-ai/security/advisories/new).

Eine gute Meldung enthält betroffene Version und Plattform, reproduzierbare Schritte, erwartete
Auswirkung und – soweit sicher möglich – einen minimalen Nachweis ohne echte Patienten- oder
Praxisdaten. Automatisierte produktive Scans und Zugriffe auf Daten anderer Praxen sind nicht
zulässig.

## Reaktions- und Patchziele

| Einstufung | Erste qualifizierte Rückmeldung | Ziel für Eindämmung | Ziel für Korrektur |
|---|---:|---:|---:|
| Kritisch | 1 Arbeitstag | 24 Stunden | 72 Stunden |
| Hoch | 2 Arbeitstage | 3 Kalendertage | 7 Kalendertage |
| Mittel | 5 Arbeitstage | nach Risikobewertung | 30 Kalendertage |
| Niedrig | 10 Arbeitstage | nach Risikobewertung | 90 Kalendertage |

Die Frist beginnt nach reproduzierbarer Bestätigung. Falls ein sicheres Update in der Zielzeit nicht
möglich ist, wird zunächst eine dokumentierte Eindämmung, Abschaltung oder ein Kill Switch
eingesetzt. Datenschutzverletzungen und meldepflichtige Vorfälle folgen zusätzlich dem Incident-
und Datenschutzprozess; diese Richtlinie ersetzt keine gesetzlichen Fristen.

## Koordinierte Offenlegung

PraxisShield bestätigt Eingang und Einstufung vertraulich, hält die meldende Person über wesentliche
Statusänderungen auf dem Laufenden und stimmt eine Veröffentlichung nach Bereitstellung einer
Korrektur ab. Es gibt derzeit kein Bug-Bounty- oder Vergütungsversprechen.
