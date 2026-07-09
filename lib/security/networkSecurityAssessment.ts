import type {
  DeviceClassification,
  DhcpConsistencyAssessment,
  DnsResolverAssessment,
  GatewaySecurityProbeResult,
  HttpAdminProbeResult,
  Ipv6NetworkInfo,
  NetworkSecurityFinding,
  ProbeConfidence,
  SecuritySeverity,
  SecurityStatus,
  SmbSecurityProbeResult,
  TcpProbeResult,
  WifiSecurityDetails
} from "@/lib/security/networkProbeTypes";
import { assessDnsResolvers } from "@/lib/security/dnsAssessment";
import { dhcpConsistencyFinding } from "@/lib/security/dhcpConsistency";
import { assessIpv6 } from "@/lib/security/ipv6Assessment";
import { serviceForPort } from "@/lib/security/servicePortCatalog";

export function assessWifiSecurity(details: WifiSecurityDetails): NetworkSecurityFinding[] {
  return [wifiEncryptionFinding(details), wpsStatusFinding(), wpa3UpgradeFinding(details)];
}

export function assessGatewaySecurity(result: GatewaySecurityProbeResult): NetworkSecurityFinding[] {
  const classifications = result.deviceClassifications ?? [];
  return [
    routerHttpFinding(result.host, result.http),
    tcpServiceFinding(result.host, result.tcp, 23),
    smbFinding(result.host, result.tcp),
    smbSecurityFinding(result.host, result.tcp, result.smb),
    upnpFinding(result),
    tcpServiceFinding(result.host, result.tcp, 3389),
    databasePortsFinding(result.host, result.tcp),
    printerServicesFinding(result.host, result.tcp, result.http, classifications),
    nasServicesFinding(result.host, result.tcp, result.http, classifications),
    cameraIotFinding(result.host, result.ssdp.active === true, result.http, classifications),
    medicalDeviceMetadataFinding(classifications),
    assessIpv6(result.ipv6),
    ...assessDnsResolvers(result.dnsResolvers),
    dhcpConsistencyFinding(result.dhcpConsistency)
  ];
}

export function assessDeviceSecurity(input: {
  host: string;
  tcp: TcpProbeResult[];
  http: HttpAdminProbeResult[];
  classifications: DeviceClassification[];
  smb?: SmbSecurityProbeResult[];
}): NetworkSecurityFinding[] {
  return [
    databasePortsFinding(input.host, input.tcp),
    smbSecurityFinding(input.host, input.tcp, input.smb ?? []),
    printerServicesFinding(input.host, input.tcp, input.http, input.classifications),
    nasServicesFinding(input.host, input.tcp, input.http, input.classifications),
    cameraIotFinding(input.host, false, input.http, input.classifications),
    medicalDeviceMetadataFinding(input.classifications)
  ];
}

export function calculateSecurityFindingScore(findings: NetworkSecurityFinding[]) {
  const penalty = dedupeFindings(findings)
    .filter((finding) => finding.detected && finding.scoreImpact < 0)
    .reduce((sum, finding) => sum + Math.abs(finding.scoreImpact), 0);

  return penalty > 0 ? Math.max(0, Math.min(100, 100 - penalty)) : null;
}

export function networkContextFindings(input: {
  ipv6: Ipv6NetworkInfo;
  dnsResolvers: DnsResolverAssessment[];
  dhcpConsistency: DhcpConsistencyAssessment;
}) {
  return [assessIpv6(input.ipv6), ...assessDnsResolvers(input.dnsResolvers), dhcpConsistencyFinding(input.dhcpConsistency)];
}

