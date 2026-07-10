import type { CheckData } from "@/lib/security/scoring";

export type QuestionnaireAnswerKey =
  | "mfa"
  | "mfaEvidence"
  | "mfaEmail"
  | "mfaPracticeSoftware"
  | "mfaVpn"
  | "mfaCloudServices"
  | "mfaAdminAccounts"
  | "mfaRemoteMaintenance"
  | "backups"
  | "backupFrequencyDocumented"
  | "backupTargetDocumented"
  | "backupOfflineOrImmutable"
  | "backupOwnerDocumented"
  | "backupDocumented"
  | "restoreTested"
  | "lastRestoreTestDocumented"
  | "restoreTestEvidence"
  | "patching"
  | "patchScopeDocumented"
  | "patchFrequencyDefined"
  | "patchOwnerDocumented"
  | "lastPatchDateDocumented"
  | "patchExceptionsDocumented"
  | "patchingEvidence"
  | "privacyDocuments"
  | "avvAvailable"
  | "tomsAvailable"
  | "processingDirectoryAvailable"
  | "deletionConceptAvailable"
  | "accessConceptAvailable"
  | "privacyTrainingDocumented"
  | "privacyReviewEvidence"
  | "securityOwnerAssigned"
  | "responsibilityDocumented"
  | "networkStructureDocumented"
  | "vlanPracticeDevices"
  | "vlanGuests"
  | "vlanServers"
  | "vlanPrinters"
  | "vlanIot"
  | "vlanMedicalDevices"
  | "guestWifiClientIsolation"
  | "dnsResolverDocumented"
  | "dnsFilterEnabled"
  | "dnsPrivacyReviewed"
  | "dnsProviderDocumented"
  | "dnsConfigurationDocumented"
  | "dhcpAuthorizedServerDocumented"
  | "dhcpRouterIpDocumented"
  | "dhcpDnsServersDocumented"
  | "dhcpExceptionsDocumented"
  | "routerManufacturerDocumented"
  | "routerModelDocumented"
  | "routerFirmwareVersionDocumented"
  | "routerUpdateStatusDocumented"
  | "routerFirmwareCurrent"
  | "routerItProviderDocumented"
  | "routerAdminPasswordChanged"
  | "routerPasswordManagerUsed"
  | "routerMfaAvailable"
  | "routerRemoteAccessDisabled"
  | "routerUpnpDisabled"
  | "routerPortForwardsDocumented"
  | "ipv6UsedIntentionally"
  | "ipv6FirewallRulesCovered"
  | "ipv6DnsRulesCovered"
  | "staffTraining"
  | "dmarc";

export type QuestionnaireAnswers = Record<QuestionnaireAnswerKey, boolean>;

export type QuestionnaireQuestion = {
  key: QuestionnaireAnswerKey;
  label: string;
};

export type QuestionnaireSection = {
  title: string;
  questions: QuestionnaireQuestion[];
};

export const DEFAULT_QUESTIONNAIRE_ANSWERS: QuestionnaireAnswers = {
  mfa: false,
  mfaEvidence: false,
  mfaEmail: false,
  mfaPracticeSoftware: false,
  mfaVpn: false,
  mfaCloudServices: false,
  mfaAdminAccounts: false,
  mfaRemoteMaintenance: false,
  backups: true,
  backupFrequencyDocumented: false,
  backupTargetDocumented: false,
  backupOfflineOrImmutable: false,
  backupOwnerDocumented: false,
  backupDocumented: false,
  restoreTested: false,
  lastRestoreTestDocumented: false,
  restoreTestEvidence: false,
  patching: false,
  patchScopeDocumented: false,
  patchFrequencyDefined: false,
  patchOwnerDocumented: false,
  lastPatchDateDocumented: false,
  patchExceptionsDocumented: false,
  patchingEvidence: false,
  privacyDocuments: false,
  avvAvailable: false,
  tomsAvailable: false,
  processingDirectoryAvailable: false,
  deletionConceptAvailable: false,
  accessConceptAvailable: false,
  privacyTrainingDocumented: false,
  privacyReviewEvidence: false,
  securityOwnerAssigned: false,
  responsibilityDocumented: false,
  networkStructureDocumented: false,
  vlanPracticeDevices: false,
  vlanGuests: false,
  vlanServers: false,
  vlanPrinters: false,
  vlanIot: false,
  vlanMedicalDevices: false,
  guestWifiClientIsolation: false,
  dnsResolverDocumented: false,
  dnsFilterEnabled: false,
  dnsPrivacyReviewed: false,
  dnsProviderDocumented: false,
  dnsConfigurationDocumented: false,
  dhcpAuthorizedServerDocumented: false,
  dhcpRouterIpDocumented: false,
  dhcpDnsServersDocumented: false,
  dhcpExceptionsDocumented: false,
  routerManufacturerDocumented: false,
  routerModelDocumented: false,
  routerFirmwareVersionDocumented: false,
  routerUpdateStatusDocumented: false,
  routerFirmwareCurrent: false,
  routerItProviderDocumented: false,
  routerAdminPasswordChanged: false,
  routerPasswordManagerUsed: false,
  routerMfaAvailable: false,
  routerRemoteAccessDisabled: false,
  routerUpnpDisabled: false,
  routerPortForwardsDocumented: false,
  ipv6UsedIntentionally: false,
  ipv6FirewallRulesCovered: false,
  ipv6DnsRulesCovered: false,
  staffTraining: true,
  dmarc: false
};

