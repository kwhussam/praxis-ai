export const KBV390_CATALOG_ID = "kbv-itsrl-390-2025-04-01" as const;
export const KBV390_SCHEMA_VERSION = "1.0.0" as const;
export const KBV390_SOURCE_SHA256 = "04a4b7a28b7806a4d9f518dff82f849b92076016762860df87ae50795dd7f96d" as const;
export const KBV390_SOURCE_URL =
  "https://www.kbv.de/documents/infothek/rechtsquellen/bekanntmachungen/richtlinien/IT-Sicherheitsrichtlinie_390_KBV.pdf" as const;

export type Kbv390Appendix = 1 | 2 | 3 | 4 | 5;
export type Kbv390EditorialStatus = "mapped" | "reviewed" | "released";
export type PracticeSize = "practice" | "medium" | "large";
export type ApplicabilityStatus = "applicable" | "conditional" | "not_applicable";

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
export type Kbv390ControlId = `KBV-390-A${Kbv390Appendix}-${Digit}${Digit}${Digit}`;

const TARGET_OBJECT_IDS = {
  "Personal": "personnel",
  "Sensibilisierung und Schulung zur Informationssicherheit": "security_awareness",
  "Netzwerksicherheit": "network_security",
  "Patch- und Änderungsmanagement": "patch_change_management",
  "Endgeräte": "endpoints",
  "Endgeräte mit dem Betriebssystem Windows": "windows_endpoints",
  "Smartphone und Tablet": "smartphones_tablets",
  "Mobiltelefon": "mobile_phones",
  "Wechseldatenträger / Speichermedien": "removable_media",
  "E-Mail-Client und -Server": "email_clients_servers",
  "Mobile Anwendungen (Apps)": "mobile_apps",
  "Internet-Anwendungen - Anbieter": "internet_apps_provider",
  "Internet-Anwendungen - Anwender": "internet_apps_user",
  "Cloud-Anwendungen - Anbieter": "cloud_apps_provider",
  "Mobile Device Management (MDM)": "mobile_device_management",
  "Medizinische Großgeräte": "medical_large_devices",
  "Dezentrale Komponenten der TI": "decentral_ti_components",
  "Konnektor": "ti_connector",
  "Gehosteter Konnektor": "hosted_ti_connector",
  "TI-Gateway": "ti_gateway",
  "Primärsysteme": "primary_systems"
} as const;

type Kbv390TargetObjectName = keyof typeof TARGET_OBJECT_IDS;
export type Kbv390TargetObjectId = (typeof TARGET_OBJECT_IDS)[Kbv390TargetObjectName];
export const KBV390_TARGET_OBJECT_IDS: readonly Kbv390TargetObjectId[] = Object.freeze(
  [...new Set(Object.values(TARGET_OBJECT_IDS))]
);

export type Kbv390Control = Readonly<{
  id: Kbv390ControlId;
  appendix: Kbv390Appendix;
  number: number;
  source_page: number;
  target_object_id: Kbv390TargetObjectId;
  target_object: Kbv390TargetObjectName;
  official_title: string;
  effective_from: "2025-04-01" | "2025-10-01";
  practice_scope: "all" | "medium_and_large" | "large_only" | "medical_large_devices" | "ti_components";
  legacy_control_ids: readonly string[];
}>;

type RawControl = readonly [number: number, page: number, targetObject: Kbv390TargetObjectName, officialTitle: string];