function wifiEncryptionFinding(details: WifiSecurityDetails): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const protocolLabel = details.authMode === "mixed" ? `${details.protocol} Mixed Mode` : details.protocol;

  if (details.protocol === "OPEN") {
    return finding({
      id: "wifi_encryption_open",
      checkId: "wifi_encryption",
      title: "Offenes WLAN ohne Passwort",
      severity: "critical",
      status: "critical",
      detected: true,
      confidence: details.confidence,
      details: "Das WLAN ist ohne Passwort erreichbar. Personen in Funkreichweite könnten dem Praxisnetz beitreten.",
      recommendation: "Aktivieren Sie WPA3 oder mindestens WPA2-AES und vergeben Sie ein starkes WLAN-Passwort.",
      scoreImpact: -35,
      complianceImpact: "urgent_action",
      source: details.source,
      protocol: details.protocol,
      raw: { authMode: details.authMode, capabilities: details.capabilities ?? null },
      measuredAt
    });
  }

  if (details.protocol === "WEP") {
    return finding({
      id: "wifi_encryption_wep",
      checkId: "wifi_encryption",
      title: "WEP-Verschlüsselung aktiv",
      severity: "critical",
      status: "critical",
      detected: true,
      confidence: details.confidence,
      details: "WEP ist veraltet und kann mit frei verfügbaren Werkzeugen sehr schnell gebrochen werden.",
      recommendation: "WEP sofort deaktivieren und WPA3 oder mindestens WPA2-AES aktivieren.",
      scoreImpact: -35,
      complianceImpact: "urgent_action",
      source: details.source,
      protocol: details.protocol,
      raw: { authMode: details.authMode, capabilities: details.capabilities ?? null },
      measuredAt
    });
  }

  if (details.protocol === "WPA") {
    return finding({
      id: "wifi_encryption_wpa",
      checkId: "wifi_encryption",
      title: "Veraltetes WPA erkannt",
      severity: "high",
      status: "critical",
      detected: true,
      confidence: details.confidence,
      details: "WPA/TKIP ist nicht mehr Stand der Technik und sollte in Praxisnetzen nicht verwendet werden.",
      recommendation: "Stellen Sie im Router auf WPA3 oder mindestens WPA2-AES um. Mixed Mode mit altem WPA vermeiden.",
      scoreImpact: -25,
      complianceImpact: "urgent_action",
      source: details.source,
      protocol: details.protocol,
      raw: { authMode: details.authMode, capabilities: details.capabilities ?? null },
      measuredAt
    });
  }

  if (details.protocol === "UNKNOWN") {
    return finding({
      id: "wifi_encryption_unknown",
      checkId: "wifi_encryption",
      title: "WLAN-Verschlüsselung nicht auslesbar",
      severity: "low",
      status: "unknown",
      detected: false,
      confidence: "low",
      details: "Das Betriebssystem hat keine zuverlässigen Informationen zur WLAN-Verschlüsselung bereitgestellt.",
      recommendation: "Prüfen Sie im Router, ob WPA3 oder mindestens WPA2-AES aktiv ist.",
      scoreImpact: 0,
      complianceImpact: "documentation",
      source: details.source,
      protocol: details.protocol,
      raw: { authMode: details.authMode, capabilities: details.capabilities ?? null },
      measuredAt
    });
  }

  return finding({
    id: "wifi_encryption_secure",
    checkId: "wifi_encryption",
    title: `WLAN-Verschlüsselung: ${protocolLabel}`,
    severity: "low",
    status: "secure",
    detected: false,
    confidence: details.confidence,
    details:
      details.protocol === "WPA3"
        ? "Das WLAN nutzt WPA3. Das ist der aktuelle empfohlene Sicherheitsstandard."
        : "Das WLAN nutzt WPA2. WPA2 ist weiterhin sicher, sofern AES/CCMP und ein starkes Passwort verwendet werden.",
    recommendation:
      details.protocol === "WPA3"
        ? "Beibehalten und regelmäßig Router-Firmware aktualisieren."
        : "WPA2-AES beibehalten oder auf WPA3 umstellen, sobald alle Praxisgeräte kompatibel sind.",
    scoreImpact: 0,
    complianceImpact: "none",
    source: details.source,
    protocol: details.protocol,
    raw: { authMode: details.authMode, capabilities: details.capabilities ?? null },
    measuredAt
  });
}