export const QUESTIONNAIRE_SECTIONS: QuestionnaireSection[] = [
  {
    title: "MFA",
    questions: [
      { key: "mfa", label: "Ist MFA für alle kritischen Konten aktiviert?" },
      { key: "mfaEvidence", label: "Liegt ein MFA-Nachweis vor, z. B. Richtlinie, Screenshot oder Benutzerliste?" },
      { key: "mfaEmail", label: "Sind E-Mail-Konten durch MFA geschützt?" },
      { key: "mfaPracticeSoftware", label: "Ist die Praxissoftware durch MFA oder gleichwertige starke Anmeldung geschützt?" },
      { key: "mfaVpn", label: "Sind VPN-Zugänge durch MFA geschützt?" },
      { key: "mfaCloudServices", label: "Sind Cloud-Dienste durch MFA geschützt?" },
      { key: "mfaAdminAccounts", label: "Sind Admin-Konten durch MFA geschützt?" },
      { key: "mfaRemoteMaintenance", label: "Sind Fernwartungszugänge durch MFA geschützt?" }
    ]
  },
  {
    title: "Backups und Restore-Tests",
    questions: [
      { key: "backups", label: "Werden Praxisdaten täglich automatisiert gesichert?" },
      { key: "backupFrequencyDocumented", label: "Ist die Backup-Frequenz schriftlich festgelegt?" },
      { key: "backupTargetDocumented", label: "Ist das Backup-Ziel dokumentiert, z. B. NAS, Cloud, Band oder Rechenzentrum?" },
      { key: "backupOfflineOrImmutable", label: "Gibt es ein Offline- oder Immutable-Backup gegen Ransomware?" },
      { key: "backupOwnerDocumented", label: "Ist ein Verantwortlicher für Backup-Überwachung und Fehlerbehebung dokumentiert?" },
      { key: "backupDocumented", label: "Gibt es ein aktuelles Backup-Protokoll mit Speicherort und Aufbewahrung?" },
      { key: "restoreTested", label: "Wurde in den letzten 6 Monaten ein Restore-Test durchgeführt?" },
      { key: "lastRestoreTestDocumented", label: "Ist das Datum des letzten Restore-Tests dokumentiert?" },
      { key: "restoreTestEvidence", label: "Ist der Restore-Test mit Datum, Ergebnis und Verantwortlichem dokumentiert?" }
    ]
  },
  {
    title: "Patchmanagement",
    questions: [
      { key: "patching", label: "Gibt es einen festen Patchprozess für Server, Clients und Praxissoftware?" },
      { key: "patchScopeDocumented", label: "Ist der Systemumfang dokumentiert, z. B. Server, Clients, Router, Praxissoftware und Medizingeräte?" },
      { key: "patchFrequencyDefined", label: "Ist eine Patch-Frequenz festgelegt, z. B. monatlich oder nach Kritikalität?" },
      { key: "patchOwnerDocumented", label: "Ist ein Verantwortlicher für Patchmanagement benannt?" },
      { key: "lastPatchDateDocumented", label: "Ist das letzte Patchdatum je relevantem System dokumentiert?" },
      { key: "patchExceptionsDocumented", label: "Sind Patch-Ausnahmen mit Risiko, Begründung und Ablaufdatum dokumentiert?" },
      { key: "patchingEvidence", label: "Liegt ein Patch-/Update-Protokoll mit Datum und Status vor?" }
    ]
  },
  {
    title: "DSGVO-Dokumentation",
    questions: [
      { key: "privacyDocuments", label: "Sind AVV, TOMs, Verarbeitungsverzeichnis und Löschkonzept vorhanden?" },
      { key: "avvAvailable", label: "Liegen Auftragsverarbeitungsverträge (AVV) für relevante Dienstleister vor?" },
      { key: "tomsAvailable", label: "Sind technische und organisatorische Maßnahmen (TOMs) dokumentiert?" },
      { key: "processingDirectoryAvailable", label: "Gibt es ein aktuelles Verzeichnis von Verarbeitungstätigkeiten?" },
      { key: "deletionConceptAvailable", label: "Gibt es ein dokumentiertes Löschkonzept?" },
      { key: "accessConceptAvailable", label: "Gibt es ein Berechtigungs- und Rollen-Konzept für Praxisdaten?" },
      { key: "privacyTrainingDocumented", label: "Ist eine Datenschutzschulung für Mitarbeitende dokumentiert?" },
      { key: "privacyReviewEvidence", label: "Wurden die DSGVO-Dokumente in den letzten 12 Monaten geprüft und freigegeben?" }
    ]
  },
  {
    title: "Verantwortlichkeiten",
    questions: [
      { key: "securityOwnerAssigned", label: "Ist eine verantwortliche Person für IT-Sicherheit und Datenschutz benannt?" },
      { key: "responsibilityDocumented", label: "Sind Vertretung, Aufgaben und Eskalationswege schriftlich dokumentiert?" }
    ]
  },
  {
    title: "Netzstruktur",
    questions: [
      { key: "networkStructureDocumented", label: "Ist dokumentiert, welche VLANs oder getrennten WLANs für Praxisgeräte, Gäste, Server, Drucker, IoT und Medizingeräte existieren?" },
      { key: "vlanPracticeDevices", label: "Gibt es ein eigenes Netz oder VLAN für Praxisgeräte?" },
      { key: "vlanGuests", label: "Gibt es ein getrenntes Gäste-WLAN oder Gäste-VLAN?" },
      { key: "vlanServers", label: "Gibt es ein getrenntes Servernetz oder Server-VLAN?" },
      { key: "vlanPrinters", label: "Gibt es ein getrenntes Druckernetz oder Drucker-VLAN?" },
      { key: "vlanIot", label: "Gibt es ein getrenntes IoT-/Kamera-Netz oder VLAN?" },
      { key: "vlanMedicalDevices", label: "Gibt es ein getrenntes Netz oder VLAN für Medizingeräte?" },
      { key: "guestWifiClientIsolation", label: "Ist Client-Isolation im Gäste-WLAN aktiviert?" }
    ]
  },
  {
    title: "DNS-Betrieb",
    questions: [
      { key: "dnsResolverDocumented", label: "Ist dokumentiert, welcher DNS-Resolver verwendet wird, z. B. Router, Dienstleister, Schutz-DNS oder interner Server?" },
      { key: "dnsFilterEnabled", label: "Ist ein DNS-Filter für Malware-/Phishing-Domains aktiv?" },
      { key: "dnsPrivacyReviewed", label: "Wurde die Datenschutzbewertung des DNS-Resolvers dokumentiert?" },
      { key: "dnsProviderDocumented", label: "Ist der zuständige DNS-Dienstleister oder Betreiber benannt?" },
      { key: "dnsConfigurationDocumented", label: "Ist die DNS-Konfiguration mit Weiterleitungen, Ausnahmen und Verantwortlichem dokumentiert?" }
    ]
  },
  {
    title: "DHCP-Sicherheit",
    questions: [
      { key: "dhcpAuthorizedServerDocumented", label: "Ist der autorisierte DHCP-Server dokumentiert?" },
      { key: "dhcpRouterIpDocumented", label: "Ist die erwartete Router-/Gateway-IP dokumentiert?" },
      { key: "dhcpDnsServersDocumented", label: "Sind die erlaubten DNS-Server in der DHCP-Konfiguration dokumentiert?" },
      { key: "dhcpExceptionsDocumented", label: "Sind bekannte DHCP-Ausnahmen, Reservierungen oder Sondernetze dokumentiert?" }
    ]
  },
  {
    title: "Router-Nachweis",
    questions: [
      { key: "routerManufacturerDocumented", label: "Ist der Router-Hersteller dokumentiert?" },
      { key: "routerModelDocumented", label: "Ist das Router-Modell dokumentiert?" },
      { key: "routerFirmwareVersionDocumented", label: "Ist die Firmware-Version dokumentiert?" },
      { key: "routerUpdateStatusDocumented", label: "Ist der Router-Update-Status dokumentiert?" },
      { key: "routerFirmwareCurrent", label: "Ist die Router-Firmware laut Dokumentation aktuell?" },
      { key: "routerItProviderDocumented", label: "Ist der zuständige IT-Dienstleister für Routerbetrieb und Updates benannt?" },
      { key: "routerAdminPasswordChanged", label: "Ist nachgewiesen, dass das Router-Adminpasswort vom Standard geändert wurde?" },
      { key: "routerPasswordManagerUsed", label: "Ist der Router-Zugang sicher dokumentiert, z. B. im Passwortmanager?" },
      { key: "routerMfaAvailable", label: "Ist MFA/2FA oder ein gleichwertiger Schutz für Router-/Provider-Zugänge aktiviert, sofern verfügbar?" },
      { key: "routerRemoteAccessDisabled", label: "Ist Router-Fernzugriff aus dem Internet deaktiviert oder auf VPN/definierte Quellen beschränkt?" },
      { key: "routerUpnpDisabled", label: "Ist UPnP am Router deaktiviert oder sind Ausnahmen dokumentiert freigegeben?" },
      { key: "routerPortForwardsDocumented", label: "Sind alle Router-Portfreigaben mit Zweck, Zielsystem und Verantwortlichem dokumentiert?" }
    ]
  },
  {
    title: "IPv6-Sicherheit",
    questions: [
      { key: "ipv6UsedIntentionally", label: "Wird IPv6 bewusst genutzt und ist der Zweck dokumentiert?" },
      { key: "ipv6FirewallRulesCovered", label: "Gelten Firewall-Regeln und Segmentierung auch für IPv6?" },
      { key: "ipv6DnsRulesCovered", label: "Gelten DNS-Filter und Resolver-Regeln auch für IPv6?" }
    ]
  },
  {
    title: "Weitere Basisfragen",
    questions: [
      { key: "staffTraining", label: "Gab es in den letzten 12 Monaten Awareness-Schulung?" },
      { key: "dmarc", label: "Ist DMARC für die Praxisdomain aktiv?" }
    ]
  }
];

