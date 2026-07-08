import { classifyDevice } from "@/lib/security/deviceClassification";
import { classifyDnsResolvers } from "@/lib/security/dnsAssessment";
import { assessDhcpConsistencyInput } from "@/lib/security/dhcpConsistency";
import { assessFirewallBaseline } from "@/lib/security/firewallBaseline";
import { assessGuestNetwork } from "@/lib/security/guestNetworkAssessment";
import { buildIpv6NetworkInfo } from "@/lib/security/ipv6Assessment";
import { assessGatewaySecurity, assessWifiSecurity, calculateSecurityFindingScore } from "@/lib/security/networkSecurityAssessment";
import { assessRogueAccessPoints } from "@/lib/security/rogueApAssessment";
import { assessRogueDevices } from "@/lib/security/rogueDeviceAssessment";
import { fingerprintRouter } from "@/lib/security/routerFingerprint";
import { assessNetworkSegmentation } from "@/lib/security/segmentationAssessment";
import type { GatewaySecurityProbeResult } from "@/lib/security/networkProbeTypes";
import { parseWifiCapabilities } from "@/lib/security/wifiCapabilities";

describe("wifi capability parsing", () => {
  it("erkennt offene WLANs", () => {
    const details = parseWifiCapabilities("[ESS]");
    expect(details.protocol).toBe("OPEN");
    expect(details.authMode).toBe("open");
  });

  it("erkennt WPA2 Personal", () => {
    const details = parseWifiCapabilities("[WPA2-PSK-CCMP][RSN-PSK-CCMP][ESS]");
    expect(details.protocol).toBe("WPA2");
    expect(details.authMode).toBe("wpa2_personal");
    expect(details.isPersonal).toBe(true);
  });

  it("erkennt WPA2 Enterprise", () => {
    const details = parseWifiCapabilities("[WPA2-EAP-CCMP][RSN-EAP-CCMP][ESS]");
    expect(details.protocol).toBe("WPA2");
    expect(details.authMode).toBe("wpa2_enterprise");
    expect(details.isEnterprise).toBe(true);
  });

  it("erkennt WPA3 Personal und Mixed Mode", () => {
    const details = parseWifiCapabilities("[WPA2-PSK-CCMP][RSN-PSK+SAE-CCMP][ESS]");
    expect(details.protocol).toBe("WPA3");
    expect(details.authMode).toBe("mixed");
    expect(details.isMixedMode).toBe(true);
    expect(details.supportsWpa3).toBe(true);
  });
});