function wpa3UpgradeFinding(details: WifiSecurityDetails): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();

  if (details.protocol === "WPA2") {
    return finding({
      id: details.supportsWpa3 ? "wpa3_upgrade_available" : "wpa3_upgrade_recommended",
      checkId: "wpa3_upgrade",
      title: details.supportsWpa3 ? "WPA3 wahrscheinlich verfügbar" : "WPA3 prüfen",
      severity: "low",
      status: "warning",
      detected: true,
      confidence: details.supportsWpa3 ? "medium" : details.confidence,
      details:
        "WPA2 ist weiterhin sicher, sofern aktuelle Verschlüsselungsverfahren verwendet werden. Falls Ihr Router WPA3 unterstützt, sollte WPA3 aktiviert werden.",
      recommendation:
        "Prüfen Sie im Router-Menü, ob WPA3-Personal oder WPA2/WPA3 Mixed Mode verfügbar ist. Aktivieren Sie WPA3, wenn alle Praxisgeräte kompatibel sind.",
      scoreImpact: -3,
      complianceImpact: "documentation",
      source: details.source,
      protocol: details.protocol,
      raw: { authMode: details.authMode, supportsWpa3: details.supportsWpa3, capabilities: details.capabilities ?? null },
      measuredAt
    });
  }

  return finding({
    id: details.protocol === "WPA3" ? "wpa3_active" : "wpa3_not_assessed",
    checkId: "wpa3_upgrade",
    title: details.protocol === "WPA3" ? "WPA3 aktiv" : "WPA3-Empfehlung nicht anwendbar",
    severity: "low",
    status: details.protocol === "WPA3" ? "secure" : "unknown",
    detected: false,
    confidence: details.confidence,
    details:
      details.protocol === "WPA3"
        ? "Der aktuelle WLAN-Standard WPA3 ist aktiv."
        : "Eine WPA3-Empfehlung ist nur sinnvoll bewertbar, wenn WPA2 zuverlässig erkannt wurde.",
    recommendation:
      details.protocol === "WPA3"
        ? "WPA3 beibehalten und Router-Firmware aktuell halten."
        : "Prüfen Sie die WLAN-Einstellungen im Router gemeinsam mit dem IT-Dienstleister.",
    scoreImpact: 0,
    complianceImpact: "none",
    source: details.source,
    protocol: details.protocol,
    raw: { authMode: details.authMode, supportsWpa3: details.supportsWpa3, capabilities: details.capabilities ?? null },
    measuredAt
  });
}

function wpsStatusFinding(): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();

  return finding({
    id: "wps_status_not_checked",
    checkId: "wps_status",
    title: "WPS-Status nicht geprüft",
    severity: "low",
    status: "not_supported",
    detected: false,
    confidence: "low",
    details: "Der WPS-Status wird nicht als technisches Ergebnis bewertet, weil er auf dieser Plattform nicht zuverlässig ausgelesen werden kann.",
    recommendation: "Prüfen Sie WPS manuell im Router-Menü und deaktivieren Sie WPS, sofern es nicht zwingend benötigt wird.",
    scoreImpact: 0,
    complianceImpact: "documentation",
    source: "unavailable",
    raw: { reason: "wps_not_reliably_readable" },
    measuredAt
  });
}

function routerHttpFinding(host: string, probes: HttpAdminProbeResult[]): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const insecureOpen = probes.filter((probe) => (probe.port === 80 || probe.port === 8080) && probe.state === "open");
  const redirects = insecureOpen.every((probe) => probe.redirectsToHttps);

  if (insecureOpen.length === 0) {
    return finding({
      id: "router_http_secure",
      checkId: "router_http",
      title: "Router-HTTP nicht sichtbar",
      severity: "low",
      status: probes.some((probe) => probe.source === "measured") ? "secure" : "unknown",
      detected: false,
      confidence: "medium",
      details: "Auf Port 80 und 8080 wurde keine unverschlüsselte Routerverwaltung erkannt.",
      recommendation: "HTTPS für die Routerverwaltung beibehalten und Standardpasswörter vermeiden.",
      scoreImpact: 0,
      complianceImpact: "none",
      source: probes.length > 0 ? "measured" : "unavailable",
      host,
      ports: [80, 8080],
      measuredAt
    });
  }

  return finding({
    id: "router_http_open",
    checkId: "router_http",
    title: redirects ? "Router-HTTP leitet auf HTTPS um" : "Routerverwaltung über HTTP erreichbar",
    severity: redirects ? "low" : "medium",
    status: redirects ? "warning" : "critical",
    detected: true,
    confidence: "high",
    details: redirects
      ? "Die Routerverwaltung antwortet über HTTP, leitet aber wahrscheinlich auf HTTPS weiter."
      : "Die Routerverwaltung ist über unverschlüsseltes HTTP erreichbar. Zugangsdaten könnten im lokalen Netz mitgelesen werden.",
    recommendation: redirects
      ? "HTTP-Weiterleitung auf HTTPS beibehalten und prüfen, ob HTTP vollständig deaktiviert werden kann."
      : "Aktivieren Sie HTTPS für die Routerverwaltung oder erzwingen Sie eine Weiterleitung auf HTTPS.",
    scoreImpact: redirects ? -2 : -8 * insecureOpen.length,
    complianceImpact: "technical_measure",
    source: "measured",
    host,
    ports: insecureOpen.map((probe) => probe.port),
    raw: {
      httpsAvailable: probes.some((probe) => probe.port === 443 && probe.state === "open"),
      redirectsToHttps: redirects
    },
    measuredAt
  });
}

