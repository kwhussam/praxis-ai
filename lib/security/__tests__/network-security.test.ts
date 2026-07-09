import { classifyDevice } from "@/lib/security/deviceClassification";
import { assessDnsFilterTests, assessDnsOperation, classifyDnsResolvers } from "@/lib/security/dnsAssessment";
import { assessDhcpConsistencyInput } from "@/lib/security/dhcpConsistency";
import { assessFirewallBaseline } from "@/lib/security/firewallBaseline";
import { assessGuestNetwork } from "@/lib/security/guestNetworkAssessment";
import { assessIpv6, buildIpv6NetworkInfo, ipv6ReachabilityFinding } from "@/lib/security/ipv6Assessment";
import { assessGatewaySecurity, assessWifiSecurity, calculateSecurityFindingScore } from "@/lib/security/networkSecurityAssessment";
import { assessRogueAccessPoints } from "@/lib/security/rogueApAssessment";
import { assessRogueDevices } from "@/lib/security/rogueDeviceAssessment";
import { fingerprintRouter } from "@/lib/security/routerFingerprint";
import { assessNetworkSegmentation, buildNetworkSegmentObservation, buildSegmentReachabilityTargets } from "@/lib/security/segmentationAssessment";
import type { GatewaySecurityProbeResult } from "@/lib/security/networkProbeTypes";
import { parseWifiCapabilities } from "@/lib/security/wifiCapabilities";
import { buildIpv4SubnetCandidates } from "@/lib/security/ipv4Subnet";

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

  it("kennzeichnet WPS als nicht geprüft ohne Score-Abzug", () => {
    const details = parseWifiCapabilities("[WPA2-PSK-CCMP][ESS]");
    const finding = assessWifiSecurity(details).find((item) => item.checkId === "wps_status");
    expect(finding?.status).toBe("not_supported");
    expect(finding?.evidence.source).toBe("unavailable");
    expect(finding?.scoreImpact).toBe(0);
  });

  it("bewertet Telnet und RDP als kritisch", () => {
    const findings = assessGatewaySecurity(gatewayProbe([23, 3389]));
    expect(findings.find((finding) => finding.checkId === "telnet")?.severity).toBe("critical");
    expect(findings.find((finding) => finding.checkId === "rdp")?.severity).toBe("critical");
  });

  it("ergänzt Kontextfragen für offene Portbefunde", () => {
    const findings = assessGatewaySecurity(gatewayProbe([445]));
    const smb = findings.find((finding) => finding.checkId === "smb");
    const questions = smb?.contextQuestions ?? [];
    expect(questions.some((question) => question.includes("Port 445"))).toBe(true);
    expect(questions.some((question) => question.includes("Quellgeräte"))).toBe(true);
    expect(questions.some((question) => question.includes("SMBv1"))).toBe(true);
    expect(questions.some((question) => question.includes("Gastzugriff"))).toBe(true);
  });

  it("bewertet SMBv1 und Guest Access ohne Dateizugriff als Risiko", () => {
    const findings = assessGatewaySecurity({
      ...gatewayProbe([445]),
      smb: [
        {
          host: "192.168.1.1",
          port: 445,
          state: "open",
          source: "measured",
          confidence: "high",
          supportedDialects: ["SMB1", "SMB2"],
          smb1Supported: true,
          signingEnabled: true,
          signingRequired: false,
          guestAccess: true
        }
      ]
    });
    const smbSecurity = findings.find((finding) => finding.checkId === "smb_security");
    expect(smbSecurity?.detected).toBe(true);
    expect(smbSecurity?.details.includes("keine Freigaben oder Dateien")).toBe(true);
    expect(smbSecurity?.evidence.raw?.guestAccess).toBe(true);
  });

  it("berechnet Kandidaten für den vollständigen IPv4-Subnetzscan", () => {
    const candidates = buildIpv4SubnetCandidates("192.168.10.20", "255.255.255.0", "192.168.10.1") ?? [];
    expect(candidates).toHaveLength(253);
    expect(candidates.includes("192.168.10.1")).toBe(true);
    expect(candidates.includes("192.168.10.254")).toBe(true);
    expect(candidates.includes("192.168.10.20")).toBe(false);
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

  it("wertet aktive IPv6-Nutzung ohne Regelabdeckung als Risiko", () => {
    const info = buildIpv6NetworkInfo(["fd00::10"], ["fd00::1"]);
    const finding = assessIpv6(info, {
      usedIntentionally: true,
      firewallRulesCovered: false,
      dnsRulesCovered: true
    });
    expect(finding.status).toBe("warning");
    expect(finding.evidence.raw?.firewallRulesCovered).toBe(false);
  });

  it("bewertet offene lokale IPv6-Ports als Erreichbarkeitsbefund", () => {
    const finding = ipv6ReachabilityFinding([
      {
        host: "fd00::10",
        port: 445,
        state: "open",
        source: "measured",
        confidence: "high"
      }
    ]);
    expect(finding.checkId).toBe("ipv6_reachability");
    expect(finding.detected).toBe(true);
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

  it("bewertet Gastnetz mit Benutzerangaben als wahrscheinlicher getrennt", () => {
    const assessment = assessGuestNetwork({
      ssid: "Praxis",
      gatewayReachable: true,
      visibleDeviceCount: 1,
      classifications: [],
      declaredGuestNetwork: true,
      declaredClientIsolation: true
    });
    expect(assessment.status).toBe("present");
    expect(assessment.confidence).toBe("high");
  });

  it("wertet erreichbare interne Ziele aus dem Gäste-WLAN als fehlende Isolation", () => {
    const assessment = assessGuestNetwork({
      ssid: "Praxis-Gast",
      gatewayReachable: true,
      visibleDeviceCount: 1,
      classifications: [],
      declaredGuestNetwork: true,
      declaredClientIsolation: true,
      segmentReachabilityTests: [
        {
          fromSegment: "guest_wifi",
          toSegment: "server_network",
          host: "192.168.20.10",
          port: 445,
          service: "SMB",
          reachable: true,
          source: "measured",
          confidence: "high"
        }
      ]
    });
    expect(assessment.status).toBe("not_present");
    expect(assessment.confidence).toBe("high");
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

  it("aggregiert Segmentierungsbeobachtungen aus mehreren Netzen", () => {
    const observations = [
      buildNetworkSegmentObservation({
        segment: "guest_wifi",
        visibleDeviceCount: 3,
        classifications: [
          { host: "192.168.30.10", deviceClass: "nas", confidence: "high", signals: ["tcp:445"], privacyBoundary: "metadata only" }
        ],
        exposedServices: ["192.168.30.10:445"],
        observedAt: new Date("2026-07-09T00:00:00.000Z")
      }),
      buildNetworkSegmentObservation({
        segment: "server_network",
        visibleDeviceCount: 2,
        classifications: [
          { host: "192.168.20.40", deviceClass: "camera_iot", confidence: "medium", signals: ["upnp"], privacyBoundary: "metadata only" }
        ],
        exposedServices: [],
        observedAt: new Date("2026-07-09T00:01:00.000Z")
      })
    ];
    const assessment = assessNetworkSegmentation({
      guestNetworkStatus: "present",
      visibleDeviceCount: 2,
      classifications: [],
      observations
    });
    expect(assessment.status).toBe("weak");
    expect(assessment.observedSegments?.length).toBe(2);
    expect(assessment.crossSegmentExposure?.length).toBeGreaterThan(0);
  });

  it("erzeugt gezielte Reachability-Ziele aus anderen Segmenten", () => {
    const targets = buildSegmentReachabilityTargets("guest_wifi", [
      {
        segment: "server_network",
        visibleDeviceCount: 1,
        deviceClasses: ["server"],
        exposedServices: ["192.168.20.10:445"],
        observedAt: "2026-07-09T00:00:00.000Z"
      }
    ]);
    expect(targets).toHaveLength(1);
    expect(targets[0].toSegment).toBe("server_network");
    expect(targets[0].port).toBe(445);
  });

  it("bewertet aufgelöste DNS-Testdomains als fehlenden DNS-Filter", () => {
    const finding = assessDnsFilterTests([
      {
        domain: "malware.testcategory.com",
        category: "malware",
        blocked: false,
        responseCode: "NOERROR",
        resolvedAddresses: ["203.0.113.10"],
        source: "measured",
        confidence: "high"
      },
      {
        domain: "phishing.testcategory.com",
        category: "phishing",
        blocked: true,
        responseCode: "NXDOMAIN",
        resolvedAddresses: [],
        source: "measured",
        confidence: "high"
      }
    ]);
    expect(finding.status).toBe("warning");
    expect(finding.evidence.raw?.allowedCount).toBe(1);
  });

  it("erfasst DNS-Betrieb als Selbstauskunft", () => {
    const finding = assessDnsOperation({
      resolverDocumented: true,
      filterEnabled: true,
      privacyReviewed: false,
      providerDocumented: true,
      configurationDocumented: true
    });
    expect(finding.status).toBe("warning");
    expect(finding.evidence.source).toBe("questionnaire");
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

  it("findet Rogue-AP-Hinweise bei unbekannter BSSID im AP-Inventar-Abgleich", () => {
    const assessment = assessRogueAccessPoints({
      currentSsid: "Praxis",
      visibleNetworks: [
        { ssid: "Praxis", bssid: "00:11:22:33:44:55", capabilities: "[WPA2-PSK-CCMP][ESS]", level: -60 },
        { ssid: "Praxis", bssid: "66:77:88:99:AA:BB", capabilities: "[WPA2-PSK-CCMP][ESS]", level: -70 }
      ],
      accessPoints: [
        {
          id: "ap-1",
          ssid: "Praxis",
          bssid: "00:11:22:33:44:55",
          location: "Empfang",
          vendor: "Ubiquiti",
          channel: "6",
          expectedEncryption: "WPA2_AES",
          createdAt: "2026-07-09T00:00:00.000Z",
          updatedAt: "2026-07-09T00:00:00.000Z"
        }
      ]
    });
    expect(assessment.status).toBe("suspicious");
    expect(assessment.confidence).toBe("high");
    expect(assessment.candidates.some((candidate) => candidate.reason.join(" ").includes("offiziellen Access-Point-Inventar"))).toBe(true);
  });

  it("markiert unbekannte Geräte mit kritischen Ports als verdächtig", () => {
    const assessment = assessRogueDevices(
      [{ ipAddress: "192.168.1.99", deviceType: "unknown", openPorts: [{ port: 3389, state: "open", risk: "critical" }] }],
      []
    );
    expect(assessment.status).toBe("suspicious");
  });

  it("gleicht Rogue Devices gegen die Known-Device-Liste ab", () => {
    const assessment = assessRogueDevices(
      [{ ipAddress: "192.168.1.20", hostname: "empfang-pc", macAddress: "aa-bb-cc-dd-ee-ff", deviceType: "workstation" }],
      [],
      [
        {
          id: "device-1",
          macAddress: "AA:BB:CC:DD:EE:FF",
          hostname: "empfang-pc",
          deviceType: "workstation",
          location: "Empfang",
          owner: "Praxis",
          criticality: "high",
          lastConfirmedAt: "2026-07-01T00:00:00.000Z",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z"
        }
      ]
    );

    expect(assessment.status).toBe("clean");
    expect(assessment.knownDevices).toBe(1);
    expect(assessment.confidence).toBe("high");
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
    smb: [],
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
    dnsFilterTests: [],
    dhcpConsistency: {
      status: "consistent",
      issues: [],
      source: "inferred",
      confidence: "medium"
    }
  };
}
