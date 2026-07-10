# PraxisShield Scoring 1.4.0

Die Scoring-Engine ist regelbasiert, versioniert und auditierbar. Jeder Gesamtscore entsteht aus `SCORING_RULES` in `lib/security/scoring.ts`; jede Regel liefert Punkte, Kategorie, technische Evidenz, Finding und Empfehlung.

## Evidence & Coverage

Zusätzlich zum Sicherheitswert berechnet die Engine einen separaten `evidence_coverage_score`. Dieser Wert verändert den Sicherheits-Score nicht, sondern bewertet, wie belastbar die Datengrundlage je Prüfmodul ist.

Jedes `rule_results`-Element enthält `evidence_coverage` mit:

- `source`: `measured`, `inferred`, `self_reported`, `not_checked` oder `unavailable`.
- `score`: Coverage-Wert von 0 bis 100 für dieses Prüfmodul.
- `label`: deutschsprachige Anzeige für die UI.
- `detail`: kurze Begründung der Einordnung.

Die Gewichtung erfolgt anhand der maximalen Regelpunkte:

- `measured` = 100: technisch gemessen, z. B. WLAN-Verschlüsselung oder DMARC aus externem Check.
- `inferred` = 70: heuristisch aus anderen Befunden abgeleitet, z. B. aggregierte aktive Findings.
- `self_reported` = 45: per Fragebogen/Selbstauskunft erfasst.
- `not_checked` = 0: nicht geprüft, weil die jeweilige Prüfung nicht ausgeführt oder keine Eingabe erfasst wurde.
- `unavailable` = 0: technisch nicht verfügbar oder nicht zuverlässig auslesbar.

Prüfmodule mit `not_checked`- oder `unavailable`-Evidenz erhalten keine Punkte und werden nicht als bestanden markiert. Ausgeführte technische Prüfungen ohne Befund bleiben weiterhin positiv bewertbar, sofern die jeweilige Ergebnisquelle explizit vorliegt, z. B. leere Finding-Listen nach abgeschlossenem Scan.

## Kategorien

- `access_control`: Zugriffsschutz, insbesondere MFA.
- `backup`: Backup-Frequenz und dokumentierte Restore-Tests.
- `email_security`: SPF/DKIM/DMARC, aktuell mit Schwerpunkt DMARC-Policy.
- `network`: WLAN-Verschlüsselung, aktive externe/WLAN-Findings und lokale technische Netzwerkprüfungen.
- `dsgvo`: Schulungen, Datenschutzdokumentation und dokumentierte Verantwortlichkeiten.
- `updates`: Patch- und Update-Stand.

## Fragebogen-Nachweise

Der Fragebogen trennt Statusangaben von konkreten Nachweisen. Kritische Selbstauskünfte zählen erst vollständig, wenn der passende Nachweis bestätigt wurde:

- MFA zählt als aktiv, wenn MFA aktiviert ist und ein Nachweis wie Richtlinie, Screenshot oder Benutzerliste vorliegt.
- Der MFA-Fragebogen erfasst konkret E-Mail, Praxissoftware, VPN, Cloud-Dienste, Admin-Konten und Fernwartung.
- Backups zählen als tägliche Backups, wenn tägliche Sicherung, Backup-Frequenz, Backup-Ziel, Offline-/Immutable-Backup, Verantwortlicher und Backup-Protokoll bestätigt sind.
- Restore-Tests zählen nur mit dokumentiertem letztem Restore-Testdatum, Ergebnis und Verantwortlichem.
- Patchmanagement zählt nur mit festem Patchprozess, dokumentiertem Systemumfang, Patch-Frequenz, Verantwortlichem, letztem Patchdatum, Ausnahmen und Update-Protokoll.
- DSGVO-Dokumentation zählt nur mit AVV, TOMs, Verzeichnis von Verarbeitungstätigkeiten, Löschkonzept, Berechtigungskonzept, dokumentierter Datenschutzschulung und Review/Freigabe in den letzten 12 Monaten.
- Verantwortlichkeiten zählen über `SECURITY_RESPONSIBILITIES`, wenn verantwortliche Person, Vertretung, Aufgaben und Eskalationswege dokumentiert sind.
- DHCP-Sicherheit wird zusätzlich als Fragebogenkontrolle erfasst: autorisierter DHCP-Server, erwartete Router-/Gateway-IP, erlaubte DNS-Server und bekannte Ausnahmen oder Reservierungen.
- Router-Fingerprinting kombiniert weiterhin technische Hinweise mit strukturierten Nachweisen zu Hersteller, Modell, Firmware-Version, Update-Status und zuständigem IT-Dienstleister.
- Das Default-Passwort-Risiko des Routers wird nicht durch Loginversuche geprüft. Ohne belastbaren Nachweis bleibt der Befund `unknown`/`unavailable`; die Bewertung erfolgt primär über Fragebogenangaben zu geändertem Adminpasswort, sicherer Dokumentation und Zuständigkeit.
- Router-Sicherheitsfragen erfassen zusätzlich MFA/2FA, Fernzugriff, UPnP und dokumentierte Portfreigaben.