function smbFinding(host: string, probes: TcpProbeResult[]): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const openPorts = probes.filter((probe) => (probe.port === 139 || probe.port === 445) && probe.state === "open");
  const source = probes.some((probe) => probe.source === "measured") ? "measured" : "unavailable";

  if (openPorts.length === 0) {
    return finding({
      id: "smb_not_visible",
      checkId: "smb",
      title: "SMB-Dateifreigaben nicht sichtbar",
      severity: "low",
      status: source === "measured" ? "secure" : "unknown",
      detected: false,
      confidence: source === "measured" ? "medium" : "low",
      details: "Auf den geprüften SMB-Ports 445 und 139 wurde kein erreichbarer Dienst erkannt.",
      recommendation: "Dateifreigaben weiterhin per Firewall auf notwendige Praxisgeräte beschränken.",
      scoreImpact: 0,
      complianceImpact: "none",
      source,
      host,
      ports: [139, 445],
      contextQuestions: smbContextQuestions(),
      measuredAt
    });
  }

  return finding({
    id: "smb_open",
    checkId: "smb",
    title: "SMB/Windows-Dateifreigaben erreichbar",
    severity: openPorts.length > 1 ? "high" : "medium",
    status: "warning",
    detected: true,
    confidence: "high",
    details:
      "SMB-Ports sind erreichbar. Das kann auf Windows-Dateifreigaben, NAS-Systeme oder ältere NetBIOS-Dienste hinweisen.",
    recommendation:
      "SMBv1 deaktivieren, Freigaben mit Benutzerrechten absichern, Firewall-Regeln setzen und Gast-/Patientennetze vom Praxisnetz trennen.",
    scoreImpact: openPorts.length > 1 ? -18 : -10,
    complianceImpact: "technical_measure",
    source: "measured",
    host,
    ports: openPorts.map((probe) => probe.port),
    contextQuestions: smbContextQuestions(),
    measuredAt
  });
}

function smbSecurityFinding(host: string, tcp: TcpProbeResult[], smb: SmbSecurityProbeResult[]): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const smbPortOpen = tcp.some((probe) => probe.port === 445 && probe.state === "open");
  const probe = smb.find((item) => item.host === host);
  const unavailable = !probe || probe.source === "unavailable";

  if (!smbPortOpen && unavailable) {
    return finding({
      id: `smb_security_not_checked_${host}`,
      checkId: "smb_security",
      title: "SMB-Sicherheitsparameter nicht geprüft",
      severity: "low",
      status: "unknown",
      detected: false,
      confidence: "low",
      details: "SMB-Version, Signing und Gastzugriff konnten technisch nicht zuverlässig geprüft werden.",
      recommendation: "SMBv1 deaktivieren, SMB-Signing erzwingen, Gastzugriffe sperren und Freigaben mit Benutzerrechten absichern.",
      scoreImpact: 0,
      complianceImpact: "documentation",
      source: "unavailable",
      host,
      ports: [445],
      contextQuestions: smbContextQuestions(),
      raw: { privacyBoundary: "metadata_only_no_share_or_file_reads" },
      measuredAt
    });
  }

  const risks: string[] = [];
  let scoreImpact = 0;
  if (probe?.smb1Supported === true) {
    risks.push("SMBv1 wird unterstützt.");
    scoreImpact -= 18;
  }
  if (probe?.guestAccess === true) {
    risks.push("Gastzugriff ist möglich.");
    scoreImpact -= 16;
  }
  if (probe?.signingRequired === false) {
    risks.push("SMB-Signing ist nicht verpflichtend.");
    scoreImpact -= 8;
  } else if (probe?.signingEnabled === false) {
    risks.push("SMB-Signing ist nicht aktiv.");
    scoreImpact -= 10;
  }

  const measured = probe?.source === "measured";
  const unknownDetails = [probe?.smb1Supported, probe?.guestAccess, probe?.signingEnabled, probe?.signingRequired].some((value) => value === null || value === undefined);
  const hasRisk = risks.length > 0;

  return finding({
    id: hasRisk ? `smb_security_risk_${host}` : measured && !unknownDetails ? `smb_security_hardened_${host}` : `smb_security_partial_${host}`,
    checkId: "smb_security",
    title: hasRisk ? "SMB-Sicherheitsparameter prüfen" : measured && !unknownDetails ? "SMB-Sicherheitsparameter unauffällig" : "SMB-Sicherheitsparameter teilweise geprüft",
    severity: hasRisk && scoreImpact <= -18 ? "high" : hasRisk ? "medium" : "low",
    status: hasRisk ? "warning" : measured && !unknownDetails ? "secure" : "unknown",
    detected: hasRisk,
    confidence: measured ? probe.confidence : "low",
    details: hasRisk
      ? `${risks.join(" ")} Die Prüfung liest keine Freigaben oder Dateien und bewertet nur SMB-Metadaten.`
      : measured && !unknownDetails
        ? "SMBv1, Gastzugriff und Signing wurden datensparsam über SMB-Metadaten bewertet; es wurden keine Freigaben oder Dateien gelesen."
        : "SMB ist erreichbar, aber Version, Signing oder Gastzugriff konnten nur teilweise bewertet werden.",
    recommendation:
      "SMBv1 deaktivieren, Gastzugriff sperren, SMB-Signing erzwingen, Freigaben auf Benutzergruppen beschränken und SMB nur aus notwendigen Segmenten erlauben.",
    scoreImpact,
    complianceImpact: hasRisk ? "technical_measure" : measured && !unknownDetails ? "none" : "documentation",
    source: probe?.source ?? "unavailable",
    host,
    ports: [445],
    protocol: probe?.supportedDialects.length ? probe.supportedDialects.join("/") : undefined,
    contextQuestions: smbContextQuestions(),
    raw: {
      smb1Supported: probe?.smb1Supported ?? null,
      signingEnabled: probe?.signingEnabled ?? null,
      signingRequired: probe?.signingRequired ?? null,
      guestAccess: probe?.guestAccess ?? null,
      privacyBoundary: "metadata_only_no_share_or_file_reads"
    },
    measuredAt
  });
}

