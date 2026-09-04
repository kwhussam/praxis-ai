import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";

import { supabase } from "@/lib/api/supabase";
import { approveBackofficePracticeRequest, createBackofficePractice, listBackofficePracticeRequests, listBackofficePractices, type BackofficeMutationIds } from "@/lib/backoffice/api";
import { getBackofficeAuthState } from "@/lib/backoffice/auth";
import type { ApprovePracticeRequestResult, BackofficePracticeSummary, BackofficePracticePage, BackofficePracticeActivationRequest, CreatePracticeInput, OnboardingStatus } from "@/lib/backoffice/types";
import { validatePracticeInput } from "@/lib/backoffice/validation";

const EMPTY_FORM: CreatePracticeInput = {
  practiceKind: "general",
  legalName: "",
  displayName: "",
  contactFirstName: "",
  contactLastName: "",
  contactEmail: "",
  contactPhone: "",
  street: "",
  postalCode: "",
  city: "",
  countryCode: "DE",
  domain: ""
};

const STATUS_LABEL: Record<OnboardingStatus, string> = {
  draft: "Entwurf",
  invited: "Eingeladen",
  active: "Aktiv",
  suspended: "Gesperrt",
  archived: "Archiviert"
};

export default function BackofficeDashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const compact = width < 980;
  const [authReady, setAuthReady] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreatePracticeInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const createAttemptIds = useRef<BackofficeMutationIds>(newCreateAttemptIds());
  const approvalAttempts = useRef(new Map<string, { ids: BackofficeMutationIds; expiresAt: string }>());
  const [approvedRequest, setApprovedRequest] = useState<ApprovePracticeRequestResult | null>(null);

  useEffect(() => {
    void getBackofficeAuthState()
      .then((state) => {
        if (state === "signed_out") router.replace("/backoffice/login" as never);
        else if (state === "aal1") router.replace("/backoffice/mfa" as never);
        else setAuthReady(true);
      })
      .catch(() => router.replace("/backoffice/login" as never));
  }, [router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setOffset(0);
      setDebouncedSearch(search.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const practices = useQuery<BackofficePracticePage>({
    queryKey: ["backoffice-practices", debouncedSearch, offset],
    queryFn: () => listBackofficePractices({ search: debouncedSearch, offset, limit: 25 }),
    enabled: authReady
  });
  const activationRequests = useQuery<{ requests: BackofficePracticeActivationRequest[] }>({ queryKey: ["backoffice-practice-requests"], queryFn: listBackofficePracticeRequests, enabled: authReady });
  const createPractice = useMutation({
    mutationFn: ({ input, ids }: { input: CreatePracticeInput; ids: BackofficeMutationIds }) =>
      createBackofficePractice(input, ids),
    onSuccess: async () => {
      setShowCreate(false);
      setForm(EMPTY_FORM);
      createAttemptIds.current = newCreateAttemptIds();
      await queryClient.invalidateQueries({ queryKey: ["backoffice-practices"] });
    }
  });
  const approveRequest = useMutation({
    mutationFn: ({ activationRequestId, ids, expiresAt }: { activationRequestId: string; ids: BackofficeMutationIds; expiresAt: string }) =>
      approveBackofficePracticeRequest(activationRequestId, expiresAt, ids),
    onSuccess: async (result) => {
      approvalAttempts.current.delete(result.request_id);
      setApprovedRequest(result);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["backoffice-practice-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["backoffice-practices"] })
      ]);
    }
  });
  const practiceRows = useMemo<BackofficePracticeSummary[]>(() => practices.data?.practices ?? [], [practices.data]);

  async function submitPractice() {
    const validationError = validatePracticeInput(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    try {
      await createPractice.mutateAsync({
        ids: createAttemptIds.current,
        input: {
          ...form,
          contactEmail: form.contactEmail.trim().toLowerCase(),
          domain: form.domain?.trim().toLowerCase() || undefined
        }
      });
    } catch {
      // React Query exposes the normalized error state in the form. Keeping the
      // rejection local avoids an unhandled browser promise on network failure.
    }
  }

  async function approveActivationRequest(activationRequestId: string) {
    let attempt = approvalAttempts.current.get(activationRequestId);
    if (!attempt) {
      attempt = {
        ids: newCreateAttemptIds(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 - 60_000).toISOString()
      };
      approvalAttempts.current.set(activationRequestId, attempt);
    }
    try {
      await approveRequest.mutateAsync({ activationRequestId, ...attempt });
    } catch {
      // Der gleiche Versuch bleibt fuer einen sicheren idempotenten Retry erhalten.
    }
  }

  if (Platform.OS !== "web") {
    return <View style={styles.loadingPage}><Text>Das Backoffice ist nur im Web verfügbar.</Text></View>;
  }
  if (!authReady) return <View style={styles.loadingPage}><ActivityIndicator color="#147D6B" /></View>;

  return (
    <View style={[styles.shell, compact && styles.shellCompact]}>
      <View style={[styles.sidebar, compact && styles.sidebarCompact]}>
        <Text style={styles.logo}>PRAXISSHIELD</Text>
        <View style={[styles.navigation, compact && styles.navigationCompact]}>
          <NavItem icon="business-outline" label="Praxen" active compact={compact} />
          <NavItem icon="people-outline" label="Benutzer" disabled compact={compact} />
          <NavItem icon="shield-checkmark-outline" label="Audit" onPress={() => router.push("/backoffice/audit" as never)} compact={compact} />
        </View>
        {!compact ? (
          <Pressable
            onPress={() => void supabase.auth.signOut().then(() => router.replace("/backoffice/login" as never))}
            style={styles.logout}
          >
            <Ionicons color="#9FB3C8" name="log-out-outline" size={18} />
            <Text style={styles.logoutText}>Abmelden</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.header, compact && styles.headerCompact]}>
          <View>
            <Text style={styles.kicker}>INTERNES BACKOFFICE</Text>
            <Text style={styles.heading}>Praxen</Text>
            <Text style={styles.headingCopy}>Onboarding und Zugänge zentral verwalten.</Text>
          </View>
          {practices.data?.permissions.canCreate === true ? (
            <Pressable onPress={() => beginCreateAttempt(setForm, setFormError, setShowCreate, createAttemptIds)} style={styles.primaryButton}>
              <Ionicons color="#FFFFFF" name="add" size={20} />
              <Text style={styles.primaryButtonText}>Neue Praxis</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.statsRow}>
          <Stat label="Auf dieser Seite" value={String(practiceRows.length)} />
          <Stat label="Im Onboarding" value={String(practiceRows.filter((item) => item.onboarding_status !== "active").length)} />
          <Stat label="Aktiv" value={String(practiceRows.filter((item) => item.onboarding_status === "active").length)} />
        </View>
        {activationRequests.data?.requests.length ? <View style={styles.requestNotice}>
          <Text style={styles.requestTitle}>Offene Praxisanfragen ({activationRequests.data.requests.length})</Text>
          {activationRequests.data.requests.map((request: BackofficePracticeActivationRequest) => <View key={request.id} style={styles.requestRow}>
            <View style={styles.requestDetails}>
              <Text style={styles.requestName}>{request.display_name}</Text>
              <Text style={styles.requestCopy}>{request.contact_email} · {request.city} · {request.practice_kind === "health" ? "Gesundheitseinrichtung" : "Allgemeines Unternehmen"}</Text>
            </View>
            <Pressable
              disabled={approveRequest.isPending}
              onPress={() => void approveActivationRequest(request.id)}
              style={[styles.approveButton, approveRequest.isPending && styles.disabledButton]}
            ><Text style={styles.approveButtonText}>Freigeben + Code</Text></Pressable>
          </View>)}
          {approveRequest.isError ? <Text accessibilityRole="alert" style={styles.formError}>Die Freigabe konnte nicht abgeschlossen werden. Ein erneuter Klick setzt denselben sicheren Versuch fort.</Text> : null}
        </View> : null}
        {approvedRequest ? <View style={styles.codeNotice}>
          <Text style={styles.codeTitle}>Aktivierungscode – nur jetzt sichtbar</Text>
          <Text selectable style={styles.activationCode}>{approvedRequest.code}</Text>
          <Text style={styles.codeCopy}>Gebunden an {approvedRequest.contact_email}. Gültig bis {new Date(approvedRequest.expires_at).toLocaleString("de-DE")}.</Text>
          <Pressable onPress={() => setApprovedRequest(null)} style={styles.codeDismiss}><Text style={styles.codeDismissText}>Anzeige schließen</Text></Pressable>
        </View> : null}

        <View style={styles.tableCard}>
          <View style={styles.toolbar}>
            <View style={styles.searchBox}>
              <Ionicons color="#829AB1" name="search" size={18} />
              <TextInput onChangeText={setSearch} placeholder="Name, E-Mail oder Domain suchen" placeholderTextColor="#829AB1" style={styles.searchInput} value={search} />
            </View>
          </View>
          {practices.isLoading ? <ActivityIndicator color="#147D6B" style={styles.loader} /> : null}
          {practices.isError ? <Text style={styles.errorBox}>Praxen konnten nicht geladen werden. Bitte Session und Berechtigung prüfen.</Text> : null}
          {!practices.isLoading && !practices.isError && practiceRows.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons color="#9FB3C8" name="business-outline" size={34} />
              <Text style={styles.emptyTitle}>Keine Praxen gefunden</Text>
              <Text style={styles.emptyCopy}>Lege die erste Praxis an oder passe die Suche an.</Text>
            </View>
          ) : null}
          {practiceRows.map((practice) => {
            const displayName = practice.display_name?.trim() || practice.legal_name?.trim() || "Unbenannte Praxis";
            return <Pressable
              accessibilityRole="link"
              key={practice.id}
              onPress={() => router.push(`/backoffice/practices/${practice.id}` as never)}
              style={({ pressed }) => [styles.row, compact && styles.rowCompact, pressed && styles.rowPressed]}
            >
              <View style={styles.practiceIdentity}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{displayName.slice(0, 2).toUpperCase()}</Text></View>
                <View>
                  <Text style={styles.practiceName}>{displayName}</Text>
                  <Text style={styles.practiceLegal}>{practice.legal_name || "Kein rechtlicher Name hinterlegt"}</Text>
                </View>
              </View>
              <View style={styles.rowMeta}>
                <Text style={styles.metaValue}>{practice.contact_email || "Keine Kontakt-E-Mail"}</Text>
                <Text style={styles.metaLabel}>{practice.domain ?? "Keine Domain"}</Text>
              </View>
              <View style={[styles.status, statusStyle(practice.onboarding_status)]}>
                <Text style={styles.statusText}>{STATUS_LABEL[practice.onboarding_status]}</Text>
              </View>
            </Pressable>;
          })}
          {practices.data && practiceRows.length > 0 ? (
            <View style={styles.pagination}>
              <Pressable disabled={offset === 0} onPress={() => setOffset(Math.max(0, offset - 25))} style={[styles.pageButton, offset === 0 && styles.pageButtonDisabled]}>
                <Text style={styles.pageButtonText}>Zurück</Text>
              </Pressable>
              <Text style={styles.pageLabel}>Einträge {offset + 1}–{offset + practiceRows.length}</Text>
              <Pressable disabled={!practices.data.page.hasMore} onPress={() => setOffset(practices.data?.page.nextOffset ?? offset)} style={[styles.pageButton, !practices.data.page.hasMore && styles.pageButtonDisabled]}>
                <Text style={styles.pageButtonText}>Weiter</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {showCreate ? (
        <View style={styles.overlay}>
          <Pressable accessibilityLabel="Dialog schließen" onPress={() => setShowCreate(false)} style={StyleSheet.absoluteFill} />
          <ScrollView contentContainerStyle={styles.drawer}>
            <View style={styles.drawerHeader}>
              <View>
                <Text style={styles.kicker}>NEUES ONBOARDING</Text>
                <Text style={styles.drawerTitle}>Praxis anlegen</Text>
              </View>
              <Pressable onPress={() => setShowCreate(false)} style={styles.iconButton}><Ionicons color="#486581" name="close" size={22} /></Pressable>
            </View>
            <Text style={styles.sectionTitle}>Praxistyp</Text>
            <View style={styles.kindRow}>
              <KindButton active={form.practiceKind === "general"} label="Allgemeines Unternehmen" onPress={() => setFormValue(setForm, "practiceKind", "general")} />
              <KindButton active={form.practiceKind === "health"} label="Gesundheitseinrichtung" onPress={() => setFormValue(setForm, "practiceKind", "health")} />
            </View>
            <Text style={styles.sectionTitle}>Stammdaten</Text>
            <Field label="Rechtlicher Name" value={form.legalName} onChange={(value) => setFormValue(setForm, "legalName", value)} />
            <Field label="Anzeigename" value={form.displayName} onChange={(value) => setFormValue(setForm, "displayName", value)} />
            <Field label="Domain (optional)" value={form.domain ?? ""} onChange={(value) => setFormValue(setForm, "domain", value)} placeholder="praxis.de" />
            <Text style={styles.sectionTitle}>Ansprechpartner</Text>
            <View style={styles.twoColumns}>
              <Field label="Vorname" value={form.contactFirstName} onChange={(value) => setFormValue(setForm, "contactFirstName", value)} grow />
              <Field label="Nachname" value={form.contactLastName} onChange={(value) => setFormValue(setForm, "contactLastName", value)} grow />
            </View>
            <Field label="E-Mail" value={form.contactEmail} onChange={(value) => setFormValue(setForm, "contactEmail", value)} />
            <Field label="Telefon" value={form.contactPhone} onChange={(value) => setFormValue(setForm, "contactPhone", value)} />
            <Text style={styles.sectionTitle}>Anschrift</Text>
            <Field label="Straße und Hausnummer" value={form.street} onChange={(value) => setFormValue(setForm, "street", value)} />
            <View style={styles.twoColumns}>
              <Field label="PLZ" value={form.postalCode} onChange={(value) => setFormValue(setForm, "postalCode", value)} grow />
              <Field label="Ort" value={form.city} onChange={(value) => setFormValue(setForm, "city", value)} grow />
            </View>
            {formError ? <Text accessibilityRole="alert" style={styles.formError}>{formError}</Text> : null}
            {createPractice.isError ? <Text accessibilityRole="alert" style={styles.formError}>Die Praxis konnte nicht angelegt werden. Bitte Eingaben und Berechtigung prüfen.</Text> : null}
            <View style={styles.drawerActions}>
              <Pressable onPress={() => setShowCreate(false)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Abbrechen</Text></Pressable>
              <Pressable disabled={createPractice.isPending} onPress={() => void submitPractice()} style={[styles.primaryButton, createPractice.isPending && styles.disabledButton]}>
                {createPractice.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Praxis als Entwurf anlegen</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function NavItem({ icon, label, active, disabled, compact, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active?: boolean; disabled?: boolean; compact?: boolean; onPress?: () => void }) {
  return <Pressable accessibilityRole={onPress ? "link" : undefined} disabled={disabled} onPress={onPress} style={[styles.navItem, active && styles.navItemActive, disabled && styles.navItemDisabled]}><Ionicons color={active ? "#42D3B3" : "#9FB3C8"} name={icon} size={20} />{!compact ? <Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text> : null}</Pressable>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function KindButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.kindButton, active && styles.kindButtonActive]}><View style={[styles.radio, active && styles.radioActive]} /> <Text style={styles.kindText}>{label}</Text></Pressable>;
}

function Field({ label, value, onChange, placeholder, grow }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; grow?: boolean }) {
  return <View style={[styles.field, grow && styles.fieldGrow]}><Text style={styles.fieldLabel}>{label}</Text><TextInput onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#9FB3C8" style={styles.fieldInput} value={value} /></View>;
}

function setFormValue<K extends keyof CreatePracticeInput>(setter: React.Dispatch<React.SetStateAction<CreatePracticeInput>>, key: K, value: CreatePracticeInput[K]) {
  setter((current) => ({ ...current, [key]: value }));
}

function newCreateAttemptIds(): BackofficeMutationIds {
  return { idempotencyKey: crypto.randomUUID(), requestId: crypto.randomUUID() };
}

function beginCreateAttempt(
  setForm: React.Dispatch<React.SetStateAction<CreatePracticeInput>>,
  setFormError: React.Dispatch<React.SetStateAction<string | null>>,
  setShowCreate: React.Dispatch<React.SetStateAction<boolean>>,
  ids: React.MutableRefObject<BackofficeMutationIds>
) {
  setForm(EMPTY_FORM);
  setFormError(null);
  ids.current = newCreateAttemptIds();
  setShowCreate(true);
}

function statusStyle(status: OnboardingStatus) {
  const statusStyles = {
    draft: styles.status_draft,
    invited: styles.status_invited,
    active: styles.status_active,
    suspended: styles.status_suspended,
    archived: styles.status_archived
  };
  return statusStyles[status];
}

const styles = StyleSheet.create({
  shell: { backgroundColor: "#F4F7FB", flex: 1, flexDirection: "row" }, shellCompact: { paddingLeft: 70 },
  sidebar: { backgroundColor: "#0A2540", paddingHorizontal: 22, paddingVertical: 28, width: 230 }, sidebarCompact: { bottom: 0, left: 0, paddingHorizontal: 12, position: "absolute", top: 0, width: 70, zIndex: 2 },
  logo: { color: "#42D3B3", fontSize: 13, fontWeight: "900", letterSpacing: 1.7 }, navigation: { flex: 1, gap: 8, marginTop: 46 }, navigationCompact: { alignItems: "center" },
  navItem: { alignItems: "center", borderRadius: 9, flexDirection: "row", gap: 12, paddingHorizontal: 12, paddingVertical: 12 }, navItemActive: { backgroundColor: "#123653" }, navItemDisabled: { opacity: 0.48 }, navText: { color: "#B7C8D8", fontSize: 14, fontWeight: "600" }, navTextActive: { color: "#FFFFFF" },
  logout: { alignItems: "center", borderTopColor: "#28516D", borderTopWidth: 1, flexDirection: "row", gap: 10, paddingTop: 20 }, logoutText: { color: "#B7C8D8", fontSize: 14 },
  content: { flexGrow: 1, padding: 38 }, header: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between" }, headerCompact: { alignItems: "flex-start", gap: 22 }, kicker: { color: "#147D6B", fontSize: 11, fontWeight: "900", letterSpacing: 1.5 }, heading: { color: "#102A43", fontSize: 34, fontWeight: "800", marginTop: 8 }, headingCopy: { color: "#627D98", fontSize: 15, marginTop: 5 },
  requestNotice: { backgroundColor: "#FFF7E6", borderColor: "#F2C66D", borderRadius: 12, borderWidth: 1, marginTop: 22, padding: 16 }, requestTitle: { color: "#7A4E00", fontSize: 15, fontWeight: "800" }, requestRow: { alignItems: "center", borderTopColor: "#F2D69B", borderTopWidth: 1, flexDirection: "row", gap: 14, justifyContent: "space-between", marginTop: 12, paddingTop: 12 }, requestDetails: { flex: 1 }, requestName: { color: "#5F3D00", fontSize: 14, fontWeight: "800" }, requestCopy: { color: "#7A5B20", fontSize: 13, marginTop: 4 }, approveButton: { backgroundColor: "#9A6700", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 }, approveButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  codeNotice: { backgroundColor: "#E8F8F3", borderColor: "#62C7AD", borderRadius: 12, borderWidth: 1, marginTop: 16, padding: 18 }, codeTitle: { color: "#0A5C4D", fontSize: 15, fontWeight: "900" }, activationCode: { color: "#0A2540", fontFamily: "monospace", fontSize: 28, fontWeight: "900", letterSpacing: 3, marginTop: 10 }, codeCopy: { color: "#356B62", fontSize: 13, marginTop: 8 }, codeDismiss: { alignSelf: "flex-start", marginTop: 12 }, codeDismissText: { color: "#147D6B", fontSize: 13, fontWeight: "800" },
  primaryButton: { alignItems: "center", backgroundColor: "#147D6B", borderRadius: 9, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 46, paddingHorizontal: 18 }, primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" }, disabledButton: { opacity: 0.5 },
  statsRow: { flexDirection: "row", gap: 14, marginTop: 28 }, stat: { backgroundColor: "#FFFFFF", borderColor: "#E1E8EF", borderRadius: 12, borderWidth: 1, flex: 1, padding: 20 }, statValue: { color: "#102A43", fontSize: 28, fontWeight: "800" }, statLabel: { color: "#627D98", fontSize: 13, marginTop: 5 },
  tableCard: { backgroundColor: "#FFFFFF", borderColor: "#E1E8EF", borderRadius: 14, borderWidth: 1, marginTop: 22, overflow: "hidden" }, toolbar: { borderBottomColor: "#E8EEF4", borderBottomWidth: 1, padding: 16 }, searchBox: { alignItems: "center", backgroundColor: "#F7F9FC", borderColor: "#D9E2EC", borderRadius: 9, borderWidth: 1, flexDirection: "row", gap: 8, maxWidth: 430, paddingHorizontal: 13 }, searchInput: { color: "#102A43", flex: 1, fontSize: 14, height: 42 }, loader: { margin: 50 }, errorBox: { color: "#B42318", padding: 24 },
  empty: { alignItems: "center", padding: 56 }, emptyTitle: { color: "#334E68", fontSize: 17, fontWeight: "700", marginTop: 14 }, emptyCopy: { color: "#829AB1", fontSize: 13, marginTop: 5 },
  row: { alignItems: "center", borderBottomColor: "#EDF2F7", borderBottomWidth: 1, flexDirection: "row", gap: 24, justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 15 }, rowCompact: { alignItems: "flex-start" }, rowPressed: { backgroundColor: "#F7FAFC" }, practiceIdentity: { alignItems: "center", flex: 1.3, flexDirection: "row", gap: 12 }, avatar: { alignItems: "center", backgroundColor: "#DDF5EF", borderRadius: 9, height: 40, justifyContent: "center", width: 40 }, avatarText: { color: "#147D6B", fontSize: 13, fontWeight: "800" }, practiceName: { color: "#243B53", fontSize: 14, fontWeight: "700" }, practiceLegal: { color: "#829AB1", fontSize: 12, marginTop: 3 }, rowMeta: { flex: 1 }, metaValue: { color: "#486581", fontSize: 13 }, metaLabel: { color: "#9FB3C8", fontSize: 12, marginTop: 3 },
  pagination: { alignItems: "center", flexDirection: "row", justifyContent: "flex-end", gap: 14, padding: 16 }, pageButton: { borderColor: "#CBD5E1", borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 }, pageButtonDisabled: { opacity: 0.4 }, pageButtonText: { color: "#334E68", fontSize: 13, fontWeight: "700" }, pageLabel: { color: "#627D98", fontSize: 12 },
  status: { borderRadius: 99, paddingHorizontal: 11, paddingVertical: 6 }, status_draft: { backgroundColor: "#EEF2F6" }, status_invited: { backgroundColor: "#FFF3D6" }, status_active: { backgroundColor: "#DDF5EF" }, status_suspended: { backgroundColor: "#FDE8E7" }, status_archived: { backgroundColor: "#EEF2F6" }, statusText: { color: "#486581", fontSize: 11, fontWeight: "800" },
  loadingPage: { alignItems: "center", backgroundColor: "#F4F7FB", flex: 1, justifyContent: "center" }, overlay: { backgroundColor: "rgba(10, 37, 64, 0.42)", bottom: 0, left: 0, position: "absolute", right: 0, top: 0, zIndex: 5 }, drawer: { alignSelf: "flex-end", backgroundColor: "#FFFFFF", minHeight: "100%", padding: 30, width: 560 }, drawerHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }, drawerTitle: { color: "#102A43", fontSize: 28, fontWeight: "800", marginTop: 7 }, iconButton: { alignItems: "center", backgroundColor: "#F1F5F9", borderRadius: 8, height: 38, justifyContent: "center", width: 38 },
  sectionTitle: { color: "#334E68", fontSize: 14, fontWeight: "800", marginBottom: 12, marginTop: 28 }, kindRow: { flexDirection: "row", gap: 10 }, kindButton: { alignItems: "center", borderColor: "#D9E2EC", borderRadius: 9, borderWidth: 1, flex: 1, flexDirection: "row", gap: 9, padding: 13 }, kindButtonActive: { backgroundColor: "#F0FBF8", borderColor: "#42A995" }, radio: { borderColor: "#9FB3C8", borderRadius: 9, borderWidth: 1, height: 16, width: 16 }, radioActive: { backgroundColor: "#147D6B", borderColor: "#147D6B", borderWidth: 4 }, kindText: { color: "#334E68", flex: 1, fontSize: 13, fontWeight: "600" },
  field: { marginBottom: 13 }, fieldGrow: { flex: 1 }, fieldLabel: { color: "#486581", fontSize: 12, fontWeight: "700", marginBottom: 7 }, fieldInput: { borderColor: "#CBD5E1", borderRadius: 8, borderWidth: 1, color: "#102A43", fontSize: 14, height: 44, paddingHorizontal: 12 }, twoColumns: { flexDirection: "row", gap: 12 }, formError: { color: "#B42318", fontSize: 13, lineHeight: 20, marginTop: 8 }, drawerActions: { borderTopColor: "#E8EEF4", borderTopWidth: 1, flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 28, paddingTop: 20 }, secondaryButton: { alignItems: "center", borderColor: "#CBD5E1", borderRadius: 9, borderWidth: 1, justifyContent: "center", minHeight: 46, paddingHorizontal: 18 }, secondaryButtonText: { color: "#486581", fontSize: 14, fontWeight: "700" }
});
