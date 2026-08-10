# PraxisShield Inventar

Das Praxis-Inventar ist ein lokal persistiertes Modul zur Dokumentation von Assets und erwarteten Netzwerkkomponenten. Es ist getrennt vom Scoring implementiert, wird aber vom WLAN-Scan als Referenz für Rogue-Erkennung verwendet. Cloudsync und produktive Bestandsmigration sind bis zur Freigabe von ADR-001 weiterhin deaktiviert.

## Lokaler Schutz- und Repositoryvertrag

SP2-01A speichert pro Praxis genau einen versionierten Snapshot als AES-256-GCM-Envelope in Expo SQLite. Der zufällige 256-Bit-Schlüssel liegt ausschließlich in Expo SecureStore mit `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; SecureStore wird nicht als Massendatenspeicher verwendet. Die AAD bindet Repositoryzweck, Praxis-ID, Algorithmus, Key-/Payload-/AAD-Version, Snapshotrevision und Erstellungszeitpunkt. Das Verschieben oder Verändern eines Envelopes führt damit zu einem geschlossenen Entschlüsselungsfehler.

Schreibvorgänge verwenden eine monotone Revision und Compare-and-Swap. Schnelle Folgeänderungen werden praxisweise serialisiert; ein Konflikt überschreibt niemals still einen neueren Snapshot. Mutationen während der initialen Hydrierung werden gepuffert. Verspätete Ergebnisse nach Logout oder Praxiswechsel werden verworfen.

Kann SecureStore nicht verwendet werden, schreibt PraxisShield weder Schlüssel noch Inventar in SQLite. Die Oberfläche zeigt dann ausdrücklich „Nur flüchtiger Speicher“; die Daten bleiben nur im Arbeitsspeicher. Ein ungültiges Envelope, Schlüsselverlust oder eine unbekannte Schemaversion blockiert Änderungen, damit vorhandene Ciphertexte nicht unbemerkt überschrieben werden. Praxislöschung vernichtet zuerst den Schlüssel und anschließend den Ciphertext; Logout und Praxiswechsel leeren nur den Arbeitsspeicher.

## Herkunft und Synchronisationssperre

Jeder Datensatz besitzt `source`, `synthetic`, `confidence`, `syncPolicy` sowie optionale Beobachtungs-, Bestätigungs- und Ablaufzeitpunkte. Manuell bestätigte Einträge sind von beobachteten oder importierten Objekten unterscheidbar.

Aus dem Praxisprofil abgeleitete Domain-/E-Mail-Seeds werden immer als `source=practice_profile`, `synthetic=true`, `confidence=30` und `syncPolicy=local_only` erzeugt. Auch widersprüchliche Aufruferwerte können diese Sperre nicht aufheben. Die UI bezeichnet solche Einträge als „Vorschlag, nicht gemessen“. Das verbindliche Synchronisations-Gate verweigert jeden synthetischen oder `local_only`-Datensatz mit `inventory_record_local_only`; ein Cloudtransport ist in SP2-01A noch nicht aktiv.

Die lokale Snapshotversion ist derzeit `1`. Da es vor SP2-01A keine persistierten Inventarsnapshots gab, besteht kein Klartext-Backfill. Unbekannte zukünftige oder fehlerhafte Versionen werden nicht automatisch interpretiert; eine spätere Migration benötigt einen expliziten, getesteten Versionspfad.

## Known Devices

Die Known-Device-Liste enthält freigegebene Geräte mit:

- MAC-Adresse
- Hostname
- Gerätetyp
- Standort
- Besitzer
- Kritikalität
- letztem Bestätigungsdatum

Die Rogue-Device-Erkennung gleicht sichtbare Geräte zuerst gegen diese Liste ab. MAC-Adressen werden normalisiert, Hostnamen werden zusätzlich als Fallback genutzt. Geräte ohne Treffer gelten als unbekannt; Einträge mit mehr als 90 Tagen seit der letzten Bestätigung werden im Inventar als überfällig gezählt.

## Access Points

Das Access-Point-Inventar enthält offizielle WLAN-Basisstationen mit:

- SSID
- BSSID
- Standort
- Hersteller
- Kanal
- erwarteter Verschlüsselung

Die Rogue-Access-Point-Erkennung vergleicht sichtbare BSSIDs gegen dieses Inventar. Sichtbare BSSIDs derselben SSID, die nicht dokumentiert sind, oder Access Points mit abweichender erwarteter Verschlüsselung werden als verdächtig bewertet.

## Router-/WLAN-Konfiguration

Die manuelle Router-/WLAN-Konfigurationsabfrage dokumentiert:

- WPA2-AES
- WPA2/WPA3 Mixed Mode
- WPA3
- TKIP
- offenes WLAN
- WPS

Diese Angaben dienen als Selbstauskunft, wenn Router- oder WLAN-Konfigurationsdetails technisch nicht zuverlässig auslesbar sind.

## Router-/Firewall-Regeln

Router- und Firewall-Regeln können manuell erfasst oder aus CSV-/Tabellenexporten importiert werden. Jede Regel dokumentiert:

- interne oder externe Sicht
- Richtung, z. B. WAN zu LAN, LAN zu WAN, LAN zu LAN oder VPN zu LAN
- Protokoll und Ports
- Quelle und Ziel
- erlaubende oder blockierende Aktion
- Zweck, Verantwortlichen und letztes Review-Datum

Der WLAN-Scan nutzt diese Regeln als Kontext für den Firewall-Basischeck. Externe Freigaben werden getrennt von intern sichtbaren Diensten bewertet; offene interne Dienste werden dadurch nicht automatisch als Internet-Exposition gewertet.
