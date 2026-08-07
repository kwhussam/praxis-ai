# PraxisShield — Vollständige Expertenanalyse und Produkt-Backlog

**Stand:** 2026-08-06 · **Basis:** Code-Review des Repos `Praxis-AI` (main @ e5462e2)
**Perspektiven:** Cybersecurity Consultant · Pentester · IT-Auditor · Netzwerkadministrator · Software-Architekt · Mobile-Entwickler · UX-Designer · Praxisinhaber · IT-Dienstleister · Laie

---

## 0. Gesamturteil aus CTO-Sicht

**Kurzfassung:** Das Fundament ist deutlich besser als bei fast allen vergleichbaren Produkten — und die Scan-Tiefe ist deutlich schlechter, als das Produkt suggeriert. Genau diese Asymmetrie ist das zentrale Risiko.

Das Evidenzmodell (`measured` / `inferred` / `self_reported` / `not_checked` / `unavailable`) mit Punkte-Kappung bei Selbstauskunft und einer vom Score entkoppelten Ampel mit Audit-Trail ist konzeptionell **auditorentauglich**. Das hat weder Fing noch Nessus noch Microsoft Secure Score in dieser Form. Das ist der eigentliche Vermögenswert des Projekts.

Dem gegenüber steht: **Von zehn deklarierten nativen Netzwerk-Probes existieren auf Android fünf, auf iOS drei.** Die restlichen liefern dauerhaft `unavailable`. Das Scoring lügt darüber nicht — aber ganze Bewertungsmodule laufen auf Daten, die nie ankommen. Das Produkt verkauft Tiefe, die technisch noch nicht existiert.

**Die drei Entscheidungen, die ich als CTO zuerst treffen würde:**

1. **Ehrlichkeitsgrenze halten, Tiefe nachziehen.** Entweder die fehlenden Probes bauen oder die zugehörigen Module aus der Oberfläche nehmen. Halbfertige Prüfmodule in einem Audit-Produkt sind ein Haftungsrisiko, kein Feature.
2. **Desktop-Agent ist keine Option, sondern Voraussetzung.** Ohne ihn bleiben vier von sechs Scoring-Kategorien dauerhaft `self_reported` und damit bei 50 % Punktkappung. Der Score hat eine strukturelle Decke, die kein Mobile-Feature durchbricht.
3. **KBV-§75b-Mapping statt CVE-Wettrüsten.** Gegen Nessus/Greenbone ist die Scan-Tiefe nicht zu gewinnen. Gegen sie zu gewinnen ist die Frage „Erfüllt meine Praxis die IT-Sicherheitsrichtlinie nach § 75b SGB V?" — die keiner von ihnen beantwortet.

**Reifegrad-Einschätzung:**

| Bereich | Reife | Kommentar |
|---|---|---|
| Scoring- & Evidenzmodell | 8/10 | Herausragend, versioniert, testbar |
| Multi-Tenancy / RLS / Backoffice | 7/10 | pgTAP-Cross-Tenant-Tests, MFA, Audit-Log, Privacy-Endpunkte |
| Fragebogen / Compliance-Erhebung | 7/10 | Sehr umfangreich, evidenzorientiert formuliert |
| Netzwerk-Scan (tatsächlich) | 3/10 | Große Lücke zwischen Anspruch und Implementierung |
| Router-Analyse | 1/10 | Praktisch nicht vorhanden |
| Geräteerkennung | 3/10 | Klassifikator gut, Datenquellen fehlen |
| UX für Nicht-ITler | 4/10 | Score ohne Handlungspfad |
| Architektur (Worker) | 4/10 | 5.132-Zeilen-Monolith |
| Reporting / KI | 5/10 | Struktur da, Wirkung flach |

---

## 1. Verifizierte kritische Befunde

Alles hier ist am Code belegt, nicht angenommen.

### B-1 — Fünf von zehn nativen Probes existieren nicht (kritisch)

`lib/security/networkProbes.ts:23-33` deklariert zehn native Methoden. Tatsächlich implementiert:

| Methode | Android | iOS |
|---|---|---|
| `getWifiSecurityDetails` | ✅ | ✅ |
| `probeTcpPorts` | ✅ | ✅ |
| `probeSsdp` | ✅ | ✅ |
| `scanDevices` | ✅ | ❌ |
| `getIpv6NetworkInfo` | ✅ | ❌ |
| `discoverMdnsServices` | ❌ | ❌ |
| `probeSnmpBasic` | ❌ | ❌ |
| `probeSmbSecurity` | ❌ | ❌ |
| `resolveDnsTestDomains` | ❌ | ❌ |
| `probeIpv6TcpPorts` | ❌ | ❌ |

**Folge:** SMBv1-Erkennung, SMB-Signing, Guest-Access, mDNS-Discovery, SNMP-`sysDescr`, DNS-Filter-Test liefern immer `unavailable`. Der Geräteklassifikator (`lib/security/deviceClassification.ts:69-93`) sammelt Signale aus mDNS-, SNMP- und SSDP-Antworten — zwei der drei besten Quellen kommen nie an. Die Klassifikation fällt faktisch auf „offene Ports + SSDP" zurück.

Das ist kein Bug im Sinne eines Absturzes, sondern eine **Produktversprechen-Lücke**. Der Fragebogen fragt nach SMB-Härtung, das Scoring hat ein SMB-Feld, die Dokumentation nennt SMB — nur gemessen wird nie.

### B-2 — Android-Gerätescan ist auf modernen Geräten tot (kritisch)