function upnpFinding(result: GatewaySecurityProbeResult): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();

  if (result.ssdp.active !== true) {
    return finding({
      id: "upnp_not_visible",
      checkId: "upnp_ssdp",
      title: "UPnP/SSDP nicht sichtbar",
      severity: "low",
      status: result.ssdp.active === false ? "secure" : "unknown",
      detected: false,
      confidence: result.ssdp.confidence,
      details: "Es wurde kein aktiver UPnP/SSDP-Dienst erkannt.",
      recommendation: "UPnP im Router deaktiviert lassen, sofern keine zwingende Anforderung besteht.",
      scoreImpact: 0,
      complianceImpact: "none",
      source: result.ssdp.source,
      host: result.host,
      ports: [1900],
      measuredAt
    });
  }

  return finding({
    id: "upnp_enabled",
    checkId: "upnp_ssdp",
    title: "UPnP/SSDP aktiv",
    severity: "medium",
    status: "warning",
    detected: true,
    confidence: result.ssdp.confidence,
    details: "UPnP kann Geräten erlauben, automatisch Portfreigaben im Router anzulegen.",
    recommendation: "UPnP sollte in Arztpraxen deaktiviert werden, sofern keine zwingende Anforderung besteht.",
    scoreImpact: -14,
    complianceImpact: "technical_measure",
    source: result.ssdp.source,
    host: result.host,
    ports: [1900],
    raw: { devices: result.ssdp.devices.length },
    measuredAt
  });
}

function databasePortsFinding(host: string, probes: TcpProbeResult[]): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const openPorts = probes.filter((probe) => (probe.port === 3306 || probe.port === 5432) && probe.state === "open");
  const source = probes.some((probe) => probe.source === "measured") ? "measured" : "unavailable";

  if (openPorts.length === 0) {
    return finding({
      id: `database_ports_not_visible_${host}`,
      checkId: "database_ports",
      title: "Datenbankports nicht sichtbar",
      severity: "low",
      status: source === "measured" ? "secure" : "unknown",
      detected: false,
      confidence: source === "measured" ? "medium" : "low",
      details: "MySQL/MariaDB Port 3306 und PostgreSQL Port 5432 waren auf diesem Gerät nicht erreichbar.",
      recommendation: "Datenbanken weiterhin nur für notwendige Server und nicht für allgemeine Praxisgeräte erreichbar machen.",
      scoreImpact: 0,
      complianceImpact: "none",
      source,
      host,
      ports: [3306, 5432],
      measuredAt
    });
  }

  return finding({
    id: `database_ports_open_${host}`,
    checkId: "database_ports",
    title: "Datenbankdienst im Praxisnetz erreichbar",
    severity: "high",
    status: "critical",
    detected: true,
    confidence: "high",
    details: `Auf ${host} sind Datenbankports erreichbar: ${openPorts.map((probe) => probe.port).join(", ")}. Es wurden keine Login-Versuche oder Datenbankabfragen durchgeführt.`,
    recommendation: "Datenbankports per Firewall auf Applikationsserver beschränken, nicht im allgemeinen Praxis-WLAN bereitstellen.",
    scoreImpact: -18 * openPorts.length,
    complianceImpact: "urgent_action",
    source: "measured",
    host,
    ports: openPorts.map((probe) => probe.port),
    contextQuestions: nasContextQuestions(),
    measuredAt
  });
}

