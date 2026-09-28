# ADR-004: §-390-Kontrollinventar und Redaktionsworkflow

- Status: technisch implementiert, externe Fachfreigaben offen
- Datum: 2026-09-24
- Arbeitspaket: SP3-05
- Rechtsgrundlage: § 390 SGB V
- Richtlinienquelle: KBV, „Richtlinie nach § 390 SGB V über die Anforderungen zur Gewährleistung der IT-Sicherheit“, veröffentlicht am 31.03.2025, in Kraft seit 01.04.2025
- Manuell verifizierter Quell-SHA-256: `04a4b7a28b7806a4d9f518dff82f849b92076016762860df87ae50795dd7f96d`

## Entscheidung

PraxisShield führt die KBV-Anforderungen als globales, Git-versioniertes Content-as-Code-
Inventar. Der Katalog ist keine mandantenbezogene Datenbanktabelle und enthält keine Praxis-,
Patienten- oder Beschäftigtendaten. Git-Historie, Pull-Request-Review und CI bilden das
unveränderliche Redaktionsjournal.

Die 92 Richtlinienzeilen werden mit stabilen IDs der Form `KBV-390-Ax-nnn` geführt:

| Anlage | Geltungsbereich | Anzahl |
|---|---|---:|
| 1 | Anforderungen für Praxen | 50 |
| 2 | zusätzliche Anforderungen für mittlere und große Praxen | 10 |
| 3 | zusätzliche Anforderungen für Großpraxen | 17 |
| 4 | Nutzung medizinischer Großgeräte | 6 |
| 5 | dezentrale Komponenten der Telematikinfrastruktur | 9 |
| **Gesamt** | | **92** |

Die drei leeren, bei der PDF-Extraktion sichtbaren Zeilen auf den Seiten 10, 16 und 19 sind
Seitenfortsetzungen und keine zusätzlichen Anforderungen.

## Quellenbindung

Der technische Import dokumentiert:

- die kanonische HTTPS-URL der KBV;
- Veröffentlichungs- und Inkrafttretedatum;
- den am 23.09.2026 manuell verifizierten SHA-256 des 19-seitigen PDF;
- Anlage, laufende Nummer und PDF-Seite je Kontrolle;
- offizielles Zielobjekt und den Titel der Spalte „Anforderung“.

Die Erläuterungstexte werden nicht dupliziert. Die Quellseite bleibt der normative Bezug. Das
verhindert unbemerkte lokale Textabweichungen und reduziert die urheberrechtlich unnötige
Vervielfältigung. Eine neue KBV-Fassung erhält eine neue Katalog-ID und muss als vollständiger
Diff geprüft werden; bestehende Releases werden nicht überschrieben.

Die CI lädt die externe PDF bewusst nicht und hasht sie nicht automatisch: Ein Remote-Abruf wäre
als Buildvoraussetzung nicht reproduzierbar. Der automatisierte Katalogtest prüft deshalb nur das
Format des hinterlegten Hashs. Schritt 1 des Änderungsprozesses ist die ausdrücklich manuelle
Beschaffung und Hashprüfung einer neuen KBV-Fassung; erst das geprüfte Ergebnis wird versioniert.

## Inkrafttreten

Die in Abschnitt B Nummer 2 der Richtlinie genannten neuen Anforderungen werden mit
`effective_from = 2025-10-01` geführt. Alle übrigen Einträge tragen `2025-04-01`. Da beide Daten
in der Vergangenheit liegen, ist dies kein Freigabesignal: Gültigkeit der Quelle und redaktionelle
Produktfreigabe sind getrennte Zustände.

## Anwendbarkeit

Anwendbarkeit wird niemals allein aus dem Vorhandensein einer Katalogzeile abgeleitet:

- Anlage 1 gilt größenunabhängig, soweit das Zielobjekt genutzt wird;
- Anlage 2 gilt zusätzlich für mittlere und große Praxen;
- Anlage 3 gilt zusätzlich nur für Großpraxen beziehungsweise Praxen mit Datenverarbeitung in
  erheblichem Umfang;
- Anlage 4 gilt bei Nutzung medizinischer Großgeräte;
- Anlage 5 gilt für vorhandene dezentrale TI-Komponenten;
- unbekannte Praxisgröße sowie unbekannte Geräte-, TI- oder Zielobjektnutzung ergibt
  `conditional`, niemals automatisch
  `not_applicable` oder `met`.

Zielobjekte werden technisch über kanonische, sprachunabhängige IDs referenziert. Die deutschen
Bezeichnungen bleiben reine Quelllabels. Unbekannte oder doppelte IDs machen das Inventar
ungültig und führen zu `conditional`; ein Schreibfehler kann daher nicht still
`not_applicable` erzeugen.

Die vorhandene MVP-Kontrolle `KBV-ITS-ANLAGE4-6` bleibt als Legacy-Alias an
`KBV-390-A4-006` gebunden. Diese technische Zuordnung ändert weder Scoring noch Claims.

## Redaktionsstatus

