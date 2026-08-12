# SP2-05 – Consent Registry v1

Stand: 2026-08-12
Status: `verification`

## Sicherheits- und Datenvertrag

- Ein Request-Flag ist niemals eine Einwilligung. Autoritativ ist ausschließlich das neueste
  unveränderliche Registry-Ereignis derselben Praxis und desselben Zwecks.
- V1 verwaltet zwei getrennte Zwecke:
  - `external_provider_checks`: Praxis-Domains/Subdomains für Cloudflare DNS, Qualys SSL Labs,
    Shodan, VirusTotal, SecurityTrails und direkte HTTPS-Prüfungen;
  - `hibp_email_leak_check`: freigegebene Praxis-E-Mail-Adressen an HIBP für Leak-Metadaten.
- Der Worker setzt Textversion (`2026-08-12.v1`), strukturierten Scope und 365 Tage Gültigkeit.
  Clientwerte können diese Felder nicht erweitern oder verlängern.
- Jedes Ereignis enthält Praxis, Actor, Entscheidung, Zeit, pseudonymisierte Request-Metadaten,
  Ablauf und Vorgänger-ID. Ein PostgreSQL-Advisory-Lock serialisiert konkurrierende Ereignisse je
  Praxis/Zweck; `UPDATE`, `DELETE` und `TRUNCATE` sind gesperrt.
- Aktiv bedeutet: neuestes Ereignis ist erteilt, nicht widerrufen, besitzt die aktuelle Textversion
  und ein noch nicht abgelaufenes `expires_at`. Fehlende, alte, abgelaufene oder nicht lesbare
  Evidenz bedeutet immer inaktiv.

## Autorisierung und Ausführung

- `POST /api/legal/consent`: mindestens Praxisrolle `manager`; legt Grant oder Withdrawal an.
- `GET /api/legal/consent/status`: mindestens Praxisrolle `viewer`; liefert den aktuellen Status.
- Die SQL-Entscheidungsfunktionen sind `SECURITY DEFINER`, besitzen einen leeren festen
  `search_path` und dürfen ausschließlich vom `service_role` ausgeführt werden.
- Manueller externer Check und manueller Monitoringlauf prüfen die Provider-Einwilligung vor
  Quotenbuchung und Provideraufruf. Wenn E-Mail-Leak-Prüfung angefordert ist, wird HIBP zusätzlich
  und ebenfalls vorher geprüft.
- Der Scheduler verarbeitet nur Praxen mit aktiver Provider-Einwilligung und übermittelt E-Mail nur
  bei zusätzlicher aktiver HIBP-Einwilligung. Ein RPC-/Datenbankfehler stoppt den Lauf fail-closed.

## Datenschutz und UX

- Die Monitoring-Oberfläche zeigt beide Zwecke getrennt, nennt Empfänger und Datenarten und zeigt
  bei aktiver Freigabe das Ablaufdatum. Erteilung und Widerruf werden serverseitig protokolliert.
- Der Datenschutzexport enthält Textversion, Scope, Ablauf, Widerruf und Vorgängerbezug. Die
  Behandlung der Einwilligungsnachweise bei einer Praxislöschung folgt dem bestehenden rechtlichen
  Aufbewahrungsvertrag; SP2-05 deklariert hierzu keine neue Rechtsgrundlage.
- Vor Produktion müssen Wortlaut, Rechtsgrundlage, Widerrufsfolgen, Aufbewahrungsdauer und
  Drittanbieterinformationen durch Datenschutz/Fachrecht freigegeben werden. Technische
  Zweckbindung ersetzt diese Freigabe nicht.

## Deployment

1. Migration `20260812150000_sp2_05_consent_registry.sql` anwenden.
2. Worker deployen. Alte Clients dürfen Request-Flags weiter senden; der Worker ignoriert sie als
   Autorisierungsquelle und verlangt den Registry-Eintrag.
3. App ausrollen. Vorhandene Nutzer starten aus Sicherheitsgründen ohne aktive V1-Freigabe und
   müssen die beiden Zwecke bei Bedarf neu erteilen.
4. Canary prüfen:
   - ohne Registry-Eintrag: `403 consent_required`, keine Quote und kein Provideraufruf;
   - nur Providerfreigabe: Domainprüfung möglich, keine HIBP-Übermittlung;
   - Widerruf: unmittelbar nächster manueller und geplanter Lauf gestoppt;
   - Ablauf/alte Textversion: wie fehlende Freigabe behandelt;
   - Praxis A kann Status und Historie von Praxis B nicht lesen.
5. Metriken für `consent_denied`, Registry-RPC-Fehler und ungewöhnliche Grant-/Withdrawal-Raten
   überwachen, ohne Scope-Payloads oder E-Mail-Adressen zu loggen.

## Rollback

Der sichere Rollback erhält die Evidenz. Bei einem Worker-Rollback dürfen Providerläufe nicht auf
transiente Request-Flags zurückfallen; stattdessen External Checks per Feature Flag deaktivieren.
Migration, Registry-Zeilen und Append-only-Trigger bleiben bestehen. Datenbankobjekte erst nach
Aufbewahrungsentscheidung in einer separaten geprüften Migration entfernen.

## Verifikationsnachweise

- frischer lokaler `supabase db reset --local`: alle Migrationen einschließlich SP2-05 angewandt;
- `supabase db test --local`: 242 pgTAP-Tests grün; `consent_registry.sql` enthält 17 Nachweise für
  Grants, RLS, Ablauf, Versionsbindung, Schedulerselektion, Append-only-Verhalten und Vorgängerkette;
- `supabase db lint --local --level warning`: keine neue SP2-05-Warnung; nur die vorbestehenden
  ungenutzten Parameter in `create_or_get_own_practice` werden gemeldet;
- Worker-Negativtests prüfen fehlende Provider-/HIBP-Einwilligung vor Quota und Outbound Requests;
- Clienttests prüfen, dass Scope, Version und Ablauf nicht vom Client gesetzt werden.
- GitHub-CI-Run `31616201072` für Commit `b253d76`: `quality` einschließlich Secret Scan und
  Gesamtverifikation sowie `rls-pgtap` vollständig erfolgreich.

## Noch offene Release-Gates

- Datenschutz-/Fachrechtsfreigabe des V1-Wortlauts, der Rechtsgrundlage, Drittanbieterinformationen,
  Aufbewahrung und Widerrufsfolgen;
- nativer iOS-/Android-Smoke für Erteilen, App-Neustart, Ablaufanzeige, Widerruf und blockierten
  Folgescan.