function printerServicesFinding(
  host: string,
  probes: TcpProbeResult[],
  http: HttpAdminProbeResult[],
  classifications: DeviceClassification[]
): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const openPrinterPorts = probes.filter((probe) => (probe.port === 631 || probe.port === 9100) && probe.state === "open");
  const hasPrinterClass = classifications.some((item) => item.host === host && item.deviceClass === "printer");
  const hasHttp = http.some((probe) => probe.state === "open");
  const detected = openPrinterPorts.length > 0 || hasPrinterClass;

  return finding({
    id: detected ? `printer_services_visible_${host}` : `printer_services_not_visible_${host}`,
    checkId: "printer_services",
    title: detected ? "Netzwerkdrucker oder Druckdienst sichtbar" : "Druckdienste nicht sichtbar",
    severity: openPrinterPorts.some((probe) => probe.port === 9100) ? "medium" : "low",
    status: detected ? "warning" : "secure",
    detected,
    confidence: openPrinterPorts.length > 0 ? "high" : hasPrinterClass ? "medium" : "low",
    details: detected
      ? `Drucker-Metadaten oder Druckports wurden erkannt${openPrinterPorts.length > 0 ? `: ${openPrinterPorts.map((probe) => probe.port).join(", ")}` : ""}. Es wurden keine Druckjobs, Warteschlangen oder Dateien gelesen.`
      : "Auf den geprüften Druckerports wurde kein Dienst erkannt.",
    recommendation: detected
      ? "Drucker in ein separates Geräte-Netz verschieben, Adminpasswort setzen, Firmware aktualisieren und Port 9100 nur bei Bedarf erlauben."
      : "Drucker weiter segmentiert betreiben und Webinterfaces nur für Administration freigeben.",
    scoreImpact: openPrinterPorts.some((probe) => probe.port === 9100) ? -8 : detected || hasHttp ? -4 : 0,
    complianceImpact: detected ? "technical_measure" : "none",
    source: openPrinterPorts.length > 0 || hasHttp ? "measured" : hasPrinterClass ? "inferred" : "unavailable",
    host,
    ports: openPrinterPorts.map((probe) => probe.port),
    raw: { httpInterface: hasHttp },
    measuredAt
  });
}

function nasServicesFinding(
  host: string,
  probes: TcpProbeResult[],
  http: HttpAdminProbeResult[],
  classifications: DeviceClassification[]
): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const openPorts = probes.filter((probe) => [139, 445, 548, 2049].includes(probe.port) && probe.state === "open");
  const hasNasClass = classifications.some((item) => item.host === host && item.deviceClass === "nas");

  return finding({
    id: openPorts.length > 0 || hasNasClass ? `nas_services_visible_${host}` : `nas_services_not_visible_${host}`,
    checkId: "nas_services",
    title: openPorts.length > 0 || hasNasClass ? "NAS oder Dateidienst sichtbar" : "NAS-Dateidienste nicht sichtbar",
    severity: openPorts.some((probe) => probe.port === 2049 || probe.port === 445) ? "high" : "low",
    status: openPorts.length > 0 || hasNasClass ? "warning" : "secure",
    detected: openPorts.length > 0 || hasNasClass,
    confidence: openPorts.length > 0 ? "high" : hasNasClass ? "medium" : "low",
    details:
      openPorts.length > 0
        ? `Dateidienst-Ports sind erreichbar: ${openPorts.map((probe) => probe.port).join(", ")}. Es wurden keine Freigaben geöffnet oder Dateien gelesen.`
        : hasNasClass
          ? "Ein Gerät wirkt anhand technischer Metadaten wie ein NAS oder Dateiserver."
          : "Auf den geprüften NAS-/Dateidienst-Ports wurde kein Dienst erkannt.",
    recommendation:
      openPorts.length > 0 || hasNasClass
        ? "Dateiserver in ein geschütztes Serversegment legen, SMBv1 deaktivieren, NFS/AFP nur bei Bedarf erlauben und Rechte regelmäßig prüfen."
        : "Dateidienste weiterhin auf notwendige Geräte begrenzen.",
    scoreImpact: openPorts.some((probe) => probe.port === 2049) ? -14 : openPorts.some((probe) => probe.port === 548) ? -8 : hasNasClass ? -4 : 0,
    complianceImpact: openPorts.length > 0 || hasNasClass ? "technical_measure" : "none",
    source: openPorts.length > 0 || http.some((probe) => probe.state === "open") ? "measured" : hasNasClass ? "inferred" : "unavailable",
    host,
    ports: openPorts.map((probe) => probe.port),
    measuredAt
  });
}

