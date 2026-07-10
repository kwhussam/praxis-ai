# PraxisShield Inventar

Das Praxis-Inventar ist ein lokal persistiertes Modul zur Dokumentation von Assets und erwarteten Netzwerkkomponenten. Es ist getrennt vom Scoring implementiert, wird aber vom WLAN-Scan als Referenz für Rogue-Erkennung verwendet.

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