Jede Kontrolle durchläuft ausschließlich folgende Vorwärtsfolge:

1. `mapped`: Quelle, ID, Geltungsbereich und Entwurfszuordnung sind technisch erfasst;
2. `reviewed`: alle drei voneinander getrennten Reviews sind dokumentiert;
3. `released`: ein unabhängiger Product Owner gibt genau den geprüften Inhalts-Hash frei.

Der Quellkatalog selbst trägt keinen Redaktionsstatus und wird zur Laufzeit tief eingefroren.
Fortschritt wird in einem separaten, quell- und hashgebundenen Redaktionsdatensatz geführt; ein
neu erzeugter Datensatz beginnt auf `mapped`. Die Released-Auswahl
verknüpft beide Ebenen erst nach vollständiger Runtime-Validierung. Damit existiert kein zweiter,
direkt im Katalog umschaltbarer Freigabeschalter.

Der Inhalts-Hash wird nicht vom Aufrufer geliefert. Die Workflow-Implementierung bildet ihn als
SHA-256 aus einer fest strukturierten, kanonisierten Projektion aller freigaberelevanten
Quellfelder und des vollständigen Mappings. Jeder Review-, Release- und Auswahlvorgang berechnet
ihn erneut gegen die kanonische Kontrolle. Inhaltsdrift scheitert geschlossen. Zur Laufzeit
zurückgegebene Kontroll- und Redaktionsobjekte sind tief eingefroren.

Pflichtreviews:

- `healthcare_compliance`: Richtlinienbezug, Anwendbarkeit und fachliche Aussage;
- `security_architecture`: Evidenzanforderung, Messbarkeit und technische Grenzen;
- `privacy_legal`: Datenschutz, Rechts-/Nachweisformulierungen und zulässige Claims.

Mapper dürfen ihre eigene Zuordnung nicht reviewen. Ein Reviewer darf nicht als Product Owner
freigeben. Statussprünge, doppelte Reviewdomänen, geänderte Inhalts-Hashes und Änderungen an
bereits freigegebenen Datensätzen scheitern geschlossen.

Zeitstempel dürfen höchstens zwei Minuten vor der auswertenden Systemuhr liegen; weiter in der
Zukunft liegende Aktionen werden abgewiesen.

## Produktgrenze

Für die 92 importierten Anforderungen existiert zunächst kein freigegebener Redaktionsdatensatz.
`getReleasedKbv390Controls` liefert deshalb aktuell eine leere Liste. Weder Score, Ampel,
Complianceaussage noch Kundenbericht darf aus `mapped` oder `reviewed` gespeist werden.

Eine Kontrolle im Modus `assessment_eligible` darf erst veröffentlicht werden, wenn mindestens
eine Evidenzanforderung und eine konkrete Produkt-Control-ID freigegeben sind. Der Modus
`informational_only` erlaubt nach vollständigem Review einen reinen Hinweis, aber weiterhin keine
Konformitätsbehauptung.

## Änderungsprozess

1. KBV-Quelle und Veröffentlichungsmetadaten manuell aus der offiziellen Quelle laden, Hash
   bilden und die Prüfung mit Datum dokumentieren.
2. Neuen Katalog anlegen; bestehende Katalogversion niemals mutieren.
3. 92er-Zählung beziehungsweise neue offizielle Sollzahl, Anlagenfolgen und Seitenbezüge prüfen.
4. Geänderte Anforderungen erneut auf `mapped` setzen.
5. Alle drei Reviewdomänen mit namentlichen Verantwortlichen durchlaufen.
6. Erst nach Product-Owner-Freigabe `released` setzen und separat in Score/Report integrieren.
7. Abgelöste Produktzuordnungen über eine neue Version migrieren; alte Assessment-Snapshots
   behalten ihre ursprüngliche Katalog-ID.

## Verifikation und offene Gates

Automatisierte Tests prüfen Anzahl, Anlagenzählung, stabile IDs, tiefe Runtime-Immutability,
fehlendes Release ungeprüfter Kontrollen, unbekannte Praxisgröße, kanonische Zielobjekt-IDs,
Anwendbarkeitsgrenzen, Vier-Augen-Trennung, abgeleiteten Inhalts-Hash, Driftabwehr,
Zeitstempelgrenze und Releasevoraussetzungen. Sie bestätigen nicht automatisch die Bytes der
extern gehosteten PDF.

Offen bis `released`:

- namentliche Freigabe aller fachlichen Zuordnungen und Evidenzdefinitionen;
- Rechts-/Datenschutzprüfung der Produktformulierungen;
- Zuordnung zu messbaren beziehungsweise selbstauskunftsbasierten Produktkontrollen;
- Versions- und Migrationsreview bei einer neueren KBV-Richtlinie;
- End-to-End-Abnahme in SP3-06.

Dieses ADR bestätigt ausschließlich die technische Vollständigkeit des Inventars und des
Workflows. Es ist keine Rechtsberatung und keine Bestätigung, dass eine Praxis die Richtlinie
erfüllt.