function cameraIotFinding(
  host: string,
  ssdpActive: boolean,
  http: HttpAdminProbeResult[],
  classifications: DeviceClassification[]
): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const iotClass = classifications.find((item) => item.host === host && item.deviceClass === "camera_iot");
  const httpOpen = http.some((probe) => probe.state === "open");
  const detected = Boolean(iotClass) || ssdpActive;

  return finding({
    id: detected ? `camera_iot_visible_${host}` : `camera_iot_not_visible_${host}`,
    checkId: "camera_iot",
    title: detected ? "Kamera-/IoT-Gerät wahrscheinlich" : "Kamera-/IoT-Hinweise nicht sichtbar",
    severity: detected && httpOpen ? "medium" : "low",
    status: detected ? "warning" : "secure",
    detected,
    confidence: iotClass?.confidence ?? (ssdpActive ? "medium" : "low"),
    details: detected
      ? "Ein Gerät wirkt anhand von UPnP/SSDP, mDNS, HTTP oder Herstellerhinweisen wie Kamera/IoT. Es wurden keine Streams oder Inhalte geöffnet."
      : "Keine eindeutigen Kamera-/IoT-Metadaten erkannt.",
    recommendation: detected
      ? "Kameras und IoT-Geräte in ein separates VLAN legen, Defaultpasswörter ändern, UPnP deaktivieren und Firmware aktuell halten."
      : "IoT-Geräte weiterhin getrennt vom Praxis-Clientnetz betreiben.",
    scoreImpact: detected && httpOpen ? -8 : detected ? -6 : 0,
    complianceImpact: detected ? "technical_measure" : "none",
    source: ssdpActive || httpOpen ? "measured" : iotClass ? "inferred" : "unavailable",
    host,
    raw: { httpInterface: httpOpen },
    measuredAt
  });
}

function medicalDeviceMetadataFinding(classifications: DeviceClassification[]): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const medicalDevices = classifications.filter((item) => item.deviceClass === "medical_device");

  return finding({
    id: medicalDevices.length > 0 ? "medical_device_metadata_hint" : "medical_device_metadata_not_visible",
    checkId: "medical_device_metadata",
    title: medicalDevices.length > 0 ? "Medizinisches Gerät vorsichtig vermutet" : "Keine medizinischen Geräte-Metadaten erkannt",
    severity: "low",
    status: medicalDevices.length > 0 ? "warning" : "secure",
    detected: medicalDevices.length > 0,
    confidence: medicalDevices.length > 0 ? "low" : "low",
    details:
      medicalDevices.length > 0
        ? "Eine Geräteklasse wurde nur aus technischen Metadaten vorsichtig abgeleitet. Es wurden keine Patientendaten und keine medizinischen Protokollinhalte gelesen."
        : "Keine technischen Hinweise auf medizinische Geräte erkannt.",
    recommendation:
      medicalDevices.length > 0
        ? "Geräteklasse durch IT-Dienstleister prüfen lassen und medizinische Geräte in ein geschütztes Segment legen."
        : "Medizinische Geräte weiterhin dokumentieren und segmentieren.",
    scoreImpact: 0,
    complianceImpact: medicalDevices.length > 0 ? "documentation" : "none",
    source: medicalDevices.length > 0 ? "inferred" : "unavailable",
    raw: { deviceCount: medicalDevices.length },
    measuredAt
  });
}