const A1 = [
  [1, 4, "Personal", "Geregelte Einarbeitung neuer Mitarbeitender"],
  [2, 4, "Personal", "Geregelte Verfahrensweise beim Weggang von Mitarbeitenden"],
  [3, 4, "Personal", "Festlegung von Regelungen für den Einsatz von Fremdpersonal"],
  [4, 4, "Personal", "Vertraulichkeitsvereinbarungen für den Einsatz von Fremdpersonal"],
  [5, 5, "Personal", "Aufgaben und Zuständigkeiten von Mitarbeitenden"],
  [6, 5, "Personal", "Qualifikation des Personals"],
  [7, 5, "Personal", "Überprüfung der Vertrauenswürdigkeit von Mitarbeitenden"],
  [8, 6, "Sensibilisierung und Schulung zur Informationssicherheit", "Sensibilisierung der Praxisleitung für Informationssicherheit"],
  [9, 6, "Sensibilisierung und Schulung zur Informationssicherheit", "Einweisung des Personals in den sicheren Umgang mit IT"],
  [10, 6, "Sensibilisierung und Schulung zur Informationssicherheit", "Durchführung von Sensibilisierungen und Schulungen zur Informationssicherheit"],
  [11, 6, "Netzwerksicherheit", "Absicherung der Netzübergangspunkte"],
  [12, 6, "Netzwerksicherheit", "Dokumentation des Netzes"],
  [13, 6, "Netzwerksicherheit", "Grundlegende Authentisierung für den Netzmanagement-Zugriff"],
  [14, 6, "Patch- und Änderungsmanagement", "Installation von Updates"],
  [15, 6, "Patch- und Änderungsmanagement", "Verantwortlichkeit für Updates"],
  [16, 7, "Patch- und Änderungsmanagement", "Identifizierung ausbleibender Updates"],
  [17, 7, "Patch- und Änderungsmanagement", "Ausmusterung oder Separierung bei ausbleibenden Updates"],
  [18, 7, "Endgeräte", "Verhinderung der unautorisierten Nutzung von Rechner-Mikrofonen und Kameras"],
  [19, 7, "Endgeräte", "Abmelden nach Aufgabenerfüllung"],
  [20, 7, "Endgeräte", "Einsatz von Viren-Schutzprogrammen"],
  [21, 7, "Endgeräte", "Regelmäßige Datensicherung"],
  [22, 7, "Endgeräte", "Schutz der Datensicherung"],
  [23, 7, "Endgeräte", "Art der Datensicherung"],
  [24, 7, "Endgeräte", "Verantwortliche der Datensicherung"],
  [25, 7, "Endgeräte", "Test der Datensicherung"],
  [26, 7, "Endgeräte", "Der Zugriff auf Geräte und Software muss abgesichert werden"],
  [27, 8, "Endgeräte mit dem Betriebssystem Windows", "Konfiguration von Synchronisationsmechanismen"],
  [28, 8, "Endgeräte mit dem Betriebssystem Windows", "Datei- und Freigabeberechtigungen"],
  [29, 8, "Endgeräte mit dem Betriebssystem Windows", "Datensparsamkeit"],
  [30, 8, "Smartphone und Tablet", "Verwendung der SIM-Karten-PIN"],
  [31, 8, "Smartphone und Tablet", "Sichere Grundkonfiguration für mobile Geräte"],
  [32, 8, "Smartphone und Tablet", "Verwendung eines Zugriffschutzes"],
  [33, 8, "Smartphone und Tablet", "Datenschutz-Einstellungen"],
  [34, 8, "Mobiltelefon", "Sperrmaßnahmen bei Verlust eines Mobiltelefons"],
  [35, 8, "Mobiltelefon", "Nutzung der Sicherheitsmechanismen von Mobiltelefonen"],
  [36, 8, "Wechseldatenträger / Speichermedien", "Schutz vor Schadsoftware"],
  [37, 9, "Wechseldatenträger / Speichermedien", "Angemessene Kennzeichnung der Datenträger beim Versand"],
  [38, 9, "Wechseldatenträger / Speichermedien", "Sichere Versandart und Verpackung"],
  [39, 9, "Wechseldatenträger / Speichermedien", "Sicheres Löschen der Datenträger vor und nach der Verwendung"],
  [40, 9, "E-Mail-Client und -Server", "Sichere Konfiguration der E-Mail-Clients"],
  [41, 9, "E-Mail-Client und -Server", "Umgang mit Spam durch Benutzende"],
  [42, 9, "Mobile Anwendungen (Apps)", "Sichere Apps nutzen"],
  [43, 10, "Mobile Anwendungen (Apps)", "Sichere Speicherung lokaler App-Daten"],
  [44, 10, "Mobile Anwendungen (Apps)", "Verhinderung von Datenabfluss"],
  [45, 10, "Internet-Anwendungen - Anbieter", "Authentisierung bei Webanwendungen"],
  [46, 10, "Internet-Anwendungen - Anbieter", "Schutz vertraulicher Daten"],
  [47, 11, "Internet-Anwendungen - Anbieter", "Einsatz von Web Application Firewalls"],
  [48, 11, "Internet-Anwendungen - Anbieter", "Schutz vor unerlaubter automatisierter Nutzung von Webanwendungen"],
  [49, 11, "Internet-Anwendungen - Anwender", "Kryptografische Sicherung vertraulicher Daten"],
  [50, 11, "Cloud-Anwendungen - Anbieter", "Sicherheit von Cloud-Dienstleistern"]
] as const satisfies readonly RawControl[];