## Ampel

- `grün`: Score ab 75.
- `gelb`: Score ab 50.
- `rot`: Score unter 50.

Berichte und gespeicherte Checks müssen `scoring_version` mitführen, damit spätere Audits nachvollziehen können, welche Regelversion verwendet wurde.

## Lokale Netzwerkprüfungen

Der WLAN-Scanner erzeugt strukturierte `NetworkSecurityFinding`-Objekte für WLAN-Verschlüsselung, WPA3-Empfehlung, Router-HTTP, Telnet, SMB, SMB-Sicherheitsmetadaten, UPnP/SSDP, RDP, Datenbankports, Drucker-, NAS-, Kamera-/IoT-Hinweise, vorsichtige medizinische Geräte-Metadaten, IPv6, DNS-Resolver, DHCP-Konsistenz, Gastnetz-Heuristik, Segmentierungs-Score, Rogue-AP-/Rogue-Device-Hinweise, Router-Firmware-Hinweise, Default-Passwort-Risiko und Firewall-Basischeck. Kritische Dienste wie Telnet, RDP oder offen erreichbare Datenbankports reduzieren den lokalen WLAN-Risikoscore direkt über `scoreImpact`; das globale Scoring berücksichtigt die aggregierten Befunde zusätzlich über `NETWORK_SECURITY_PROBES`.

Die Prüfungen sind local-first und dürfen keine Patientendaten, Dateien, SMB-/NFS-Freigaben, Druckjobs, Datenbankinhalte oder medizinische Protokollinhalte lesen. Nicht verfügbare native Plattformfunktionen werden als `unknown`/`unavailable` dokumentiert und nicht als offene Ports gewertet. Der WPS-Status wird als `not_supported`/`unavailable` gekennzeichnet, solange er technisch nicht zuverlässig auslesbar ist. JetDirect 9100 wird nur per TCP-Connect geprüft; es werden keine Nutzdaten an RAW-Druckports gesendet. Die SMB-Sicherheitsprüfung darf nur Protokollmetadaten wie SMB-Version, Signing und möglichen Gastzugriff bewerten; sie darf keine Shares auflisten und keine Dateien öffnen.

Der lokale Portscan läuft standardmäßig gegen Gateway und ausgewählte Kandidaten-IP-Adressen. Ein vollständiger IPv4-Subnetzscan ist nur im Audit-Modus mit expliziter zusätzlicher Einwilligung vorgesehen und nutzt gedrosselte TCP-Connect-Probes. Portbefunde enthalten Kontextfragen, ob der Dienst absichtlich erreichbar ist und auf welche Quellgeräte oder Quell-IP-Adressen er beschränkt sein sollte.

Der Firewall-Basischeck trennt interne Sicht aus lokalen Probes von externer Sicht aus dokumentierten Router-/Firewall-Regeln. Interne offene Dienste erzeugen Kontextbedarf, werden aber nicht pauschal als Internet-Exposition bewertet. Externe Portfreigaben werden nur als kontrolliert betrachtet, wenn Zweck, Zielsystem, Verantwortlicher und Review-Datum dokumentiert sind.

Segmentierungsprüfungen können nacheinander aus Praxis-WLAN, Gäste-WLAN, Servernetz, Druckernetz und Medizingerätenetz ausgeführt werden. Jeder Lauf speichert nur Segment, sichtbare Geräteklassen und offene Dienstmetadaten; die Bewertung aggregiert die letzten Beobachtungen pro Segment und markiert auffällige Überschneidungen. Wenn aus früheren Segmentläufen konkrete Ziel-IP-/Port-Kombinationen bekannt sind, prüft ein späterer Lauf gezielt deren TCP-Erreichbarkeit aus dem aktuellen Segment. So werden Client-Isolation und VLAN-Trennung nachvollziehbar bewertet, ohne vollständige Quersegment-Scans zu erzwingen.

DNS-Sicherheitstests verwenden harmlose Malware-/Phishing-Testdomains und werten nur DNS-Antworten aus. Es werden keine Webseiten geöffnet, keine Dateien geladen und keine schädlichen Inhalte abgerufen.

Der DNS-Betrieb wird zusätzlich per Fragebogen dokumentiert: verwendeter Resolver, DNS-Filter, Datenschutzbewertung, zuständiger Dienstleister und dokumentierte Konfiguration. IPv6 wird nur dann als sauber abgedeckt bewertet, wenn die Praxis die bewusste Nutzung sowie Firewall- und DNS-Regeln für IPv6 bestätigt oder technische Befunde dies stützen. Ein optionaler lokaler IPv6-Port-/Erreichbarkeitscheck läuft nur nach expliziter Einwilligung und prüft ausschließlich lokale ULA-/Link-Local-Adressen.