function tcpServiceFinding(host: string, probes: TcpProbeResult[], port: 23 | 3389): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const probe = probes.find((item) => item.port === port);
  const isOpen = probe?.state === "open";
  const service = port === 23 ? "Telnet" : "RDP";
  const checkId = port === 23 ? "telnet" : "rdp";

  if (!isOpen) {
    return finding({
      id: `${checkId}_not_visible`,
      checkId,
      title: `${service} nicht sichtbar`,
      severity: "low",
      status: probe?.source === "measured" ? "secure" : "unknown",
      detected: false,
      confidence: probe?.source === "measured" ? "medium" : "low",
      details: `Port ${port} war im lokalen Scan nicht erreichbar.`,
      recommendation:
        port === 23
          ? "Telnet deaktiviert lassen und für Administration nur verschlüsselte Verfahren verwenden."
          : "RDP nur über VPN und mit Firewall-Beschränkung auf Administrationsgeräte erlauben.",
      scoreImpact: 0,
      complianceImpact: "none",
      source: probe?.source ?? "unavailable",
      host,
      ports: [port],
      measuredAt
    });
  }

  return finding({
    id: port === 23 ? "telnet_open" : "rdp_open",
    checkId,
    title: port === 23 ? "Telnet-Port offen" : "RDP-Port erreichbar",
    severity: "critical",
    status: "critical",
    detected: true,
    confidence: "high",
    details:
      port === 23
        ? "Telnet überträgt Anmeldedaten und Befehle unverschlüsselt. Angreifer im lokalen Netz könnten Zugangsdaten mitlesen."
        : "RDP sollte nicht direkt im Praxisnetz für beliebige Geräte erreichbar sein und niemals ohne VPN/Firewall-Schutz bereitstehen.",
    recommendation:
      port === 23
        ? "Telnet sofort deaktivieren. Falls Fernadministration nötig ist, SSH mit starker Authentifizierung verwenden."
        : "RDP hinter VPN betreiben, Firewall-Regeln auf Administrationsgeräte beschränken und MFA/NLA aktivieren.",
    scoreImpact: -25,
    complianceImpact: "urgent_action",
    source: "measured",
    host,
    ports: [port],
    measuredAt
  });
}

function finding(input: {
  id: string;
  checkId: NetworkSecurityFinding["checkId"];
  title: string;
  severity: SecuritySeverity;
  status: SecurityStatus;
  detected: boolean;
  confidence: ProbeConfidence;
  details: string;
  recommendation: string;
  scoreImpact: number;
  complianceImpact: NetworkSecurityFinding["complianceImpact"];
  source: NetworkSecurityFinding["evidence"]["source"];
  host?: string;
  ports?: number[];
  protocol?: string;
  contextQuestions?: string[];
  raw?: Record<string, string | number | boolean | null>;
  measuredAt: string;
}): NetworkSecurityFinding {
  return {
    id: input.id,
    checkId: input.checkId,
    title: input.title,
    severity: input.severity,
    status: input.status,
    detected: input.detected,
    confidence: input.confidence,
    details: input.details,
    recommendation: input.recommendation,
    contextQuestions: buildContextQuestions(input.detected, input.ports, input.contextQuestions),
    scoreImpact: input.scoreImpact,
    complianceImpact: input.complianceImpact,
    evidence: {
      source: input.source,
      host: input.host,
      ports: input.ports,
      protocol: input.protocol,
      raw: input.raw,
      measuredAt: input.measuredAt
    }
  };
}

function buildContextQuestions(detected: boolean, ports?: number[], additional: string[] = []) {
  const questions = [...additional];
  if (!detected || !ports || ports.length === 0) return questions.length > 0 ? Array.from(new Set(questions)) : undefined;

  questions.push(...ports.flatMap((port) => {
    const service = serviceForPort(port)?.service ?? `TCP ${port}`;
    return [
      `Ist ${service} auf Port ${port} absichtlich aus dem Praxisnetz erreichbar?`,
      `Auf welche Quellgeräte oder Quell-IP-Adressen sollte Port ${port} beschränkt sein?`
    ];
  }));

  return Array.from(new Set(questions));
}

function smbContextQuestions() {
  return [
    "Ist SMBv1 auf diesem System vollständig deaktiviert?",
    "Ist Gastzugriff auf SMB-Freigaben deaktiviert?",
    "Welche Benutzergruppen dürfen auf die Freigaben zugreifen?",
    "Aus welchen Netzsegmenten darf SMB erreichbar sein?",
    "Welchem fachlichen Zweck dienen die Freigaben und wer ist verantwortlich?"
  ];
}

function nasContextQuestions() {
  return [
    "Welche Freigaben sind auf dem NAS fachlich erforderlich?",
    "Sind Gastzugriff und anonyme Freigaben deaktiviert?",
    "Sind Benutzerrechte rollenbasiert vergeben und regelmäßig geprüft?",
    "Ist das NAS vom Gäste-WLAN, Druckernetz und Medizingerätenetz getrennt?",
    "Wer ist für Pflege, Updates und Rechteprüfung der Freigaben verantwortlich?"
  ];
}

function dedupeFindings(findings: NetworkSecurityFinding[]) {
  return Array.from(new Map(findings.map((finding) => [finding.id, finding])).values());
}
