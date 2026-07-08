export type ServiceCategory = "database" | "printer" | "nas" | "iot" | "admin" | "remote_access";

export interface ServicePortDefinition {
  port: number;
  service: string;
  category: ServiceCategory;
  risk: "critical" | "high" | "medium" | "low" | "info";
  scoreImpact: number;
  recommendation: string;
}

export const SERVICE_PORT_CATALOG = [
  {
    port: 23,
    service: "Telnet",
    category: "remote_access",
    risk: "critical",
    scoreImpact: -25,
    recommendation: "Telnet deaktivieren und nur verschlüsselte Administration erlauben."
  },
  {
    port: 139,
    service: "NetBIOS / SMB",
    category: "nas",
    risk: "high",
    scoreImpact: -10,
    recommendation: "SMB/NetBIOS nur für notwendige Praxisgeräte erlauben und SMBv1 deaktivieren."
  },
  {
    port: 445,
    service: "SMB / Windows-Dateifreigabe",
    category: "nas",
    risk: "high",
    scoreImpact: -12,
    recommendation: "Freigaben mit Benutzerrechten absichern und per Firewall segmentieren."
  },
  {
    port: 548,
    service: "AFP / Apple Filing Protocol",
    category: "nas",
    risk: "medium",
    scoreImpact: -8,
    recommendation: "AFP nach Möglichkeit deaktivieren und moderne, abgesicherte Freigaben verwenden."
  },
  {
    port: 631,
    service: "IPP / Druckdienst",
    category: "printer",
    risk: "medium",
    scoreImpact: -6,
    recommendation: "Druckdienste nur im internen Geräte-Netz erlauben und Drucker-Firmware aktuell halten."
  },
  {
    port: 2049,
    service: "NFS",
    category: "nas",
    risk: "high",
    scoreImpact: -14,
    recommendation: "NFS nur in Servernetzen erlauben und nicht im Praxis-Clientnetz bereitstellen."
  },
  {
    port: 3306,
    service: "MySQL / MariaDB",
    category: "database",
    risk: "high",
    scoreImpact: -18,
    recommendation: "Datenbankzugriff per Firewall auf Applikationsserver beschränken, nicht für Praxis-Clients öffnen."
  },
  {
    port: 3389,
    service: "RDP / Remote Desktop",
    category: "remote_access",
    risk: "critical",
    scoreImpact: -25,
    recommendation: "RDP nur über VPN und mit Firewall-Regeln, MFA und NLA erlauben."
  },
  {
    port: 5432,
    service: "PostgreSQL",
    category: "database",
    risk: "high",
    scoreImpact: -18,
    recommendation: "PostgreSQL nicht direkt im Praxis-WLAN anbieten; Zugriff auf Server-zu-Server-Kommunikation begrenzen."
  },
  {
    port: 8080,
    service: "HTTP-Admininterface",
    category: "admin",
    risk: "medium",
    scoreImpact: -8,
    recommendation: "Adminoberflächen auf HTTPS umstellen und nur Administrationsgeräte zulassen."
  },
  {
    port: 9100,
    service: "JetDirect / RAW-Druck",
    category: "printer",
    risk: "medium",
    scoreImpact: -8,
    recommendation: "RAW-Druckport 9100 nur für autorisierte Druckserver oder Praxisgeräte erlauben."
  }
] as const satisfies readonly ServicePortDefinition[];

export const EXTENDED_TCP_PORTS = SERVICE_PORT_CATALOG.map((item) => item.port);

export const EXTENDED_HTTP_PORTS = [80, 443, 5000, 5001, 631, 8080, 8443] as const;

export function serviceForPort(port: number) {
  return SERVICE_PORT_CATALOG.find((item) => item.port === port);
}
