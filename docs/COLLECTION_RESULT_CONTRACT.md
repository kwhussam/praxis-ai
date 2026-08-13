# Collection- und Freshness-Vertrag

> **Stand:** 2026-08-10
> **Status:** Implementiert, technische Verifikation abgeschlossen; Native-Device-Smoke steht als Release-Gate aus.
> **Bezug:** `SP1-02`, `lib/assessment/collection.ts`

Dieser Vertrag trennt das Ergebnis einer **Erhebung** vom fachlichen Ergebnis einer
**Kontrolle**. Ein Sensorfehler, ein Plattformlimit oder eine verweigerte
Berechtigung darf weder als „keine Geräte gefunden“ noch als bestandene oder
nicht bestandene Sicherheitskontrolle erscheinen.

## 1. Verbindliche Erhebungszustände

| Status | Bedeutung | Darf einen Messwert tragen? | Scoring |
|---|---|---:|---|
| `collected` | Sensorlauf technisch erfolgreich | ja, auch `[]`, `false` oder `0` | fachlich auswertbar, sofern nicht abgelaufen |
| `not_checked` | Erhebung noch nicht ausgeführt/konfiguriert | nein | `unknown`, 0 Punkte |
| `unsupported` | Plattform oder Adapter unterstützt die Messung nicht | nein | `unknown`, 0 Punkte |
| `permission_denied` | erforderliche Berechtigung fehlt | nein | `unknown`, 0 Punkte, Reviewhinweis |
| `timeout` | Sensor hat die Zeitgrenze überschritten | nein | `unknown`, 0 Punkte, Reviewhinweis |
| `error` | Sensor ist technisch fehlgeschlagen | nein | `unknown`, 0 Punkte, Reviewhinweis |
| `unavailable` | Quelle ist grundsätzlich nutzbar, lieferte aber keinen Wert | nein | `unknown`, 0 Punkte, Reviewhinweis |

Der TypeScript-Typ ist eine diskriminierte Union. Nur `status: collected` besitzt
verbindlich ein `value`-Feld. Dadurch ist `collected([])` eindeutig von einem
fehlgeschlagenen Gerätescan unterscheidbar.

## 2. Zeit- und Freshness-Semantik

Jede Erhebung enthält `observed_at`. Erfolgreiche zeitkritische Sensoren setzen
zusätzlich `expires_at`:

- aktuelles WLAN und sichtbare WLAN-Netze: fünf Minuten;
- lokale Geräteerkennung: zehn Minuten;
- Quellen ohne definierte Ablaufregel: `freshness: unknown`, nicht geraten.

`freshness` hat die Werte `fresh`, `stale` oder `unknown`. Die Ablaufgrenze ist
exklusiv: `expires_at <= now` ist `stale`. Abgelaufene Evidenz wird im Scoring
wie unbekannte Evidenz behandelt, erhält keine Punkte und löst eine erneute
Prüfung aus. Fehlendes `expires_at` bleibt aus Gründen der Rückwärtskompatibilität
bewertbar, wird aber ausdrücklich als `unknown` gekennzeichnet. Diese neue
Bewertungssemantik ist als `SCORING_VERSION = 2.2.1` versioniert.

Für Zeitstempel von Clientgeräten gilt eine maximale positive Uhrabweichung von
zwei Minuten. `observed_at` bis einschließlich dieser Grenze bleibt gültig;
größere Zukunftsabweichungen, ungültige Datumswerte und `expires_at < observed_at`
werden als fehlerhafte Evidenz behandelt. Die Toleranz verhindert Fehlalarme
durch leicht abweichende Geräteuhren, ohne beliebige Zukunftszeitstempel zu
akzeptieren.

## 3. Adapter- und Plattformverhalten

Die Native-WLAN-Adapter liefern strukturierte `CollectionResult`-Objekte:

- Web: WLAN-SSID, sichtbare Netze und native Geräteerkennung `unsupported`;
- iOS: sichtbare WLAN-Netze `unsupported`; SSID nur im zulässigen OS-/Entitlement-Rahmen;
- Android: fehlende Laufzeitberechtigung `permission_denied`;
- native Bridge nicht vorhanden: lokale Geräteerkennung `unsupported`;
- leere, aber erfolgreiche Netz-/Geräteliste: `collected` mit `value: []`;
- native Ausnahme: `error`; überschrittene Adapterzeit: `timeout`.

Die alten Convenience-Funktionen bleiben vorerst rückwärtskompatibel erhalten.
Neue Assessment-Pfade müssen die `collect*`-Funktionen verwenden.

## 4. WLAN-Scan und Coverage

Ein `WlanScanResult` enthält ab jetzt:

- `collection.currentWifi`;
- `collection.securityProtocol`;
- `collection.visibleWifiNetworks`;
- `collection.localDevices`;
- `collection.mdnsDiscovery`;
- `coverage` mit Anteil erfolgreich erhobener, auf der Plattform unterstützter
  Sensoren sowie getrennten Listen für fehlende und nicht unterstützte Quellen.

`unsupported` wird analog zu `not_applicable` aus dem Nenner entfernt. Damit
kann iOS für alle dort tatsächlich verfügbaren Sensoren vollständige Coverage
erreichen. Die nicht durch öffentliche iOS-APIs erlaubten Prüfungen werden in
`coverage.unsupported` und in der Oberfläche ausdrücklich als „Auf diesem Gerät
nicht unterstützt“ ausgewiesen. Ein System ganz ohne unterstützte Sensoren
erhält weiterhin keine ausreichende Coverage.

Die bewusst nicht implementierte iOS-mDNS-Erkennung trägt `unsupported` und wird damit aus dem
Coverage-Nenner entfernt. Ein Lauf, der die mDNS-Phase noch nicht ausgeführt hat, bleibt
`not_checked`; ein technischer Ausfall auf einer grundsätzlich unterstützten Plattform bleibt
`unavailable` und reduziert die Coverage. Auch ein vollständig leeres mDNS-Ergebnis ist ohne
explizite Messbelege `unavailable`; eine leere Liste darf nicht als erfolgreiche Nullmessung
interpretiert werden.

Die relevanten `WlanFinding`-Objekte tragen Collection-Status, Grund,
Beobachtungszeit, Ablaufzeit und Freshness weiter. Nicht erfolgreiche Sensoren
werden zusätzlich in der Methodik/Limitation dokumentiert und beim Sync im
`network_info`-Payload erhalten.

Das Finding `securityProtocol` besitzt eine eigene Erhebungsherkunft. Native
Security-Details, sichtbare WLAN-Capabilities und eine SSID-basierte Inferenz
werden getrennt dokumentiert. Ist die Erhebung auf iOS nicht unterstützt, trägt
das Finding `value: null` statt eines scheinbar gemessenen `UNKNOWN`-Werts.

## 5. Monitoring-Mapping

Monitoring verwendet denselben Grundvertrag:

| Providerzustand | Collection-Status |
|---|---|
| `active` | `collected` |
| `not_configured` | `not_checked` |
| `unavailable` | `unavailable` |
| `timeout` | `timeout` |

Coverage zählt im Nenner ausschließlich unterstützte Sensoren und im Zähler
ausschließlich `collected`. Neue Sensorfamilien sollen ihre Coverage über
`calculateCollectionCoverage` berechnen.

## 6. Release-Gates

- TypeScript bleibt exhaustiv für alle Statuswerte.
- Mapping-, Freshness-, Timeout-, Permission- und WLAN-Integrationstests sind grün.
- Vor `released`: Android- und iOS-Smoke auf der definierten Gerätematrix,
  einschließlich Berechtigungsablehnung und Wiederfreigabe.