describe("network security assessment", () => {
  it("erzeugt eine WPA3-Empfehlung für WPA2", () => {
    const details = parseWifiCapabilities("[WPA2-PSK-CCMP][ESS]");
    const findings = assessWifiSecurity(details);
    expect(findings.some((finding) => finding.checkId === "wpa3_upgrade" && finding.detected)).toBe(true);
  });

  it("bewertet Telnet und RDP als kritisch", () => {
    const findings = assessGatewaySecurity(gatewayProbe([23, 3389]));
    expect(findings.find((finding) => finding.checkId === "telnet")?.severity).toBe("critical");
    expect(findings.find((finding) => finding.checkId === "rdp")?.severity).toBe("critical");
  });

  it("nutzt explizite Score-Impacts für den WLAN-Risikoscore", () => {
    const findings = assessGatewaySecurity(gatewayProbe([23, 445]));
    expect(calculateSecurityFindingScore(findings)).toBe(65);
  });

  it("bewertet offene Datenbankports als hohes Risiko", () => {
    const findings = assessGatewaySecurity(gatewayProbe([3306, 5432]));
    const database = findings.find((finding) => finding.checkId === "database_ports");
    expect(database?.detected).toBe(true);
    expect(database?.severity).toBe("high");
  });

  it("klassifiziert Drucker aus JetDirect-Port ohne Inhalte zu lesen", () => {
    const classification = classifyDevice({
      host: "192.168.1.50",
      http: [],
      tcp: [{ host: "192.168.1.50", port: 9100, state: "open", source: "measured" }]
    });
    expect(classification.deviceClass).toBe("printer");
  });

  it("erkennt globale IPv6-Adressen als bewertungsrelevant", () => {
    const info = buildIpv6NetworkInfo(["2001:db8::10", "fe80::1"], ["2001:4860:4860::8888"]);
    expect(info.enabled).toBe(true);
    expect(info.globalAddresses).toHaveLength(1);
  });

  it("klassifiziert Schutz-DNS", () => {
    const resolvers = classifyDnsResolvers(["9.9.9.9"], "192.168.1.1");
    expect(resolvers[0].resolverClass).toBe("security_dns");
  });

  it("warnt bei Gateway außerhalb des Subnetzes", () => {
    const assessment = assessDhcpConsistencyInput({
      ipAddress: "192.168.10.20",
      subnetMask: "255.255.255.0",
      gatewayIp: "192.168.11.1",
      dnsServers: ["192.168.10.1"]
    });
    expect(assessment.status).toBe("critical");
  });

  it("erkennt Gastnetz-Heuristik aus SSID und Isolation", () => {
    const assessment = assessGuestNetwork({
      ssid: "Praxis-Gast",
      gatewayReachable: true,
      visibleDeviceCount: 1,
      classifications: []
    });
    expect(assessment.status).toBe("present");
  });

  it("bewertet schwache Segmentierung bei Server und IoT im gleichen sichtbaren Netz", () => {
    const assessment = assessNetworkSegmentation({
      guestNetworkStatus: "not_present",
      visibleDeviceCount: 4,
      classifications: [
        { host: "192.168.1.10", deviceClass: "nas", confidence: "high", signals: ["tcp:445"], privacyBoundary: "metadata only" },
        { host: "192.168.1.40", deviceClass: "camera_iot", confidence: "medium", signals: ["upnp"], privacyBoundary: "metadata only" }
      ]
    });
    expect(assessment.status).toBe("weak");
  });

  it("findet Rogue-AP-Hinweise bei gleicher SSID mit abweichender Verschlüsselung", () => {
    const assessment = assessRogueAccessPoints({
      currentSsid: "Praxis",
      visibleNetworks: [
        { ssid: "Praxis", bssid: "00:11:22:33:44:55", capabilities: "[WPA2-PSK-CCMP][ESS]", level: -60 },
        { ssid: "Praxis", bssid: "66:77:88:99:AA:BB", capabilities: "[ESS]", level: -30 }
      ]
    });
    expect(assessment.status).toBe("suspicious");
  });

  it("markiert unbekannte Geräte mit kritischen Ports als verdächtig", () => {
    const assessment = assessRogueDevices(
      [{ ipAddress: "192.168.1.99", deviceType: "unknown", openPorts: [{ port: 3389, state: "open", risk: "critical" }] }],
      []
    );
    expect(assessment.status).toBe("suspicious");
  });

  it("fingerprinted Router aus Header-Signalen", () => {
    const fingerprint = fingerprintRouter({
      http: [{ host: "192.168.1.1", port: 80, state: "open", redirectsToHttps: false, httpsAvailable: false, serverHeader: "FRITZ!Box", source: "measured" }]
    });
    expect(fingerprint.vendor).toBe("AVM FRITZ!Box");
  });

  it("bewertet Firewall kritisch bei RDP", () => {
    const assessment = assessFirewallBaseline(gatewayProbe([3389]));
    expect(assessment.status).toBe("critical");
  });
});

function gatewayProbe(openPorts: number[]): GatewaySecurityProbeResult {
  return {
    host: "192.168.1.1",
    http: [
      {
        host: "192.168.1.1",
        port: 80,
        state: "closed",
        redirectsToHttps: false,
        httpsAvailable: false,
        source: "measured"
      },
      {
        host: "192.168.1.1",
        port: 443,
        state: "open",
        redirectsToHttps: false,
        httpsAvailable: true,
        source: "measured"
      },
      {
        host: "192.168.1.1",
        port: 8080,
        state: "closed",
        redirectsToHttps: false,
        httpsAvailable: false,
        source: "measured"
      }
    ],
    tcp: [23, 139, 445, 548, 631, 2049, 3306, 3389, 5432, 9100].map((port) => ({
      host: "192.168.1.1",
      port,
      state: openPorts.includes(port) ? "open" : "closed",
      source: "measured"
    })),
    ssdp: {
      active: false,
      source: "measured",
      confidence: "medium",
      devices: []
    },
    mdns: [],
    snmp: [],
    deviceClassifications: [],
    ipv6: {
      enabled: false,
      globalAddresses: [],
      uniqueLocalAddresses: [],
      linkLocalAddresses: [],
      dnsServers: [],
      gatewayVisible: null,
      source: "unavailable",
      confidence: "low"
    },
    dnsResolvers: [],
    dhcpConsistency: {
      status: "consistent",
      issues: [],
      source: "inferred",
      confidence: "medium"
    }
  };
}
