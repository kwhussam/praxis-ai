# Gesundheitsprofil – Kontrollkatalog

> Status: W4, erster freigegebener MVP-Schnitt (2026-07-23)
>
> Zweck: Fachliche Herkunft, Anwendbarkeit und Produktgrenzen
> gesundheitsbezogener Kontrollen nachvollziehbar dokumentieren.

Das Gesundheitsprofil ergänzt die allgemeine Praxisbasis. Es ersetzt weder
eine Rechtsberatung noch eine vollständige Prüfung der
KBV-IT-Sicherheitsrichtlinie. Ein positives Ergebnis bedeutet ausschließlich,
dass die in der jeweiligen Kontrolle genannte Evidenz erhoben wurde.

## Verbindliche Modellregeln

- Profil `general`: allgemeine Kontrollen; gesundheitsbezogene Kontrollen sind
  `not_applicable` und werden neutral aus Score und Coverage entfernt.
- Profil `health`: allgemeine Kontrollen plus anwendbare
  Gesundheitskontrollen.
- Noch ungeklärte Anwendbarkeit ist `conditional` + `unknown`, nie automatisch
  `not_applicable`.
- Jede nicht anwendbare oder bedingte Kontrolle erhält einen
  `applicability_reason`.
- Änderungen, die den Profilnenner beeinflussen, benötigen eine neue
  `SCORING_VERSION`.

## MVP-Kontrolle 1: Segmentierung medizinischer Großgeräte

| Feld | Wert |
|---|---|
| Rule-ID | `HEALTH_MEDICAL_DEVICE_SEGMENTATION` |
| Control-ID | `KBV-ITS-ANLAGE4-6` |
| Profil | `health` |
| Bedingung | Medizinische Großgeräte werden eingesetzt |
| Evidenz im MVP | Geführte Selbstauskunft |
| Punkte | 10, bei Selbstauskunft mit bestehendem Evidence-Cap |
| Management-Empfehlung | Großgeräte in einem abgegrenzten Segment betreiben und nur notwendige Verbindungen erlauben |

Anwendbarkeit:

- Gerätebestand ungeklärt → `conditional` / `unknown`
- keine medizinischen Großgeräte → `not_applicable`
- Großgeräte vorhanden, Segmentierung ungeklärt → `applicable` / `unknown`
- Großgeräte vorhanden, Segmentierung bestätigt → `met`
- Großgeräte vorhanden, Segmentierung verneint → `not_met`

Fachliche Grundlage:

- [KBV: Anlage 4 – zusätzliche Anforderungen für medizinische Großgeräte](https://hub.kbv.de/pages/viewpage.action?pageId=63537352)
- [KBV: IT-Sicherheit – Anlagen und Praxisgrößen](https://www.kbv.de/praxis/digitalisierung/it-sicherheit)
- [KBV PraxisWissen IT-Sicherheit, Stand Mai 2025](https://www.kbv.de/documents/infothek/publikationen/praxiswissen/praxiswissen-it-sicherheit.pdf)

## Noch nicht als Scoring-Kontrolle freigegeben

Folgende Bereiche sind fachlich relevant, benötigen aber vor der Aufnahme
jeweils eine präzise Anwendbarkeitsfrage, Evidenzdefinition und Gewichtung:

- Schutz dezentraler TI-Komponenten (KBV Anlage 5)
- sichere Konfiguration und Wartung medizinischer Großgeräte
- Deaktivierung unnötiger Dienste, Schnittstellen und Benutzerkonten
- Protokollierung und Auswertung bei medizinischen Großgeräten
- KIM-Einrichtung und Betriebsnachweise
- größenabhängige Zusatzanforderungen nach KBV Anlagen 2 und 3

Diese Punkte dürfen bis zur fachlichen Freigabe als Hinweis oder
Erhebungsbedarf erscheinen, aber nicht als behauptete Konformitätsbewertung in
Score oder Kundenbericht.