export function questionnaireAnswersToCheckData(answers: Partial<Record<string, boolean>>): CheckData {
  const hasMfaEvidence =
    answers.mfa === true &&
    answers.mfaEvidence === true &&
    answers.mfaEmail === true &&
    answers.mfaAdminAccounts === true &&
    answers.mfaRemoteMaintenance === true;
  const hasDailyBackupEvidence =
    answers.backups === true &&
    answers.backupFrequencyDocumented === true &&
    answers.backupTargetDocumented === true &&
    answers.backupOfflineOrImmutable === true &&
    answers.backupOwnerDocumented === true &&
    answers.backupDocumented === true;
  const hasRestoreEvidence =
    answers.restoreTested === true &&
    answers.lastRestoreTestDocumented === true &&
    answers.restoreTestEvidence === true;
  const hasPatchEvidence =
    answers.patching === true &&
    answers.patchScopeDocumented === true &&
    answers.patchFrequencyDefined === true &&
    answers.patchOwnerDocumented === true &&
    answers.lastPatchDateDocumented === true &&
    answers.patchExceptionsDocumented === true &&
    answers.patchingEvidence === true;
  const hasPrivacyEvidence =
    answers.privacyDocuments === true &&
    answers.avvAvailable === true &&
    answers.tomsAvailable === true &&
    answers.processingDirectoryAvailable === true &&
    answers.deletionConceptAvailable === true &&
    answers.accessConceptAvailable === true &&
    answers.privacyTrainingDocumented === true &&
    answers.privacyReviewEvidence === true;

  return {
    mfa_enabled: hasMfaEvidence,
    backup_tested: hasRestoreEvidence,
    backup_frequency: answers.backups === undefined ? undefined : hasDailyBackupEvidence ? "daily" : answers.backups ? "weekly" : "none",
    dmarc_exists: answers.dmarc,
    updates_current: hasPatchEvidence,
    staff_training: answers.staffTraining === true && answers.privacyTrainingDocumented === true,
    privacy_documents_current: hasPrivacyEvidence,
    responsibilities_defined: answers.securityOwnerAssigned === true && answers.responsibilityDocumented === true
  };
}