const A2 = [
  [1, 13, "Netzwerksicherheit", "Alarmierung und Logging"],
  [2, 13, "Endgeräte", "Nutzung von verschlüsselten Kommunikationsverbindungen"],
  [3, 13, "Endgeräte", "Restriktive Rechtevergabe"],
  [4, 13, "Endgeräte mit dem Betriebssystem Windows", "Sichere zentrale Authentisierung in Windows-Netzen"],
  [5, 13, "Smartphone und Tablet", "Richtlinie für Mitarbeitende zur Benutzung von mobilen Geräten"],
  [6, 13, "Smartphone und Tablet", "Verwendung von Sprachassistenten"],
  [7, 13, "Mobiltelefon", "Sicherheitsrichtlinien und Regelungen für die Mobiltelefon-Nutzung"],
  [8, 13, "Mobiltelefon", "Sichere Datenübertragung über Mobiltelefone"],
  [9, 13, "Wechseldatenträger / Speichermedien", "Regelung zur Mitnahme von Wechseldatenträgern"],
  [10, 13, "Mobile Anwendungen (Apps)", "Minimierung und Kontrolle von App-Berechtigungen"]
] as const satisfies readonly RawControl[];

const A3 = [
  [1, 14, "Personal", "Messung und Auswertung des Lernerfolgs"],
  [2, 14, "Netzwerksicherheit", "Planung des internen Netzwerkes"],
  [3, 14, "Netzwerksicherheit", "Absicherung von schützenswerten Informationen"],
  [4, 14, "Smartphone und Tablet", "Festlegung einer Richtlinie für den Einsatz von Smartphones und Tablets"],
  [5, 14, "Smartphone und Tablet", "Auswahl und Freigabe von Apps"],
  [6, 15, "Smartphone und Tablet", "Definition der erlaubten Informationen und Applikationen auf mobilen Geräten"],
  [7, 15, "Mobile Device Management (MDM)", "Sichere Anbindung der mobilen Endgeräte an die Institution"],
  [8, 15, "Mobile Device Management (MDM)", "Berechtigungsmanagement im MDM"],
  [9, 15, "Mobile Device Management (MDM)", "Verwaltung von Zertifikaten"],
  [10, 15, "Mobile Device Management (MDM)", "Fernlöschung und Außerbetriebnahme von Endgeräten"],
  [11, 15, "Mobile Device Management (MDM)", "Auswahl und Freigabe von Apps"],
  [12, 15, "Mobile Device Management (MDM)", "Festlegung erlaubter Informationen auf mobilen Endgeräten"],
  [13, 15, "Wechseldatenträger / Speichermedien", "Datenträgerverschlüsselung"],
  [14, 15, "Wechseldatenträger / Speichermedien", "Integritätsschutz durch Checksummen oder digitale Signaturen"],
  [15, 15, "E-Mail-Client und -Server", "Sicherer Betrieb von E-Mail-Servern"],
  [16, 16, "E-Mail-Client und -Server", "Datensicherung und Archivierung von E-Mails"],
  [17, 16, "E-Mail-Client und -Server", "Spam- und Virenschutz auf dem E-Mail-Server"]
] as const satisfies readonly RawControl[];