`PraxisShieldNetworkProbeModule.kt:51` liest `/proc/net/arp`. Seit **Android 10 (API 29)** ist der Zugriff durch SELinux für Apps gesperrt; `canRead()` liefert `false`, die Methode gibt still eine leere Liste zurück (Zeile 69-74, bewusst „fail closed"). Auf praktisch jedem Gerät im Feld liefert der ARP-Pfad also nichts. Übrig bleibt der aktive TCP-Sweep.

Das ist im Code sauber dokumentiert — aber `PLATFORM_LIMITATIONS.android` (`lib/security/wlan.ts:255`) formuliert es als „hängt von Android-Version ab", was den Nutzer glauben lässt, es könnte funktionieren. Realistisch: es funktioniert nicht mehr.

### B-3 — Standard-Scan trifft 11 feste IPs (hoch)

`lib/security/wlan.ts:1202-1224`: Im Modus `standard` werden nur `.1, .2, .10, .20, .50, .100, .101, .150, .200, .254` plus Gateway geprüft. Eine typische FRITZ!Box vergibt DHCP fortlaufend ab `.20` — ein Praxisnetz mit 14 Geräten auf `.21`–`.34` ist damit **vollständig unsichtbar**. Nur der `audit`-Modus macht einen echten Subnetz-Sweep.

Ein Scan, der „keine Geräte gefunden" meldet, obwohl 14 aktiv sind, produziert falsche Sicherheit. Das ist schlimmer als kein Scan.

### B-4 — Port-Katalog ignoriert die medizinische Domäne (kritisch für die Zielgruppe)

`lib/security/servicePortCatalog.ts` enthält **11 Ports**. Es fehlen unter anderem:

- **DICOM 104 / 11112** und **HL7-MLLP 2575** — die Protokolle, über die Röntgen, PACS, Ultraschall und Praxissoftware sprechen. Historisch häufig **ohne Authentifizierung**. Das ist für ein Arztpraxis-Produkt die wichtigste Einzellücke im gesamten Katalog.
- **SICCT 4742** — eHealth-Kartenterminals der Telematikinfrastruktur.
- SSH 22, FTP 21, VNC 5900/5901, LDAP 389/636, MSSQL 1433, MongoDB 27017, Redis 6379, Elasticsearch 9200, Docker 2375/2376, Kubernetes 6443/10250, Proxmox 8006, ESXi 902, SIP 5060/5061, RTSP 554, MQTT 1883/8883, WSD 5357, TR-064 49000.

Ein Produkt, das „umfassendster IT-Sicherheitscheck für Praxen" werden will, prüft aktuell keinen einzigen medizinspezifischen Port.

### B-5 — Kein Schutzmechanismus gegen Medizingeräte-Störung (kritisch, Haftung)

`probeTcpPorts` verbindet aktiv gegen alle Kandidaten-IPs. Ältere Modalitäten, Infusionspumpen und Laborgeräte sind für unerwartete TCP-Verbindungen bekannt anfällig — Geräteausfälle durch Portscans sind in der Medizintechnik dokumentiert. Der Klassifikator erkennt Medizingeräte zwar (`deviceClassification.ts:31`), **aber erst nachdem er sie gescannt hat**.

Erforderlich: Ein „Medizingeräte-Schutzmodus", der vor jedem aktiven Probe gegen die Inventarliste bekannter Medizingeräte prüft und diese Hosts ausschließlich passiv behandelt. Default: **an**.

### B-6 — Keine dokumentierte Scan-Autorisierung (hoch, rechtlich)

Aktive Netzwerkscans in fremden Netzen berühren §§ 202a/303b StGB. Für den IT-Dienstleister-Anwendungsfall (Partner scannt Praxisnetz) braucht es einen protokollierten Scan-Auftrag: wer, wann, welcher Netzbereich, welche Praxis, mit Bestätigung des Verfügungsberechtigten. Ein Consent-Log existiert (`consent_log`), ein spezifischer Scan-Autorisierungsdatensatz nicht erkennbar.

### B-7 — Worker ist ein 5.132-Zeilen-Monolith (hoch, Architektur)

`workers/hono/src/index.ts` enthält 39 Routen, alle Provider-Integrationen, das Backoffice-API, Rate-Limiting, AI-Reportgenerierung und Privacy-Endpunkte in **einer Datei**. Jede neue Provider-Anbindung bedeutet einen Eingriff in dieselbe Datei. Das skaliert nicht über zwei weitere Entwickler hinaus und macht Review praktisch unmöglich.

### B-8 — Keine CVE-/Firmware-Wissensbasis (hoch)

Der Router-Fingerprint (`routerFingerprint.ts`) erkennt Hersteller/Modell, aber es gibt keinen Abgleich gegen bekannte Schwachstellen. „Veraltete Firmware" ist ausschließlich Fragebogenwissen — also `self_reported` und damit auf 50 % gekappt. Der offensichtlichste Weg zu `measured`-Evidenz bleibt ungenutzt.

### B-9 — Keine FRITZ!Box-Integration (hoch, größter verpasster Hebel)

Die FRITZ!Box ist in deutschen Praxen der dominante Router. TR-064 ist lokal, dokumentiert, vom Hersteller vorgesehen und mit Nutzer-Credentials legitim nutzbar. Damit wären **messbar** abrufbar: Modell, Firmware-Stand, Portfreigaben, UPnP-Status, Gastnetz-Konfiguration, WLAN-Verschlüsselung je SSID, Geräteliste, WAN-Status, teils Ereignisprotokolle.

Das verwandelt in einem Schritt ein halbes Dutzend `self_reported`-Regeln in `measured`. Kein anderer Punkt im gesamten Backlog hat ein vergleichbares Verhältnis von Aufwand zu Evidenzgewinn.

### B-10 — Dashboard beantwortet nicht „Was mache ich jetzt?" (hoch, UX)

`app/(tabs)/dashboard/index.tsx` zeigt: Score-Ring, Evidence-Panel, Guidance-Card, Tarif-Karte, Score-Historie. Es gibt **keine priorisierte Maßnahmenliste als primäres Element**. Für eine Praxisinhaberin ohne IT-Kenntnisse ist eine Zahl ohne nächsten Schritt Beunruhigung, kein Nutzen. Die Tarif-Karte steht dabei prominenter als jede Sicherheitsmaßnahme — das liest sich als Vertriebsfläche, nicht als Sicherheitswerkzeug.

### B-11 — Kein Remediation-Loop (hoch, Produkt)

Der Typ `Disposition = "open" | "remediated" | "risk_accepted" | "compensating"` existiert (`scoring.ts:33`) und wird konstant auf `"open"` gesetzt (Zeile 777). Es gibt keinen Weg, eine Maßnahme als erledigt zu markieren, sie nachzuprüfen und den Score-Effekt zu sehen. Damit fehlt die Schleife, die Bindung erzeugt: **prüfen → beheben → nachweisen → besser werden**. Ohne sie ist das Produkt ein Einmal-Report.

---

## 2. Was bereits gut ist (nicht anfassen)

Damit die Kritik nicht das Falsche trifft — diese Entscheidungen sind richtig und sollten verteidigt werden:

1. **Evidenzmodell mit Punkte-Kappung.** `SELF_REPORTED_POINT_CAP_RATIO = 0.5` (`scoring.ts:169`) verhindert, dass eine Praxis sich grün behauptet. Das ist der Kern der Auditierbarkeit.
2. **Ampel entkoppelt vom Score, mit Gates.** `GREEN_HARD_REQUIREMENTS` plus `CATEGORY_MINIMUM_SCORES` plus `GREEN_EVIDENCE_CONFIDENCE_MIN = 70`. Ein Score von 88 mit schwacher Evidenz wird nicht grün. Genau richtig.
3. **`ampel_reasons` als maschinenlesbarer Audit-Trail** mit `code`, `threshold`, `actual`, `rule_id`. Das ist der Unterschied zwischen „App sagt gelb" und „nachvollziehbare Prüfentscheidung".
4. **`not_applicable` wird aus Zähler und Nenner entfernt** (`isCountedInScore`, Zeile 706), `unknown`/`conditional` bleiben im Nenner. Konservativ und korrekt.
5. **Versionierung** (`SCORING_VERSION`, Report-Format-Version). Für Wiederholbarkeit von Audits unverzichtbar.
6. **RLS als Mandantengrenze mit pgTAP-Cross-Tenant-Tests.** Selten sauber gemacht.
7. **Fragebogen fragt nach Nachweisen, nicht nach Meinungen.** „Ist der Restore-Test mit Datum, Ergebnis und Verantwortlichem dokumentiert?" ist eine Auditorenfrage, keine Checkbox.
8. **Privacy-Boundary explizit im Datenmodell** (`privacyBoundary` je Klassifikation). Gut für DSGVO-Argumentation gegenüber Praxen.

---

## 3. UX/UI-Analyse

### 3.1 Was nicht funktioniert

**Informationsarchitektur.** Fünf Tabs (Dashboard, Check, Inventory, Monitoring, Report) sind für die Zielgruppe zwei zu viel. Eine Praxisinhaberin denkt nicht in „Inventory" und „Monitoring" — sie denkt in „Wie sicher bin ich?", „Was muss ich tun?", „Ist etwas passiert?". Vorschlag: **Status · Maßnahmen · Prüfen · Berichte**, Inventar als Unterseite von Prüfen, Monitoring als Ereignis-Stream unter Status.

**Der Score-Ring ist das falsche Primärelement.** Eine Zahl von 0–100 ohne Referenz ist bedeutungslos: Ist 62 gut? Was hat die Praxis nebenan? Was ist der Mindestwert für § 75b? Der Ring sollte einer **Ampel mit einem einzigen Satz** weichen: „Gelb — drei Maßnahmen offen, davon eine dringend." Der Score gehört auf die zweite Ebene für IT-Dienstleister.

**Kein Priorisierungsmechanismus im UI.** Das Scoring liefert Severity, `risk_flags`, `core_critical_finding`, Kategorie-Minima — aber die Oberfläche macht daraus keine geordnete Liste. Jede Maßnahme sollte tragen: Dringlichkeit, geschätzter Aufwand in Minuten/Stunden, geschätzte Kosten, „selbst machbar" vs. „IT-Dienstleister nötig", und Score-Effekt nach Umsetzung.

**Sprache.** Der Code spricht durchgehend Deutsch — gut. Aber Begriffe wie „DMARC-Policy", „Evidence Confidence", „Segmentierung", „NETWORK_SECURITY_PROBES" sind für die Zielgruppe unverständlich. Es braucht zwei Darstellungsebenen: **Praxis-Sicht** (Alltagssprache, Analogien: „Ihr Gäste-WLAN ist mit dem Praxisnetz verbunden — wie eine offene Tür zwischen Wartezimmer und Aktenschrank") und **Techniker-Sicht** (Rohbefunde, Ports, Protokolle, Evidenz). Umschaltbar, nicht gemischt.

**Ladezeiten und Scan-Feedback.** Ein `audit`-Sweep über /24 mit 11 Ports und 1,4 s Timeout ist im Worst Case zweistellige Minuten. Es gibt Phasen-Fortschritt (`SCAN_PHASES`), aber keine Restzeitschätzung, keine Möglichkeit, den Scan im Hintergrund laufen zu lassen, keine Teilergebnisanzeige. Ein Nutzer, der 8 Minuten auf einen Fortschrittsbalken starrt, bricht ab.

**Farbschema.** `colors.electric` als Leitfarbe plus Glassmorphismus (`GlassCard`, `expo-blur`) ist eine Consumer-App-Ästhetik. Für ein Produkt, das einen prüffähigen Sicherheitsbericht erzeugt, den ein Praxisinhaber der KV oder einem Auditor vorlegt, wirkt das **unseriös**. Empfehlung: ruhige, kontrastreiche, dokumentennahe Gestaltung; Effekte nur dort, wo sie Zustand kommunizieren.

**Barrierefreiheit.** Zielgruppe schließt Ärztinnen und Ärzte jenseits der 60 ein. Rot/Grün-Ampel ohne Formunterscheidung ist bei Rot-Grün-Schwäche (ca. 8 % der Männer) nicht lesbar. Ampelzustände brauchen zusätzlich Symbol und Text. Dynamic Type / Schriftskalierung muss getestet sein.

### 3.2 Gamification — bewusst begrenzt einsetzen

Punkte und Badges wären hier falsch: Ein Arzt, der wegen eines Abzeichens eine Sicherheitsmaßnahme umsetzt, ist nicht das Zielbild, und es untergräbt die Ernsthaftigkeit gegenüber Auditoren. Was funktioniert:

- **Fortschritt gegen einen Standard**, nicht gegen andere: „7 von 12 Anforderungen der KBV-Richtlinie erfüllt."
- **Streak beim Monitoring**: „92 Tage ohne kritisches Ereignis."
- **Vorher/Nachher pro Maßnahme**: sichtbarer Score-Effekt direkt nach dem Nachweis.
- **Team-Fortschritt** bei Schulungen (Mitarbeitende abgehakt).

Keine Ranglisten gegen andere Praxen — das ist wettbewerbsrechtlich und psychologisch heikel.

### 3.3 Konkrete UI-Verbesserungen (priorisiert)

1. Startbildschirm = **Maßnahmenliste**, sortiert nach Dringlichkeit, mit Aufwand und Kosten je Eintrag.
2. Jede Maßnahme mit **Schritt-für-Schritt-Anleitung** für das konkret erkannte Gerät („Ihre FRITZ!Box 7590, Firmware 7.57: Menü → Heimnetz → Netzwerk → …").
3. **Abhaken + Nachprüfen**: Maßnahme als erledigt markieren, App verifiziert automatisch, Score aktualisiert sich, Nachweis landet im Bericht.
4. **Zwei-Ebenen-Sprache** (Praxis / Technik), umschaltbar.
5. **Scan im Hintergrund** mit Push-Benachrichtigung bei Abschluss, Teilergebnisse sofort sichtbar.
6. **„Für den IT-Dienstleister"-Export**: technische Rohbefunde als kompakte Liste zum Weiterleiten — der wichtigste reale Workflow, weil die Praxis die Maßnahmen fast nie selbst umsetzt.
7. Ampel mit Symbol + Text, nicht nur Farbe.
8. Tarif-Karte vom Dashboard in die Einstellungen.

---

## 4. Software-Architektur

### 4.1 Bewertung des Ist-Zustands

Die Drei-Grenzen-Trennung (App / Supabase / Worker) ist richtig gewählt und wird in `CLAUDE.md` sauber begründet. Die Schwächen liegen innerhalb der Grenzen:

- **Worker-Monolith** (B-7): keine Modultrennung, keine Provider-Abstraktion.
- **`lib/security/wlan.ts` mit 1.495 Zeilen** ist Orchestrator, Zustandsmaschine, Finding-Mapper und Persistenz in einem.
- **Keine Plugin-Architektur für Prüfungen.** Jede neue Prüfung erfordert Änderungen an Katalog, Probe-Layer, Assessment, Scoring-Regel und UI. Das ist der Grund, warum die Prüftiefe langsam wächst.
- **Kein Offline-Modus.** `expo-secure-store` für Auth, MMKV für Caches — aber keine Queue für Scans ohne Konnektivität. In Praxen mit schlechtem Mobilfunk und Gäste-WLAN-Trennung ist das ein realer Fall.
- **Keine API-Versionierung im Einsatz.** `ARCHITECTURE.md` legt `/api/v1/*` für Neues fest, alle 39 bestehenden Routen liegen unter `/api/*`.

### 4.2 Zielarchitektur

**Prüf-Engine als Plugin-System.** Der zentrale Umbau. Jede Prüfung wird ein deklaratives Modul:

```ts
interface SecurityCheckPlugin {
  id: string;                       // "smb.signing"
  version: string;
  requires: Capability[];           // ["native.tcp", "lan.access"]
  execution: "passive" | "active";
  safetyClass: "safe" | "device-sensitive";  // steuert Medizingeräte-Schutzmodus
  controlMappings: ControlRef[];    // KBV-ITS-A4-6, BSI APP.4.3, ISO A.8.20
  run(ctx: ScanContext): Promise<CheckResult>;
  toFindings(result: CheckResult): Finding[];
}
```

Vorteile: neue Prüfungen ohne Eingriff in Kern-Code; automatische Fähigkeitserkennung („dieser Check braucht den Desktop-Agent"); zentrale Durchsetzung des Medizingeräte-Schutzes; Compliance-Mapping deklarativ statt verstreut.

**Trennung in eigenständige Dienste:**

| Dienst | Verantwortung | Warum getrennt |
|---|---|---|
| Scan-Engine | Probes, Discovery, Fingerprinting | Wächst am schnellsten, braucht eigenes Testregime |
| Regel-Engine | Scoring, Applicability, Ampel | Muss deterministisch und versioniert bleiben |
| Compliance-Engine | Mapping Befund → KBV/BSI/ISO-Control | Eigener Änderungsrhythmus (Normen ändern sich) |
| Knowledge-Service | CVE, Firmware-Stände, OUI-DB, Default-Credential-Heuristik | Muss täglich aktualisierbar sein, ohne App-Release |
| Report-Service | KI-Generierung, PDF, Versionierung | Eigenes Kostenprofil, eigene Rate-Limits |
| Agent-Gateway | Desktop-Agent-Registrierung, Telemetrie-Ingest | Andere Sicherheitszone als die Mobile-API |

**Worker-Zerlegung (sofort, ohne Verhaltensänderung):**

```
workers/hono/src/
  routes/{check,report,monitoring,privacy,legal,backoffice}.ts
  providers/{shodan,hibp,virustotal,securitytrails,ssllabs,cloudflare-dns}.ts
  providers/registry.ts          # einheitliches Provider-Interface + Status
  middleware/{auth,rate-limit,audit}.ts
  index.ts                       # nur noch Komposition
```

**Weitere Architekturpunkte:**

- **Offline-First-Scanqueue**: Scans lokal ausführen und persistieren, Sync bei Konnektivität mit Idempotenz-Key (Muster existiert bereits über `security_checks_reports_idempotency`).
- **Rollenmodell erweitern**: aktuell Owner + Partner + Consultant. Es fehlen: `praxis_mitarbeiter` (nur Lesen + Schulungsnachweis), `datenschutzbeauftragter` (Compliance-Sicht ohne technische Rohdaten), `auditor` (read-only, zeitbeschränkt, mit Zugriffsprotokoll). Letzteres ist ein Verkaufsargument.
- **Wissensbasis vom App-Release entkoppeln**: Port-Katalog, CVE-Daten, OUI-Tabelle, Anleitungstexte müssen serverseitig aktualisierbar sein. Aktuell ist `SERVICE_PORT_CATALOG` einkompiliert — jede neue Portprüfung braucht einen App-Store-Release. Das ist der strukturelle Grund für langsame Prüftiefen-Entwicklung.
- **Signierte Berichte**: Prüfberichte sollten kryptografisch signiert und mit Hash versehen sein, damit sie gegenüber Auditoren und Versicherern belastbar sind.

---

## 5. Cybersecurity — vollständige Prüfungs-Ideensammlung

Legende: **📱** Smartphone allein · **📱+** Smartphone im LAN · **💻** Desktop-Agent · **🔧** Router-Integration · **☁️** Cloud-Dienst

### 5.1 Netzwerk — WLAN

| # | Prüfung | Weg | Bemerkung |
|---|---|---|---|
| W-01 | Verschlüsselung je SSID (WPA2/WPA3/WEP/offen) | 📱 | Vorhanden |
| W-02 | WPA3-Transition-Mode-Downgrade-Anfälligkeit | 📱 | Aus `capabilities`-String ableitbar (Android) |
| W-03 | PMF/802.11w-Status | 📱 | Android `capabilities`; iOS nicht |
| W-04 | WPS aktiv | 🔧 📱(Android teilw.) | Über TR-064 zuverlässig |
| W-05 | Gastnetz vorhanden und wirklich isoliert | 📱+ 🔧 | Aktiv testbar: aus Gastnetz gegen Praxis-IPs proben |
| W-06 | Client-Isolation im Gastnetz | 📱+ | Zwei-Geräte-Test oder Gateway-Reachability |
| W-07 | Rogue AP / Evil Twin (gleiche SSID, fremde BSSID) | 📱 | Modul existiert, Datenquelle Android-only |
| W-08 | Signalstärke-Abdeckung außerhalb der Praxis | 📱 | „Ihr WLAN ist auf der Straße empfangbar" — sehr anschaulich |
| W-09 | Versteckte SSID (falsches Sicherheitsgefühl) | 📱 | Aufklärungswert |
| W-10 | Kanalbelegung / Nachbarnetze / Störungen | 📱 | Betriebsqualität, kein Sicherheitsthema |
| W-11 | Anzahl SSIDs am selben Gerät (Segmentierungsindiz) | 📱 🔧 | BSSID-Nachbarschaft |
| W-12 | Enterprise-WLAN (802.1X) vs. PSK | 📱 | Reifegradindikator |
| W-13 | PSK-Rotationsnachweis (Personalwechsel) | Fragebogen 💻 | Klassische Praxislücke |
| W-14 | Roaming/Mesh-Repeater mit abweichender Verschlüsselung | 📱 🔧 | Häufiger Fehler: Repeater fällt auf WPA2 zurück |

### 5.2 Netzwerk — LAN, Segmentierung, Protokolle

| # | Prüfung | Weg | Bemerkung |
|---|---|---|---|
| L-01 | Subnetz-Discovery (vollständig) | 📱+ | Vorhanden, aber nur im Audit-Modus |
| L-02 | ARP-Tabelle | 💻 | Auf Android tot (B-2), Agent liefert es zuverlässig |
| L-03 | VLAN-Erkennung (mehrere Subnetze erreichbar) | 📱+ 💻 | Segmentierungsnachweis statt Selbstauskunft |
| L-04 | Segment-Reachability-Matrix (wer erreicht wen) | 📱+ 💻 | **Kernprüfung** — belegt Segmentierung `measured` |
| L-05 | Broadcast-/Multicast-Rauschen | 💻 | Passive Analyse, zeigt Legacy-Protokolle |
| L-06 | mDNS-Discovery | 📱+ | **Fehlt nativ (B-1)** |
| L-07 | SSDP/UPnP-Discovery | 📱+ | Vorhanden |
| L-08 | UPnP-Portfreigaben (IGD) auslesen | 📱+ 🔧 | Zeigt, was sich selbst nach außen geöffnet hat |
| L-09 | LLMNR/NBT-NS aktiv (Responder-Angriffsfläche) | 💻 | Klassischer AD-Angriffsvektor |
| L-10 | DHCP-Server-Konsistenz / Rogue DHCP | 📱+ | Modul vorhanden |
| L-11 | Zweiter DHCP-Server im Netz | 📱+ 💻 | Häufig durch mitgebrachte Router |
| L-12 | Gateway-Konsistenz / ARP-Spoofing-Indikator | 📱+ | MAC-Wechsel des Gateways über Zeit |
| L-13 | IPv4-Adressplan-Plausibilität | 📱+ | Vorhanden (`ipv4Subnet.ts`) |
| L-14 | IPv6 aktiv, SLAAC/DHCPv6, Präfix | 📱+ | Android vorhanden, **iOS fehlt** |
| L-15 | IPv6 ohne Firewall-Abdeckung | 📱+ 🔧 | Sehr häufige reale Lücke: v4 gefiltert, v6 offen |
| L-16 | IPv6-Erreichbarkeit von außen | ☁️ | Gegenprobe vom Cloud-Dienst |
| L-17 | DNS-Resolver-Klassifikation | 📱+ | Vorhanden |
| L-18 | DNS-Filter-Wirksamkeitstest | 📱+ | **Fehlt nativ (B-1)** |
| L-19 | DNSSEC-Validierung durch den Resolver | 📱+ ☁️ | Testdomain mit gebrochener Signatur |
| L-20 | DoT/DoH-Nutzung / Umgehung | 📱+ 🔧 | Datenschutz- und Filterrelevanz |
| L-21 | DNS-Rebinding-Schutz am Router | 📱+ 🔧 | Schützt interne Dienste |
| L-22 | NTP-Quelle und Zeitabweichung | 📱+ 💻 | Zeitversatz bricht Kerberos und Protokollbeweiskraft |
| L-23 | Netzwerkdrucker mit offener Verwaltung | 📱+ | Sehr häufiger Praxisfund |
| L-24 | Traceroute/Hop-Analyse zum Provider | 📱+ | Erkennt vorgeschaltete Sicherheitsgeräte |
| L-25 | Captive-Portal / Provider-Zwangsproxy | 📱 | |
| L-26 | MTU/Fragmentierung (VPN-Störungsdiagnose) | 📱+ | Betriebsqualität |

### 5.3 Port-Prüfungen — vollständiger Zielkatalog

Der bestehende Katalog ist um folgende Einträge zu erweitern. Risikobewertung im Praxiskontext:

**Medizinisch / Telematikinfrastruktur (höchste Priorität, Alleinstellung):**

| Port | Dienst | Risiko in der Praxis |
|---|---|---|
| 104, 11112 | DICOM | Bildarchive oft ohne Auth; Patientendaten direkt abrufbar |
| 2575 | HL7 MLLP | Klartext-Patientendaten im Netz |
| 4742 | SICCT | eHealth-Kartenterminal |
| 443 (Konnektor) | gematik-Konnektor Mgmt | TI-Zugang, Konfigurationszugriff |
| 8080/8443 (PVS) | Praxisverwaltungssystem-Web | Oft veraltete Web-Stacks |

**Fernzugriff:** 22 SSH · 23 Telnet ✅ · 3389 RDP ✅ · 5900–5906 VNC · 5938 TeamViewer · 6568/7070 AnyDesk · 1194 OpenVPN · 500/4500 IPsec · 51820 WireGuard

**Datei & Verzeichnis:** 21 FTP · 139/445 SMB ✅ · 548 AFP ✅ · 2049 NFS ✅ · 389/636 LDAP · 88 Kerberos · 3268/3269 Global Catalog

**Datenbanken:** 1433 MSSQL · 1521 Oracle · 3306 MySQL ✅ · 5432 PostgreSQL ✅ · 6379 Redis · 9200/9300 Elasticsearch · 27017 MongoDB · 5984 CouchDB

**Virtualisierung & Container:** 902/903 ESXi · 8006 Proxmox · 2375/2376 Docker · 6443 Kubernetes API · 10250 Kubelet · 2379 etcd

**NAS & Infrastruktur:** 5000/5001 Synology ✅(HTTP) · 8080/8081 QNAP · 111 rpcbind · 161/162 SNMP · 623 IPMI/BMC · 3283 Apple Remote Desktop

**Druck & Scan:** 515 LPD · 631 IPP ✅ · 9100 JetDirect ✅ · 5357 WSD

**IoT, Kamera, VoIP:** 554 RTSP · 8554 RTSP-alt · 1883/8883 MQTT · 5060/5061 SIP · 5353 mDNS · 1900 SSDP · 37777 Dahua · 34567 Xiongmai

**Router-spezifisch:** 49000 TR-064 · 7547 TR-069 CWMP · 8291 MikroTik Winbox · 4443 UniFi

**Bewertungslogik je Fund** — drei Dimensionen statt einer:

1. *Ist der Dienst überhaupt zulässig in einem Praxisnetz?* (Telnet: nie · DICOM: ja, aber segmentiert)
2. *Ist er im richtigen Segment?* (Datenbank im Client-WLAN = kritisch, im Servernetz = normal)
3. *Ist er authentifiziert/verschlüsselt?* (HTTP-Admin vs. HTTPS)

Diese Dreiteilung fehlt aktuell — `scoreImpact` ist ein fester Wert pro Port, unabhängig vom Kontext. Ein Drucker auf 9100 im Druckernetz ist etwas völlig anderes als derselbe Port im Gäste-WLAN.

### 5.4 Router-Analyse

**Ohne Zugangsdaten, rein passiv (📱+):**

- HTTP-Header, Server-Banner, TLS-Zertifikat des Admin-Interfaces
- HTML-Titel und Login-Seiten-Fingerprint → Hersteller/Modell/grobe Firmware-Generation
- Offene Ports am Gateway, HTTP vs. HTTPS-Admin
- UPnP-Device-Description via SSDP (`friendlyName`, `modelName`, `modelNumber`, `serialNumber`)
- TR-064 Description-Endpunkt `/tr64desc.xml` — bei AVM ohne Auth abrufbar, liefert Modell und Firmware
- DNS-Rebinding-Schutz, Reaktion auf ungültige Hostnamen
- IPv6-Präfix-Delegation-Verhalten

**Mit Nutzer-Zugangsdaten via TR-064 (🔧 — der große Hebel, B-9):**

- Modell, exakte Firmware-Version, Update-Verfügbarkeit
- **Alle Portfreigaben** (die wichtigste Einzelinformation überhaupt)
- UPnP-Status und dynamisch angelegte Freigaben
- Gastnetz: aktiv, isoliert, eigenes Passwort
- WLAN-Verschlüsselung je SSID, WPS-Status
- Geräteliste mit Namen, MAC, IP, Verbindungstyp, aktiv/inaktiv
- Kindersicherungs-/Filterprofile (als Segmentierungsindiz)
- VPN-Konfiguration (WireGuard/IPsec vorhanden?)
- WAN-Status, Anschlussart, öffentliche IP
- Telefonie-Konfiguration (Abrechnungsbetrug-Risiko bei offenem SIP)
- Ereignisprotokolle, soweit exponiert (Anmeldeversuche, Neustarts)

**Strikte Grenzen:** Credentials nur lokal im Secure Store, niemals an die Cloud. Keine Konfigurationsänderungen — nur Lesen. Kein Login-Bruteforce, keine Default-Credential-Tests durch Anmeldeversuche. Standardpasswort-Erkennung ausschließlich heuristisch (z. B. Router zeigt Ersteinrichtungs-Assistent, Werksseriennummer im WLAN-Namen, unveränderte Standard-SSID).

**Herstellerspezifisch nach AVM:** Speedport (Telekom), UniFi/UDM, MikroTik, Lancom (bei IT-Dienstleister-Praxen häufig), Zyxel, Draytek, OPNsense/pfSense.

### 5.5 Geräteerkennung

**Signalquellen, nach Aussagekraft geordnet:**

1. **mDNS/Bonjour TXT-Records** — der stärkste passive Fingerabdruck. `_ipp._tcp` liefert Druckermodell, Seitenzahl, Firmware. `_device-info._tcp` liefert macOS-Modell. *Fehlt aktuell nativ.*
2. **SSDP/UPnP Device Description** — `manufacturer`, `modelName`, `modelDescription`, Seriennummer. *Teilweise vorhanden.*
3. **MAC-OUI** — Hersteller. Aktuell **6 hartcodierte Einträge** (`deviceClassification.ts:121`). Die offizielle IEEE-Datenbank hat über 30.000. Muss als serverseitig aktualisierbarer Datensatz kommen. Achtung: MAC-Randomisierung bei modernen Clients macht OUI für Smartphones wertlos, für stationäre Geräte (Drucker, NAS, Medizingeräte) aber weiterhin sehr zuverlässig.
4. **DHCP-Fingerprint** (Option 55 Parameter Request List, Vendor Class) — sehr präzise OS-Erkennung, aber nur mit Agent/Router lesbar.
5. **HTTP-Server-Header und Favicon-Hash** — Favicon-Hashing (Shodan-Technik) identifiziert Geräteklassen sehr zuverlässig ohne Login.
6. **TLS-Zertifikat-CN/SAN** — enthält oft Gerätenamen, Seriennummer, Hersteller.
7. **SNMP `sysDescr`/`sysObjectID`** mit `public` — exakte Modell- und Firmware-Angabe. *Fehlt nativ.*
8. **TCP/IP-Stack-Fingerprint** (TTL, Window Size, TCP-Options-Reihenfolge) — OS-Erkennung passiv. Über RN-Sockets nicht möglich; braucht Agent oder Native-Erweiterung.
9. **NetBIOS-Name** — Windows-Rechnername, Domänenzugehörigkeit.
10. **Reaktionszeitmuster** — schwaches, aber additives Signal.

**Zu erkennende Geräteklassen (Zielkatalog):** PC · Server · Domain Controller · NAS (Synology/QNAP/TrueNAS) · Drucker · Scanner · Multifunktionsgerät · IP-Kamera · NVR · Smart TV · VoIP-Telefon · VoIP-Anlage · Managed Switch · Firewall/UTM · USV · Access Point · Repeater · **Medizingerät (Modalität, Analysegerät, Monitor)** · **PACS-Server** · **Kartenterminal** · **gematik-Konnektor** · Raspberry Pi · Docker-Host · Hypervisor · Smartphone/Tablet · Smart-Home-Geräte · unbekannt

**Zusätzlich sinnvoll pro Gerät:** Erstmals gesehen · zuletzt gesehen · zugeordnete Person/Raum · als „erwartet" markiert · Kritikalität · Verantwortlicher · Firmware-Stand · Support-Ende (EOL) · Netzsegment.

### 5.6 Betriebssystem-Erkennung

Ohne Agent bleibt OS-Erkennung eine **Heuristik mit expliziter Confidence** — das muss im Evidenzmodell als `inferred`, nie als `measured` geführt werden.

| OS | Passive Indikatoren ohne Agent |
|---|---|
| Windows | 445/139 offen, NetBIOS-Name, `_smb._tcp`, RDP 3389, LLMNR-Verkehr, WSD 5357 |
| macOS | `_device-info._tcp`, AFP 548, ARD 3283, `_companion-link._tcp` |
| Linux/Unix | SSH 22 mit OpenSSH-Banner, Avahi-mDNS, NFS 2049 |
| Android | `_androidtvremote._tcp`, DHCP-Vendor-Class, Hostname-Muster `android-*` |
| iOS/iPadOS | `_apple-mobdev2._tcp`, MAC-Randomisierung, kaum offene Ports |
| Embedded/IoT | Sehr wenige Ports, HTTP-Server mit Kleinst-Stack-Banner (lighttpd/boa/GoAhead) |

**Was gesammelt werden darf:** technische Metadaten des Geräts. **Was nicht:** Inhalte von Freigaben, Dateilisten, Druckaufträge, Datenbankinhalte, Bildschirminhalte, Zugangsdaten. Diese Grenze ist im Code bereits als `privacyBoundary` verankert — sie muss beim Ausbau der Prüftiefe explizit gehalten werden.

### 5.7 Active Directory

Diese Prüfungen sind für größere Praxen und MVZ relevant. Ohne Agent nur oberflächlich, mit Agent sehr aussagekräftig.

| Prüfung | Weg |
|---|---|
| Domäne vorhanden (SRV-Records `_ldap._tcp.dc._msdcs`) | 📱+ |
| Domain Controller identifizieren | 📱+ 💻 |
| LDAP anonym bindbar (Null-Session) | 📱+ ⚠️ nur lesend |
| LDAPS verfügbar / LDAP-Signing erzwungen | 📱+ 💻 |
| SMB-Signing erzwungen (Relay-Schutz) | 📱+ 💻 |
| SMBv1 aktiv | 📱+ 💻 |
| Kerberos erreichbar, Zeitversatz | 📱+ |
| Passwortrichtlinie (Länge, Komplexität, Alter) | 💻 |
| Anzahl Domänen-Administratoren | 💻 |
| Konten mit „Passwort läuft nie ab" | 💻 |
| Inaktive Konten (Ex-Mitarbeitende) | 💻 |
| Kerberoastable Service-Konten | 💻 |
| LAPS im Einsatz | 💻 |
| GPO-Grundhärtung (LLMNR aus, SMBv1 aus, PowerShell-Logging) | 💻 |
| Entra ID / Hybrid-Identity, Conditional Access, MFA-Abdeckung | ☁️ Graph-API |

Die Entra-ID-Anbindung über Microsoft Graph ist besonders wertvoll: Sie macht `MFA_ENABLED` von `self_reported` zu `measured` — und MFA ist eine der vier Green-Hard-Requirements.

### 5.8 Sicherheitsprüfungen (Konfiguration & Härtung)

| Prüfung | Weg | Status |
|---|---|---|
| Offene SMB-Freigaben ohne Auth (nur Existenz, kein Inhalt) | 📱+ 💻 | Fehlt |
| SMBv1 aktiv / SMB-Signing | 📱+ 💻 | **Deklariert, nicht implementiert** |
| TLS-Versionen intern (Router, NAS, PVS) | 📱+ | Fehlt intern; extern via SSL Labs vorhanden |
| Schwache Cipher-Suites | 📱+ ☁️ | Teilweise |
| Selbstsignierte / abgelaufene Zertifikate intern | 📱+ | Fehlt |
| HSTS, Security-Header extern | ☁️ | Teilweise |
| DNSSEC für die Praxisdomain | ☁️ | Prüfen |
| SPF/DKIM/DMARC | ☁️ | Vorhanden ✅ |
| MTA-STS / TLS-RPT / DANE | ☁️ | Fehlt |
| Offene Mail-Relays | ☁️ | Fehlt |
| Standardpasswörter (**nur Heuristik**) | 📱+ 🔧 | Fehlt |
| Offene Verwaltungsports im Client-Netz | 📱+ | Vorhanden ✅ |
| Firmware-EOL-Status je Gerät | ☁️ | Fehlt |
| CVE-Abgleich Firmware/Dienstversion | ☁️ | Fehlt (B-8) |
| Shadow-IT (unbekannte Cloud-Dienste im DNS) | 💻 🔧 | Fehlt |
| Leak-Prüfung Praxis-E-Mails | ☁️ | Vorhanden ✅ (mit Consent) |
| Exponierte Dienste aus dem Internet | ☁️ Shodan | Vorhanden ✅ |
| Subdomain-Übernahme-Risiko | ☁️ | Teilweise |
| Zertifikatstransparenz-Monitoring | ☁️ | Fehlt |
| Typosquatting-Domains (Phishing-Vorbereitung) | ☁️ | Fehlt — hoher Praxiswert |

---

## 6. Mobile Möglichkeiten und harte Grenzen

### 6.1 Was auf dem Smartphone geht

**Beide Plattformen:** aktive TCP-Connect-Probes · HTTP(S)-Anfragen inkl. Header/Zertifikat · UDP (SSDP, mDNS, SNMP, DNS) über native Sockets · aktuelles WLAN (SSID, BSSID, Frequenz) · Netzwerkinfos über NetInfo · Kamera für QR/Geräte-Etiketten · Standort (nur mit Zweckbindung, nicht speichern) · Push-Benachrichtigungen · lokale Verschlüsselung im Secure Enclave / Keystore.

**Nur Android:** Umgebungs-WLAN-Scan (`loadWifiList` → Rogue-AP-Erkennung, Kanalanalyse) · `capabilities`-String mit PMF/WPA3-Details · theoretisch ARP (praktisch tot, B-2).

**Nur iOS:** `NEHotspotNetwork` mit Entitlement · Network Framework mit besserer Verbindungssteuerung.

### 6.2 Was auf dem Smartphone prinzipiell nicht geht

Das gehört ehrlich ins Produkt kommuniziert, statt es zu umschreiben:

- **Keine Raw Sockets** → kein echtes ARP-Scanning, kein Nmap-artiges OS-Fingerprinting, kein SYN-Scan, kein Passiv-Sniffing.
- **Kein Promiscuous Mode** → keine Verkehrsanalyse, keine LLMNR/NBT-NS-Beobachtung.
- **iOS liefert keine Umgebungs-WLAN-Liste** → Rogue-AP-Erkennung ist auf iOS strukturell unmöglich. Das ist kein Bug, das ist Plattformpolitik.
- **Kein Zugriff auf fremde Geräte-Interna** ohne deren Zugangsdaten.
- **Hintergrundausführung stark limitiert** → lange Scans brauchen Vordergrund oder einen Agent.
- **App-Store-Richtlinien:** Netzwerk-Scanner sind zulässig (Fing existiert), aber der Zweck muss klar sein, Berechtigungen müssen begründet und die Datenverarbeitung transparent sein. Aggressive Scan-Techniken oder Credential-Tests führen zur Ablehnung.

**Konsequenz für das Produkt:** iOS und Android werden nie dieselbe Prüftiefe haben. Das muss die UI transparent machen („3 Prüfungen auf diesem Gerät nicht verfügbar — mit dem Praxis-Agent messbar"), statt Ergebnisse zu erzeugen, die auf iOS still schlechter sind.

### 6.3 Offline vs. Cloud

**Vollständig offline möglich:** Fragebogen · lokale Netzwerk- und Portprüfungen · WLAN-Analyse · Geräteinventar · Scoring-Engine (rein rechnerisch) · Score-Historie · Berichtsanzeige.

**Cloud erforderlich:** externe Domain-Checks (SSL, DNS, DMARC, Shodan, HIBP) · KI-Berichtsgenerierung · CVE-/Firmware-Wissensbasis · Monitoring · Multi-Geräte-Sync · Backoffice.

Ein echter Offline-Modus ist realistisch und in Praxen mit Netztrennung relevant. Die Scoring-Engine ist bereits pur und deterministisch — die Voraussetzung ist erfüllt.

---

## 7. Desktop-Agent

**Strategische Einordnung:** Der Agent ist der einzige Weg, die Evidenz-Decke zu durchbrechen. Vier von sechs Scoring-Kategorien (`access_control`, `backup`, `updates`, `dsgvo`) haben heute keine technische Datenquelle und sind damit dauerhaft auf 50 % der Punkte gekappt. **Ohne Agent kann eine Praxis den Bestwert strukturell nicht erreichen** — egal wie sicher sie tatsächlich ist. Das ist ein Produktdefekt, kein Feature-Wunsch.

### 7.1 Windows-Agent (Priorität 1 — deckt >90 % der Praxis-Arbeitsplätze)

| Bereich | Datenpunkte |
|---|---|
| Patchstatus | Installierte Updates, ausstehende, letzter Patchlauf, WSUS/Intune-Anbindung |
| OS-Support | Build, EOL-Datum (Windows 10 EOL ist in Praxen ein Massenproblem) |
| Antivirus | Defender-Status, Signaturalter, Echtzeitschutz, Ausnahmen, Drittanbieter-AV |
| Verschlüsselung | BitLocker je Volume, Schutzmethode, Recovery-Key-Hinterlegung |
| Firewall | Profile aktiv, eingehende Ausnahmeregeln |
| Konten | Lokale Admins, inaktive Konten, Passwortrichtlinie, Gastkonto |
| Dienste | Laufende Dienste, unsignierte Binaries, Autostart |
| Freigaben | Freigegebene Ordner, Berechtigungen (**nur Metadaten, keine Inhalte**) |
| Software | Installierte Programme mit Version → CVE-Abgleich, EOL-Software |
| Browser | Version, veraltete Erweiterungen |
| Zertifikate | Ablaufende, nicht vertrauenswürdige Root-CAs |
| USB | Speichergeräte-Richtlinie, historische Verbindungen |
| Backup | Windows-Backup, VSS, erkannte Backup-Agents (Veeam, Acronis) und deren letzter Erfolg |
| AD/GPO | Domänenmitgliedschaft, angewandte GPOs, Härtungsstatus |
| Ereignisse | Fehlgeschlagene Anmeldungen, Kontosperrungen, Dienstabstürze (nur Aggregate) |
| Virtualisierung | Hyper-V, VMware, Docker Desktop, WSL |
| Netzwerk | Adapter, Routen, DNS-Konfiguration, offene lokale Ports |
| RDP | Aktiviert, NLA erzwungen, exponiert |
| Praxissoftware | Erkennung gängiger PVS und deren Versionsstand |

### 7.2 Linux-Agent (Server, NAS, Docker-Hosts)

Paketstand und verfügbare Sicherheitsupdates · Kernel-Version und EOL · systemd-Dienste · SSH-Konfiguration (Root-Login, Passwort-Auth, Key-Only) · Firewall (ufw/nftables) · Dateiberechtigungen kritischer Pfade · Cron-Jobs · Docker-Container mit Versionen und Exposition · fail2ban · Benutzer mit sudo · unattended-upgrades.

### 7.3 macOS-Agent

Softwareupdate-Status · FileVault · Gatekeeper/XProtect/SIP · Firewall · lokale Admins · Kernel-Extensions · Time-Machine-Backup-Status · MDM-Enrollment.

### 7.4 Agent-Designprinzipien (nicht verhandelbar)

1. **Read-only.** Der Agent verändert nie eine Konfiguration. Das ist die Grundlage der Akzeptanz bei IT-Dienstleistern und die Voraussetzung dafür, dass er in eine Praxis darf.
2. **Keine Inhalte.** Nur Metadaten und Konfigurationszustand — nie Dateiinhalte, nie Patientendaten, nie Bildschirminhalte.
3. **Transparente Datenschau.** Der Agent zeigt lokal genau an, was gesendet wird, und erlaubt Feldauswahl vor Übertragung.
4. **Signiert und verifizierbar.** Code-Signing, reproduzierbarer Build, veröffentlichte Hashes. Ein Agent in einer Arztpraxis ohne das ist nicht vermittelbar.
5. **Offline-fähig.** Lokaler Report ohne Cloud, Übertragung erst nach Freigabe.
6. **Deinstallierbar in einem Schritt**, ohne Rückstände.
7. **Auch als portable Einmal-Ausführung** — viele Praxen erlauben keine dauerhafte Installation. Ein signiertes Einmal-Tool, das einen Bericht erzeugt und sich nicht installiert, senkt die Einstiegshürde erheblich.

---

## 8. KI-Funktionen

### 8.1 Wo KI echten Mehrwert schafft

**1. Übersetzung Technik → Praxissprache (höchster Wert, geringstes Risiko).**
Aus „SMB signing not required auf 192.168.1.40" wird: „Ihr Server erlaubt eine Angriffstechnik, mit der jemand im Praxisnetz Anmeldedaten abfangen kann. Ihr IT-Dienstleister braucht dafür etwa 15 Minuten." Das ist der Kernnutzen — und er ist heute nur ansatzweise umgesetzt.

**2. Gerätespezifische Schritt-für-Schritt-Anleitung.**
Nicht „Deaktivieren Sie UPnP", sondern die konkrete Klickfolge für das erkannte Modell und die erkannte Firmware-Version, mit Beschreibung des Bildschirms und Prüfschritt danach.

**3. Angriffspfad-Erzählung statt Einzelbefunde.**
Der größte Wertsprung. Statt „drei Findings" → „Ihr Gäste-WLAN erreicht den Server (Befund 1). Der Server erlaubt SMBv1 (Befund 2). Ein Patient im Wartezimmer könnte damit in etwa 20 Minuten auf die Patientendatenbank zugreifen." Kette statt Liste. Das rechtfertigt den Preis und motiviert zum Handeln.

**4. Priorisierung nach Praxisrealität.**
Nicht nach CVSS, sondern nach: Ist es sofort ausnutzbar? · Wie viel kostet die Behebung? · Kann die Praxis es selbst? · Wie viele Patientendaten hängen daran? · Ist es prüfungsrelevant nach § 75b?

**5. Compliance-Erklärung und Nachweistexte.**
Aus Befunden die TOM-Dokumentation nach Art. 32 DSGVO vorbefüllen. Das spart einer Praxis mehrere Stunden Arbeit und ist ein sehr konkreter, verkaufbarer Nutzen.

**6. Sicherheits-Chatbot mit Kontext des eigenen Netzes.**
„Darf ich meinen Praxisrechner privat nutzen?" — beantwortet auf Basis des tatsächlichen Netzes und der tatsächlichen Befunde, nicht generisch.

**7. Kosten- und Zeitschätzung je Maßnahme.**
Aufwand in Stunden, geschätzte Dienstleisterkosten in Euro, Selbstumsetzbarkeit. Ermöglicht dem Praxisinhaber ein Budget.

**8. Vorher/Nachher-Vergleich mit Begründung.**
Nach der Nachprüfung: was sich verbessert hat, was noch offen ist, wie sich das Risiko verändert hat.

**9. Berichtsvarianten aus einem Datenstand.**
Praxisinhaber (2 Seiten, Klartext) · IT-Dienstleister (technische Befundliste) · Datenschutzbeauftragter (Art.-32-Bezug) · Auditor (Evidenzkette). Aus denselben strukturierten Daten, unterschiedlich serialisiert.

### 8.2 Wo KI ausdrücklich nicht hingehört

- **Nicht ins Scoring.** Der Score muss deterministisch, versioniert und reproduzierbar bleiben. Das ist heute korrekt gelöst und darf nicht aufgeweicht werden.
- **Nicht in die Befundgenerierung.** Ein KI-erfundener Befund in einem Auditbericht ist ein Haftungsfall. KI formuliert Befunde, sie erzeugt sie nicht.
- **Nicht in Compliance-Aussagen ohne Regelbasis.** „Ihre Praxis ist DSGVO-konform" darf nie aus einem Sprachmodell kommen.
- **Nicht in Angriffssimulation mit aktiver Ausführung.** Angriffspfade beschreiben: ja. Ausführen: nein.

### 8.3 Technische Anforderungen

Strikte Trennung: **Regel-Engine erzeugt Fakten → KI formuliert.** Jede KI-Aussage muss auf eine `rule_id` oder ein `finding` zurückführbar sein. Prompt- und Modellversion gehören in den Berichtsdatensatz (Auditierbarkeit). Alle KI-Ausgaben müssen gegen ein Schema validiert werden — `validateReport` (`lib/ai/report.ts:119`) ist der richtige Ansatz und sollte auf jede neue KI-Funktion ausgeweitet werden.

---

## 9. Konkurrenzanalyse

| Produkt | Stärke | Was PraxisShield übernehmen sollte | Was bewusst anders bleibt |
|---|---|---|---|
| **Nessus / Tenable** | CVE-Tiefe, Plugin-Architektur, Scan-Policies | **Plugin-Architektur** für Prüfungen; Scan-Profile (schonend/vollständig) | Keine Tiefe-Konkurrenz. Nessus liefert 500 Findings ohne Priorisierung — für eine Praxis wertlos |
| **OpenVAS / Greenbone** | Offene Feed-Struktur, Community-Regeln | **Feed-Konzept:** Prüflogik serverseitig aktualisierbar ohne App-Release | Keine Selbst-Hosting-Komplexität |
| **Qualys** | Asset-Inventar + Compliance-Mapping in einem | **Control-Mapping-Modell** (Befund → Norm-Anforderung) | Kein Enterprise-Preismodell, keine Enterprise-Komplexität |
| **Rapid7 InsightVM** | Risiko-Priorisierung mit Kontext, Remediation-Projekte | **Remediation-Workflow mit Verifikation** (B-11) | Keine Analystenrolle als Voraussetzung |
| **Microsoft Secure Score** | Konkrete Maßnahmen mit Punktegewinn, Vorher/Nachher | **„+8 Punkte, 15 Minuten"-Darstellung je Maßnahme** — das beste UX-Muster im Markt | Nicht auf M365 beschränkt |
| **Microsoft Defender** | Agent-Telemetrie, EDR | **Agent-Datenmodell** als Vorbild | Kein EDR — das ist eine andere Produktkategorie |
| **Lansweeper** | Bestes Netzwerk-Inventar, sehr breite Geräteerkennung | **Erkennungssignale und Geräteklassen-Taxonomie** | Kein reines Inventar ohne Bewertung |
| **Fing** | Beste mobile Discovery-UX, sehr schnell, riesige Gerätedatenbank | **Discovery-UX und Geschwindigkeit** — der direkteste mobile Vergleich | Fing bewertet nicht, dokumentiert nicht, hat kein Compliance-Modell |
| **Nmap** | Fingerprinting-Referenz | **Service-/Version-Erkennungslogik** (nachbauen, wo mobil möglich) | Keine aggressiven Scan-Techniken |
| **Angry IP / Advanced IP Scanner** | Einfachheit | Nichts | Zu flach |
| **PRTG / Checkmk** | Zeitreihen, Schwellwert-Alarme, Verfügbarkeit | **Monitoring-Historie und Alarmlogik** | Kein Verfügbarkeitsmonitoring — das ist Dienstleistergeschäft |
| **GLPI** | Asset-Management, Ticketing | **Verantwortlichkeiten und Lebenszyklus je Gerät** | Kein ITSM |
| **Wazuh** | Agent-basierte Compliance (PCI, HIPAA), Log-Analyse | **Agent-Architektur und Compliance-Mapping** | Keine SIEM-Komplexität für 5-Personen-Praxen |

### 9.1 Die verteidigbare Nische

Kein einziges dieser Produkte beantwortet die Frage, die eine deutsche Arztpraxis tatsächlich hat:

> **„Erfülle ich die IT-Sicherheitsrichtlinie nach § 75b SGB V, und was kostet mich das, was noch fehlt?"**

Daraus ergeben sich vier Alleinstellungsmerkmale, die zusammen schwer kopierbar sind:

1. **Evidenzmodell** — bereits gebaut, einzigartig, auditorentauglich.
2. **KBV-/§75b-Compliance-Mapping** — der eigentliche Kaufgrund, noch nicht gebaut.
3. **Medizinische Domäne** — DICOM, HL7, TI-Komponenten, Kartenterminals, Konnektor, PVS-Erkennung. Niemand sonst prüft das im KMU-Segment.
4. **Praxissprache statt Fachsprache** — die Übersetzungsleistung, für die KI hier wirklich gebraucht wird.

Punkt 2 und 3 sind die Prioritäten. Punkt 1 ist der Schutzwall. Ohne 2 und 3 ist das Produkt ein besserer Fing mit Bericht.

---

## 10. Produkt-Backlog

**Bewertungsskalen:** Aufwand 1 (Tage) – 5 (mehrere Quartale) · Nutzen 1–5 · Sicherheitsgewinn 1–5 · UX-Mehrwert 1–5 · Risiko 1 (harmlos) – 5 (gefährdet Produkt/Recht)
**Weg:** 📱 Smartphone · 📱+ Smartphone im LAN · 💻 Desktop-Agent · 🔧 Router · ☁️ Cloud

### 10.1 MUST HAVE — Glaubwürdigkeit und Haftung

| ID | Maßnahme | Weg | Auf | Nut | Sich | UX | Ris | Begründung |
|---|---|---|---|---|---|---|---|---|
| M-01 | **Medizingeräte-Schutzmodus**: keine aktiven Probes gegen als Medizingerät klassifizierte/inventarisierte Hosts, Default an | 📱+ | 2 | 4 | 3 | 2 | **5** | Ein durch den Scan gestörtes Medizingerät beendet das Produkt. Vor jedem Prüftiefen-Ausbau. |
| M-02 | **Dokumentierte Scan-Autorisierung** vor jedem aktiven Scan (wer, wann, welches Netz, Bestätigung) | 📱 | 2 | 4 | 2 | 2 | **5** | §§ 202a/303b StGB. Ohne das ist der Dienstleister-Anwendungsfall rechtlich ungedeckt. |
| M-03 | **Phantom-Probes auflösen** (B-1): mDNS, SNMP, SMB, DNS-Test, IPv6-TCP nativ bauen — oder Module aus der UI entfernen | 📱+ | 4 | 5 | 5 | 3 | 3 | Halbfertige Prüfmodule in einem Auditprodukt sind ein Haftungsrisiko. |
| M-04 | **iOS-Probe-Parität** (`scanDevices`, `getIpv6NetworkInfo` fehlen ganz) | 📱+ | 3 | 4 | 4 | 3 | 2 | iOS-Ergebnisse sind aktuell still schlechter, ohne dass der Nutzer es erfährt. |
| M-05 | **Vollständiger Subnetz-Sweep als Standard** (B-3), adaptiv und parallelisiert | 📱+ | 3 | 5 | 5 | 3 | 2 | 11 feste IPs übersehen die Mehrzahl realer Praxisnetze. Falsche Entwarnung ist schlimmer als kein Scan. |
| M-06 | **Port-Katalog auf medizinische Domäne erweitern**: DICOM 104/11112, HL7 2575, SICCT 4742, Konnektor | 📱+ | 2 | 5 | 5 | 3 | 2 | Die zentrale Alleinstellung. Aktuell wird kein einziger medizinspezifischer Port geprüft. |
| M-07 | **Port-Katalog auf Standarddienste erweitern** (SSH, VNC, LDAP, MSSQL, Redis, Docker, K8s, ESXi, Proxmox, SIP, RTSP, MQTT) | 📱+ | 2 | 4 | 4 | 2 | 1 | 11 Ports sind für „umfassendster Check" nicht haltbar. |
| M-08 | **Kontextabhängige Portbewertung** (Dienst × Segment × Authentifizierung) statt fester `scoreImpact` | 📱+ | 3 | 5 | 4 | 3 | 2 | Drucker im Druckernetz ≠ Drucker im Gäste-WLAN. Ohne das produziert der Katalog Fehlalarme. |
| M-09 | **Maßnahmenliste als Dashboard-Primärelement** (B-10), sortiert nach Dringlichkeit, mit Aufwand und Kosten | 📱 | 3 | 5 | 3 | **5** | 1 | Ein Score ohne nächsten Schritt ist Beunruhigung, kein Produktnutzen. |
| M-10 | **Remediation-Loop** (B-11): abhaken → automatisch nachprüfen → Score-Effekt → Nachweis im Bericht | 📱 ☁️ | 4 | 5 | 4 | **5** | 2 | Die Schleife, die aus einem Einmal-Report ein Abonnement macht. |
| M-11 | **Tarif-Karte vom Dashboard entfernen** | 📱 | 1 | 3 | 1 | 4 | 1 | Vertriebsfläche über Sicherheitsinhalt untergräbt die Seriosität. |
| M-12 | **Ampel barrierefrei** (Symbol + Text, nicht nur Farbe), Dynamic Type testen | 📱 | 1 | 3 | 2 | 4 | 1 | Zielgruppe 60+, 8 % Rot-Grün-Schwäche. |
| M-13 | **Worker-Monolith zerlegen** (B-7) in Routes/Providers/Middleware | ☁️ | 3 | 4 | 2 | 1 | 2 | 5.132 Zeilen blockieren Teamwachstum und Review. |
| M-14 | **Plattform-Limitierungen ehrlich im UI** („3 Prüfungen hier nicht verfügbar — mit Agent messbar") | 📱 | 1 | 4 | 3 | 4 | 1 | Konsequenz aus dem eigenen Evidenzmodell. |

### 10.2 SHOULD HAVE — Wettbewerbsdifferenzierung

| ID | Maßnahme | Weg | Auf | Nut | Sich | UX | Ris | Begründung |
|---|---|---|---|---|---|---|---|---|
| S-01 | **FRITZ!Box-TR-064-Integration** (B-9): Firmware, Portfreigaben, UPnP, Gastnetz, WLAN, Geräteliste | 🔧 | 3 | **5** | **5** | 4 | 3 | Bestes Verhältnis Aufwand zu Evidenzgewinn im gesamten Backlog. Wandelt mehrere Regeln von `self_reported` zu `measured`. |
| S-02 | **Windows-Desktop-Agent v1** (Patch, Defender, BitLocker, Firewall, lokale Admins, Backup) | 💻 | **5** | **5** | **5** | 4 | 3 | Durchbricht die strukturelle Evidenz-Decke bei 4 von 6 Kategorien. |
| S-03 | **KBV-§75b-Compliance-Mapping** mit Erfüllungsgrad je Anlage | ☁️ | 3 | **5** | 3 | **5** | 2 | Der eigentliche Kaufgrund für eine deutsche Praxis. |
| S-04 | **CVE- und Firmware-EOL-Wissensbasis** (B-8), serverseitig, ohne App-Release aktualisierbar | ☁️ | 4 | 5 | **5** | 3 | 3 | Wandelt Firmware-Bewertung von Selbstauskunft zu Messung. |
| S-05 | **Serverseitig aktualisierbarer Prüf-Feed** (Ports, OUI, Anleitungen, Regeln) | ☁️ | 4 | 5 | 4 | 2 | 3 | Ohne das braucht jede neue Prüfung einen App-Store-Release. Strukturelle Bremse. |
| S-06 | **Angriffspfad-Erzählung durch KI** (Kette statt Einzelbefunde) | ☁️ | 3 | **5** | 3 | **5** | 2 | Der größte Wertsprung im Bericht; rechtfertigt den Preis. |
| S-07 | **Segment-Reachability-Matrix** (belegt Segmentierung technisch) | 📱+ 💻 | 3 | 5 | **5** | 3 | 3 | Ersetzt die schwächste Selbstauskunft-Gruppe durch Messung. |
| S-08 | **Gastnetz-Isolationstest** (aus dem Gastnetz gegen Praxis-IPs) | 📱+ | 2 | 5 | **5** | 4 | 2 | Sehr häufige reale Lücke, sehr anschaulich vermittelbar. |
| S-09 | **Vollständige IEEE-OUI-Datenbank** statt 6 hartcodierter Einträge | ☁️ | 1 | 4 | 3 | 4 | 1 | Trivialer Aufwand, sofort sichtbare Verbesserung der Geräteerkennung. |
| S-10 | **Zwei-Ebenen-Sprache** (Praxis / Technik), umschaltbar | 📱 | 3 | 5 | 2 | **5** | 1 | Beide Kernzielgruppen brauchen dieselben Daten unterschiedlich dargestellt. |
| S-11 | **Gerätespezifische Schritt-für-Schritt-Anleitungen** nach erkanntem Modell | ☁️ | 3 | 5 | 4 | **5** | 2 | Der Unterschied zwischen „Problem gemeldet" und „Problem gelöst". |
| S-12 | **Berichtsvarianten** (Inhaber / Dienstleister / DSB / Auditor) aus einem Datenstand | ☁️ | 2 | 5 | 2 | **5** | 1 | Struktur existiert bereits; nur andere Serialisierung. |
| S-13 | **Scan im Hintergrund + Push bei Abschluss + Teilergebnisse** | 📱 | 3 | 4 | 2 | **5** | 2 | Lange Scans werden sonst abgebrochen. |
| S-14 | **Offline-Modus mit Sync-Queue** | 📱 | 3 | 3 | 2 | 4 | 2 | Scoring-Engine ist bereits pur — Voraussetzung erfüllt. |
| S-15 | **Rollen erweitern**: Mitarbeiter, Datenschutzbeauftragter, Auditor (read-only, befristet, protokolliert) | ☁️ | 3 | 4 | 3 | 3 | 2 | Auditor-Zugang ist ein direktes Verkaufsargument. |
| S-16 | **Kosten- und Zeitschätzung je Maßnahme** | ☁️ | 2 | 5 | 2 | **5** | 2 | Ermöglicht Budgetentscheidungen; Microsoft-Secure-Score-Muster. |
| S-17 | **Signierte, hashgesicherte Berichte** | ☁️ | 2 | 4 | 3 | 2 | 1 | Belastbarkeit gegenüber Auditoren und Versicherern. |
| S-18 | **Interne TLS-/Zertifikatsprüfung** (Router, NAS, PVS) | 📱+ | 2 | 4 | 4 | 3 | 1 | Externe TLS-Prüfung existiert, interne fehlt vollständig. |
| S-19 | **Typosquatting-/Phishing-Domain-Überwachung** | ☁️ | 2 | 4 | 4 | 4 | 1 | Hoher Praxiswert, geringer Aufwand, gut vermittelbar. |
| S-20 | **Plugin-Architektur für Prüfungen** | alle | 4 | 5 | 3 | 1 | 3 | Voraussetzung dafür, dass die Prüftiefe überhaupt schnell wachsen kann. |
| S-21 | **Entra-ID-/Graph-Anbindung** (MFA-Abdeckung messbar) | ☁️ | 3 | 5 | **5** | 3 | 3 | Wandelt eine der vier Green-Hard-Requirements von Behauptung zu Messung. |
| S-22 | **WLAN-Abdeckung außerhalb der Praxis** („auf der Straße empfangbar") | 📱 | 2 | 3 | 3 | **5** | 1 | Extrem anschaulich, erzeugt Handlungsbereitschaft. |
| S-23 | **MTA-STS, TLS-RPT, DANE** ergänzend zu SPF/DKIM/DMARC | ☁️ | 2 | 3 | 3 | 2 | 1 | Vervollständigt die E-Mail-Sicherheitsprüfung. |
| S-24 | **Standardpasswort-Heuristik** (Ersteinrichtungs-Assistent, Werks-SSID — **keine Login-Versuche**) | 📱+ 🔧 | 2 | 4 | 4 | 3 | 3 | Sehr häufiger Realbefund; Umsetzungsgrenze strikt einhalten. |

### 10.3 NICE TO HAVE

| ID | Maßnahme | Weg | Auf | Nut | Sich | UX | Ris |
|---|---|---|---|---|---|---|---|
| N-01 | Linux-/macOS-Agent | 💻 | 4 | 3 | 4 | 2 | 2 |
| N-02 | Active-Directory-Prüfmodul | 💻 | 4 | 4 | 5 | 2 | 3 |
| N-03 | Sicherheits-Chatbot mit Netzkontext | ☁️ | 3 | 4 | 2 | 5 | 2 |
| N-04 | TOM-/Art.-32-Dokumentation aus Befunden vorbefüllen | ☁️ | 3 | 5 | 2 | 5 | 2 |
| N-05 | Weitere Router: Speedport, UniFi, Lancom, OPNsense | 🔧 | 4 | 3 | 4 | 3 | 3 |
| N-06 | Favicon-Hash-Fingerprinting für Geräteklassen | 📱+ | 2 | 3 | 3 | 2 | 1 |
| N-07 | Zertifikatstransparenz-Monitoring | ☁️ | 2 | 3 | 3 | 2 | 1 |
| N-08 | Schulungsmodul mit Nachweis und Phishing-Simulation | ☁️ | 4 | 4 | 4 | 4 | 3 |
| N-09 | Geräte-Lebenszyklus (EOL, Garantie, Verantwortlicher, Raum) | ☁️ | 2 | 3 | 2 | 4 | 1 |
| N-10 | Benchmark gegen anonymisierte Praxis-Kohorte | ☁️ | 3 | 4 | 1 | 4 | 3 |
| N-11 | QR-Code-Erfassung von Geräteetiketten | 📱 | 2 | 3 | 1 | 4 | 1 |
| N-12 | Notfallplan-Generator (Ransomware, Ausfall, Datenpanne-Meldung) | ☁️ | 3 | 4 | 3 | 4 | 2 |
| N-13 | Passiver Verkehrsmonitor (Shadow IT via DNS) | 💻 🔧 | 4 | 3 | 3 | 2 | 3 |
| N-14 | Echtes Web-Portal für IT-Dienstleister (Multi-Praxis-Übersicht) | ☁️ | 4 | 4 | 2 | 4 | 2 |
| N-15 | API für IT-Dienstleister-Systeme (PSA/RMM) | ☁️ | 3 | 3 | 1 | 2 | 2 |

### 10.4 ZUKUNFTSVISION (Jahr 3–5)

| ID | Maßnahme | Weg | Auf | Nut | Sich | UX | Ris |
|---|---|---|---|---|---|---|---|
| Z-01 | Hardware-Sensor für Dauerüberwachung im Praxisnetz | Hardware | 5 | 5 | 5 | 3 | 4 |
| Z-02 | Kontinuierliche passive Netzüberwachung mit Anomalieerkennung | 💻/HW | 5 | 4 | 5 | 3 | 4 |
| Z-03 | Versicherungs-Schnittstelle (Cyber-Police-Nachweis mit Prämienrelevanz) | ☁️ | 4 | 5 | 2 | 3 | 4 |
| Z-04 | Automatisierte Behebung mit Freigabe (Router-Konfigurationsänderung) | 🔧 | 4 | 5 | 5 | 5 | **5** |
| Z-05 | Medizingeräte-Schwachstellendatenbank (Hersteller-Advisories, BfArM) | ☁️ | 5 | 5 | 5 | 3 | 3 |
| Z-06 | Gematik-/TI-Konformitätsprüfung (Konnektor, KIM, ePA, TI 2.0) | 📱+ ☁️ | 4 | 5 | 4 | 4 | 3 |
| Z-07 | Zertifizierung als anerkanntes Prüfverfahren (KBV/KV-Anerkennung) | Organisation | 5 | 5 | 2 | 3 | 4 |
| Z-08 | Marktplatz für geprüfte IT-Dienstleister mit Maßnahmenvermittlung | ☁️ | 4 | 4 | 2 | 4 | 3 |

---

## 11. Roadmap

**Q1 — Glaubwürdigkeit herstellen.**
M-01 bis M-08, M-11, M-12, M-14, S-09. Ergebnis: Was die App behauptet zu prüfen, prüft sie auch. Medizingeräte sind geschützt, Scans sind rechtlich gedeckt, der Port-Katalog deckt die medizinische Domäne ab.

**Q2 — Nutzen sichtbar machen.**
M-09, M-10, M-13, S-01, S-06, S-08, S-10, S-11, S-12, S-22. Ergebnis: Die FRITZ!Box-Integration liefert echte Router-Evidenz. Der Nutzer sieht, was zu tun ist, tut es und sieht den Effekt.

**Q3 — Evidenz-Decke durchbrechen.**
S-02 (Windows-Agent), S-04, S-05, S-07, S-20, S-21. Ergebnis: Die Selbstauskunft-Kappung fällt bei Patch, Backup, MFA. Der Score wird belastbar.

**Q4 — Verkaufsargument schärfen.**
S-03 (KBV-Mapping), S-13 bis S-19, S-23, S-24. Ergebnis: Die Praxis bekommt eine Antwort auf ihre eigentliche Frage.

**Jahr 2:** N-01 bis N-15 — Breite in Plattformen, Routern, Rollen und Dienstleister-Workflows.
**Jahr 3–5:** Z-01 bis Z-08 — von der Prüf-App zur kontinuierlichen Sicherheitsplattform mit institutioneller Anerkennung.

---

## 12. Was gestrichen oder zurückgestuft gehört

| Element | Empfehlung | Grund |
|---|---|---|
| Glassmorphismus / `electric`-Consumer-Ästhetik | Ersetzen | Untergräbt die Ernsthaftigkeit eines Prüfberichts |
| Tarif-Karte im Dashboard | In die Einstellungen | Vertrieb vor Sicherheitsinhalt |
| Radar-Chart | Prüfen | Radar-Diagramme sind schwer korrekt zu lesen; Balken mit Zielwert sind ehrlicher |
| `traffic_analysis`-Scanphase | Umbenennen | Es findet keine Verkehrsanalyse statt (mobil unmöglich). Der Name verspricht etwas, das die App nicht tut |
| NIS2 in der Vermarktung | Sehr vorsichtig | Kleine Arztpraxen fallen in aller Regel nicht unter NIS2. Es als Kaufargument zu nutzen wäre Angstverkauf und beschädigt die Glaubwürdigkeit gegenüber informierten IT-Dienstleistern |
| „WLAN-Tiefenscan" als Tarif-Feature | Erst nach M-03/M-05 bewerben | Aktuell trägt der Begriff nicht |
| `deviceClassifications: []` in `probeGatewaySecurity` | Aufräumen | Feld wird an zwei Stellen konstant leer gesetzt; die Klassifikation passiert woanders |

---

## 13. Die drei wichtigsten Sätze

1. **Das Evidenzmodell ist der Vermögenswert.** Es ist besser als alles Vergleichbare im Markt und muss bei jedem Ausbau der Prüftiefe verteidigt werden. Kein Feature darf dazu führen, dass eine Behauptung wie eine Messung aussieht.

2. **Die Prüftiefe muss die Versprechen einholen — oder die Versprechen müssen schrumpfen.** Fünf nicht implementierte Probes, elf feste Scan-IPs und kein einziger medizinischer Port stehen gegen den Anspruch „umfassendster IT-Sicherheitscheck". Diese Lücke ist das größte Einzelrisiko des Produkts.

3. **Ohne Desktop-Agent und Router-Integration hat der Score eine strukturelle Decke.** Vier von sechs Kategorien können technisch nie über Selbstauskunft hinauskommen. Das ist keine Priorisierungsfrage, sondern ein Konstruktionsfehler, den nur diese beiden Bausteine beheben.