const A4 = [
  [1, 17, "Medizinische Großgeräte", "Einschränkung des Zugriffs für Konfigurations- und Wartungsschnittstellen"],
  [2, 17, "Medizinische Großgeräte", "Nutzung sicherer Protokolle für die Konfiguration und Wartung"],
  [3, 17, "Medizinische Großgeräte", "Protokollierung"],
  [4, 17, "Medizinische Großgeräte", "Deaktivierung nicht genutzter Dienste, Funktionen und Schnittstellen"],
  [5, 17, "Medizinische Großgeräte", "Deaktivierung nicht genutzter Benutzerkonten"],
  [6, 17, "Medizinische Großgeräte", "Netzsegmentierung"]
] as const satisfies readonly RawControl[];

const A5 = [
  [1, 18, "Dezentrale Komponenten der TI", "Planung und Durchführung der Installation"],
  [2, 18, "Dezentrale Komponenten der TI", "Betrieb"],
  [3, 18, "Dezentrale Komponenten der TI", "Schutz vor unberechtigtem physischem Zugriff"],
  [4, 18, "Konnektor", "Internet-Verbindung parallel zur TI-Anbindung"],
  [5, 18, "Gehosteter Konnektor", "Verbindung absichern"],
  [6, 18, "TI-Gateway", "Beachtung der Vorgaben des TI-Gateway-Anbieters"],
  [7, 18, "Primärsysteme", "Geschützte Kommunikation mit dem Konnektor/TI-Gateway"],
  [8, 18, "Dezentrale Komponenten der TI", "Zeitnahes Installieren verfügbarer Aktualisierungen"],
  [9, 18, "Dezentrale Komponenten der TI", "Sicheres Aufbewahren von Administrationsdaten"]
] as const satisfies readonly RawControl[];

const DELAYED_CONTROLS = new Set([
  ...range(1, 1, 10), ...range(1, 14, 17), ...range(1, 22, 26), "1:40", "1:41", "1:50",
  "3:1", "3:2", ...range(3, 15, 17), "5:5", "5:6"
]);

const RAW_BY_APPENDIX: Readonly<Record<Kbv390Appendix, readonly RawControl[]>> = {
  1: A1,
  2: A2,
  3: A3,
  4: A4,
  5: A5
};

export const KBV390_CONTROLS: readonly Kbv390Control[] = deepFreeze(Object.entries(RAW_BY_APPENDIX).flatMap(
  ([appendixValue, controls]) => {
    const appendix = Number(appendixValue) as Kbv390Appendix;
    return controls.map(([number, page, targetObject, officialTitle]) => ({
      id: `KBV-390-A${appendix}-${String(number).padStart(3, "0")}` as Kbv390ControlId,
      appendix,
      number,
      source_page: page,
      target_object_id: TARGET_OBJECT_IDS[targetObject],
      target_object: targetObject,
      official_title: officialTitle,
      effective_from: DELAYED_CONTROLS.has(`${appendix}:${number}`) ? "2025-10-01" : "2025-04-01",
      practice_scope: scopeForAppendix(appendix),
      legacy_control_ids: appendix === 4 && number === 6 ? ["KBV-ITS-ANLAGE4-6"] : []
    }));
  }
));

export type Kbv390PracticeContext = Readonly<{
  practice_size: PracticeSize | null;
  uses_medical_large_devices: boolean | null;
  uses_ti_components: boolean | null;
  used_target_object_ids?: readonly Kbv390TargetObjectId[];
}>;

export type Kbv390Applicability = Readonly<{
  status: ApplicabilityStatus;
  reason_code:
    | "practice_size"
    | "practice_size_unknown"
    | "medical_large_devices_absent"
    | "medical_large_devices_unknown"
    | "ti_components_absent"
    | "ti_components_unknown"
    | "target_not_used"
    | "target_usage_unknown"
    | "target_inventory_invalid"
    | "applicable";
}>;

export function determineKbv390Applicability(
  control: Kbv390Control,
  context: Kbv390PracticeContext
): Kbv390Applicability {
  if (control.practice_scope === "medium_and_large") {
    if (!isPracticeSize(context.practice_size)) {
      return { status: "conditional", reason_code: "practice_size_unknown" };
    }
    if (context.practice_size === "practice") return { status: "not_applicable", reason_code: "practice_size" };
  }
  if (control.practice_scope === "large_only") {
    if (!isPracticeSize(context.practice_size)) {
      return { status: "conditional", reason_code: "practice_size_unknown" };
    }
    if (context.practice_size !== "large") return { status: "not_applicable", reason_code: "practice_size" };
  }
  if (control.practice_scope === "medical_large_devices") {
    if (context.uses_medical_large_devices === null) {
      return { status: "conditional", reason_code: "medical_large_devices_unknown" };
    }
    if (!context.uses_medical_large_devices) {
      return { status: "not_applicable", reason_code: "medical_large_devices_absent" };
    }
  }
  if (control.practice_scope === "ti_components") {
    if (context.uses_ti_components === null) return { status: "conditional", reason_code: "ti_components_unknown" };
    if (!context.uses_ti_components) return { status: "not_applicable", reason_code: "ti_components_absent" };
  }
  if (!context.used_target_object_ids) return { status: "conditional", reason_code: "target_usage_unknown" };
  const targetIds = context.used_target_object_ids as readonly string[];
  if (
    new Set(targetIds).size !== targetIds.length ||
    targetIds.some((targetId) => !(KBV390_TARGET_OBJECT_IDS as readonly string[]).includes(targetId))
  ) {
    return { status: "conditional", reason_code: "target_inventory_invalid" };
  }
  if (!context.used_target_object_ids.includes(control.target_object_id)) {
    return { status: "not_applicable", reason_code: "target_not_used" };
  }
  return { status: "applicable", reason_code: "applicable" };
}

export function assertKbv390Catalog(controls: readonly Kbv390Control[] = KBV390_CONTROLS): void {
  if (controls.length !== 92) throw new Error(`kbv390_catalog:expected_92_controls:${controls.length}`);
  const ids = new Set(controls.map((control) => control.id));
  if (ids.size !== controls.length) throw new Error("kbv390_catalog:duplicate_id");
  const expectedCounts: Readonly<Record<Kbv390Appendix, number>> = { 1: 50, 2: 10, 3: 17, 4: 6, 5: 9 };
  for (const appendix of [1, 2, 3, 4, 5] as const) {
    const appendixControls = controls.filter((control) => control.appendix === appendix);
    if (appendixControls.length !== expectedCounts[appendix]) {
      throw new Error(`kbv390_catalog:appendix_${appendix}_count:${appendixControls.length}`);
    }
    appendixControls.forEach((control, index) => {
      if (control.number !== index + 1) throw new Error(`kbv390_catalog:appendix_${appendix}_sequence`);
      if (!control.official_title.trim() || !control.target_object.trim()) throw new Error(`kbv390_catalog:blank_control:${control.id}`);
      if (TARGET_OBJECT_IDS[control.target_object] !== control.target_object_id) {
        throw new Error(`kbv390_catalog:invalid_target_object:${control.id}`);
      }
    });
  }
}

function scopeForAppendix(appendix: Kbv390Appendix): Kbv390Control["practice_scope"] {
  if (appendix === 2) return "medium_and_large";
  if (appendix === 3) return "large_only";
  if (appendix === 4) return "medical_large_devices";
  if (appendix === 5) return "ti_components";
  return "all";
}

function isPracticeSize(value: unknown): value is PracticeSize {
  return value === "practice" || value === "medium" || value === "large";
}

function range(appendix: Kbv390Appendix, from: number, to: number): string[] {
  return Array.from({ length: to - from + 1 }, (_, index) => `${appendix}:${from + index}`);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((nested) => deepFreeze(nested));
    Object.freeze(value);
  }
  return value;
}

assertKbv390Catalog();
