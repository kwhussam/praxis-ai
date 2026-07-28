import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";

import {
  getBackofficePractice,
  updateBackofficePractice,
  type BackofficeMutationIds
} from "@/lib/backoffice/api";
import { getBackofficeAuthState } from "@/lib/backoffice/auth";
import type { BackofficePracticeDetail, BackofficePracticeDetailResponse, OnboardingStatus, UpdatePracticeInput } from "@/lib/backoffice/types";
import { validatePracticeInput } from "@/lib/backoffice/validation";

const STATUS_LABEL: Record<OnboardingStatus, string> = {
  draft: "Entwurf",
  invited: "Eingeladen",
  active: "Aktiv",
  suspended: "Gesperrt",
  archived: "Archiviert"
};

const SAFE_STATUS_ACTIONS: Partial<Record<OnboardingStatus, OnboardingStatus[]>> = {
  active: ["suspended"],
  suspended: ["active"]
};

export default function BackofficePracticeDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const compact = width < 1050;
  const [authReady, setAuthReady] = useState(false);
  const [form, setForm] = useState<UpdatePracticeInput | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const mutationIds = useRef<BackofficeMutationIds>(newMutationIds());

  useEffect(() => {
    void getBackofficeAuthState()
      .then((state) => {
        if (state === "signed_out") router.replace("/backoffice/login" as never);
        else if (state === "aal1") router.replace("/backoffice/mfa" as never);
        else setAuthReady(true);
      })
      .catch(() => router.replace("/backoffice/login" as never));
  }, [router]);

  const detail = useQuery<BackofficePracticeDetailResponse>({
    queryKey: ["backoffice-practice", id],
    queryFn: () => getBackofficePractice(id ?? ""),
    enabled: authReady && typeof id === "string" && id.length > 0
  });
  const detailResponse = detail.data as BackofficePracticeDetailResponse | undefined;

  useEffect(() => {
    if (detailResponse?.practice) setForm(formFromPractice(detailResponse.practice));
  }, [detailResponse?.practice]);

  const update = useMutation({
    mutationFn: ({ input, status }: { input: UpdatePracticeInput; status?: OnboardingStatus }) =>
      updateBackofficePractice(id ?? "", input, mutationIds.current, status),
    onSuccess: async () => {
      mutationIds.current = newMutationIds();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["backoffice-practice", id] }),
        queryClient.invalidateQueries({ queryKey: ["backoffice-practices"] })
      ]);
    }
  });

  async function save(status?: OnboardingStatus) {
    if (!form) return;
    const validationError = validatePracticeInput(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    try {
      await update.mutateAsync({
        input: {
          ...form,
          contactEmail: form.contactEmail.trim().toLowerCase(),
          domain: form.domain?.trim().toLowerCase() ?? ""
        },
        status
      });
    } catch {
      // The mutation state renders the safe outward error without leaking API details.
    }
  }

  if (Platform.OS !== "web") return <View style={styles.center}><Text>Das Backoffice ist nur im Web verfügbar.</Text></View>;
  if (!authReady || detail.isLoading) return <View style={styles.center}><ActivityIndicator color="#147D6B" /></View>;
  if (detail.isError || !detailResponse || !form) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Praxis nicht verfügbar</Text>
        <Text style={styles.errorCopy}>Die Praxis existiert nicht oder ist deinem Konto nicht zugewiesen.</Text>
        <Pressable onPress={() => router.replace("/backoffice" as never)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Zur Praxisliste</Text></Pressable>
      </View>
    );
  }

  const practice = detailResponse.practice;
  const canManage = detailResponse.permissions.canManage;
  const statusActions = SAFE_STATUS_ACTIONS[practice.onboarding_status] ?? [];
  const hasUnsavedChanges = JSON.stringify(form) !== JSON.stringify(formFromPractice(practice));

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.replace("/backoffice" as never)} style={styles.backButton}>
          <Ionicons color="#486581" name="arrow-back" size={18} />
          <Text style={styles.backText}>Praxen</Text>
        </Pressable>
        <View style={styles.status}><Text style={styles.statusText}>{STATUS_LABEL[practice.onboarding_status]}</Text></View>
      </View>

      <View style={[styles.headingRow, compact && styles.headingRowCompact]}>
        <View>
          <Text style={styles.kicker}>{practice.practice_kind === "health" ? "GESUNDHEITSPROFIL" : "ALLGEMEINES PROFIL"}</Text>
          <Text style={styles.heading}>{practice.display_name}</Text>
          <Text style={styles.subheading}>{practice.legal_name} · {practice.city}</Text>
        </View>
        {canManage ? (
          <Pressable disabled={update.isPending} onPress={() => void save()} style={[styles.primaryButton, update.isPending && styles.disabled]}>
            {update.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Änderungen speichern</Text>}
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.grid, compact && styles.gridCompact]}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Stammdaten</Text>
          <Field disabled={!canManage} label="Rechtlicher Name" value={form.legalName} onChange={(value) => setFormValue(setForm, "legalName", value)} />
          <Field disabled={!canManage} label="Anzeigename" value={form.displayName} onChange={(value) => setFormValue(setForm, "displayName", value)} />
          <Field disabled={!canManage} label="Domain (optional)" value={form.domain ?? ""} onChange={(value) => setFormValue(setForm, "domain", value)} />
          <View style={styles.twoColumns}>
            <Field disabled={!canManage} grow label="Vorname" value={form.contactFirstName} onChange={(value) => setFormValue(setForm, "contactFirstName", value)} />
            <Field disabled={!canManage} grow label="Nachname" value={form.contactLastName} onChange={(value) => setFormValue(setForm, "contactLastName", value)} />
          </View>
          <Field disabled={!canManage} label="Kontakt-E-Mail" value={form.contactEmail} onChange={(value) => setFormValue(setForm, "contactEmail", value)} />
          <Field disabled={!canManage} label="Telefon" value={form.contactPhone} onChange={(value) => setFormValue(setForm, "contactPhone", value)} />
          <Field disabled={!canManage} label="Straße und Hausnummer" value={form.street} onChange={(value) => setFormValue(setForm, "street", value)} />
          <View style={styles.twoColumns}>
            <Field disabled={!canManage} grow label="PLZ" value={form.postalCode} onChange={(value) => setFormValue(setForm, "postalCode", value)} />
            <Field disabled={!canManage} grow label="Ort" value={form.city} onChange={(value) => setFormValue(setForm, "city", value)} />
          </View>
          {formError ? <Text accessibilityRole="alert" style={styles.formError}>{formError}</Text> : null}
          {update.isError ? <Text accessibilityRole="alert" style={styles.formError}>Die Änderung konnte nicht gespeichert werden. Bitte Eingaben, Status und Berechtigung prüfen.</Text> : null}
        </View>

        <View style={[styles.sideColumn, compact && styles.sideColumnCompact]}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Onboarding</Text>
            <Meta label="Status" value={STATUS_LABEL[practice.onboarding_status]} />
            <Meta label="Profil" value={practice.practice_kind === "health" ? "Gesundheit" : "Allgemein"} />
            <Meta label="Letzte Änderung" value={new Date(practice.updated_at).toLocaleString("de-DE")} />
            {canManage && statusActions.length > 0 ? (
              <View style={styles.statusActions}>
                {statusActions.map((status) => (
                  <Pressable disabled={update.isPending || hasUnsavedChanges} key={status} onPress={() => void save(status)} style={[styles.secondaryButton, hasUnsavedChanges && styles.disabled]}>
                    <Text style={styles.secondaryButtonText}>{STATUS_LABEL[status]}</Text>
                  </Pressable>
                ))}
                {hasUnsavedChanges ? <Text style={styles.statusHint}>Bitte zuerst die Stammdaten speichern, bevor du den Status änderst.</Text> : null}
              </View>
            ) : null}
          </View>
          <View style={styles.noticeCard}>
            <Ionicons color="#147D6B" name="shield-checkmark-outline" size={22} />
            <View style={styles.noticeText}><Text style={styles.noticeTitle}>Nachvollziehbare Verwaltung</Text><Text style={styles.noticeCopy}>Änderungen werden serverseitig autorisiert und als append-only Audit-Ereignis protokolliert.</Text></View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function formFromPractice(practice: BackofficePracticeDetail): UpdatePracticeInput {
  return {
    legalName: practice.legal_name,
    displayName: practice.display_name,
    contactFirstName: practice.contact_first_name,
    contactLastName: practice.contact_last_name,
    contactEmail: practice.contact_email,
    contactPhone: practice.contact_phone,
    street: practice.street,
    postalCode: practice.postal_code,
    city: practice.city,
    countryCode: practice.country_code,
    domain: practice.domain ?? ""
  };
}

function setFormValue<K extends keyof UpdatePracticeInput>(setter: React.Dispatch<React.SetStateAction<UpdatePracticeInput | null>>, key: K, value: UpdatePracticeInput[K]) {
  setter((current) => current ? { ...current, [key]: value } : current);
}

function newMutationIds(): BackofficeMutationIds {
  return { idempotencyKey: crypto.randomUUID(), requestId: crypto.randomUUID() };
}

function Field({ disabled, grow, label, value, onChange }: { disabled: boolean; grow?: boolean; label: string; value: string; onChange: (value: string) => void }) {
  return <View style={[styles.field, grow && styles.fieldGrow]}><Text style={styles.fieldLabel}>{label}</Text><TextInput editable={!disabled} onChangeText={onChange} style={[styles.input, disabled && styles.inputDisabled]} value={value} /></View>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <View style={styles.meta}><Text style={styles.metaLabel}>{label}</Text><Text style={styles.metaValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#F4F7FB", flexGrow: 1, padding: 38 }, center: { alignItems: "center", backgroundColor: "#F4F7FB", flex: 1, justifyContent: "center", padding: 24 },
  topbar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, backButton: { alignItems: "center", flexDirection: "row", gap: 8, paddingVertical: 8 }, backText: { color: "#486581", fontSize: 14, fontWeight: "700" }, status: { backgroundColor: "#DDF5EF", borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 }, statusText: { color: "#147D6B", fontSize: 12, fontWeight: "800" },
  headingRow: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", marginTop: 30 }, headingRowCompact: { alignItems: "flex-start", flexDirection: "column", gap: 20 }, kicker: { color: "#147D6B", fontSize: 11, fontWeight: "900", letterSpacing: 1.4 }, heading: { color: "#102A43", fontSize: 34, fontWeight: "800", marginTop: 8 }, subheading: { color: "#627D98", fontSize: 14, marginTop: 5 }, primaryButton: { alignItems: "center", backgroundColor: "#147D6B", borderRadius: 9, justifyContent: "center", minHeight: 46, minWidth: 180, paddingHorizontal: 18 }, primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" }, disabled: { opacity: 0.5 },
  grid: { alignItems: "flex-start", flexDirection: "row", gap: 22, marginTop: 28 }, gridCompact: { alignItems: "stretch", flexDirection: "column" }, card: { backgroundColor: "#FFFFFF", borderColor: "#E1E8EF", borderRadius: 14, borderWidth: 1, flex: 1, padding: 24 }, cardTitle: { color: "#243B53", fontSize: 17, fontWeight: "800", marginBottom: 18 }, sideColumn: { gap: 16, width: 330 }, sideColumnCompact: { width: "100%" },
  field: { marginBottom: 14 }, fieldGrow: { flex: 1 }, fieldLabel: { color: "#486581", fontSize: 12, fontWeight: "700", marginBottom: 7 }, input: { borderColor: "#CBD5E1", borderRadius: 8, borderWidth: 1, color: "#102A43", fontSize: 14, height: 44, paddingHorizontal: 12 }, inputDisabled: { backgroundColor: "#F7F9FC", color: "#627D98" }, twoColumns: { flexDirection: "row", gap: 12 }, formError: { color: "#B42318", fontSize: 13, lineHeight: 20, marginTop: 8 },
  meta: { borderBottomColor: "#EDF2F7", borderBottomWidth: 1, paddingVertical: 12 }, metaLabel: { color: "#829AB1", fontSize: 11, fontWeight: "700", textTransform: "uppercase" }, metaValue: { color: "#334E68", fontSize: 14, fontWeight: "700", marginTop: 5 }, statusActions: { gap: 9, marginTop: 20 }, statusHint: { color: "#627D98", fontSize: 12, lineHeight: 18 }, secondaryButton: { alignItems: "center", borderColor: "#CBD5E1", borderRadius: 8, borderWidth: 1, justifyContent: "center", minHeight: 42, paddingHorizontal: 14 }, secondaryButtonText: { color: "#486581", fontSize: 13, fontWeight: "800" },
  noticeCard: { backgroundColor: "#ECF9F6", borderColor: "#B9E8DC", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 12, padding: 18 }, noticeText: { flex: 1 }, noticeTitle: { color: "#185F52", fontSize: 13, fontWeight: "800" }, noticeCopy: { color: "#39766C", fontSize: 12, lineHeight: 18, marginTop: 5 }, errorTitle: { color: "#102A43", fontSize: 24, fontWeight: "800" }, errorCopy: { color: "#627D98", fontSize: 14, marginBottom: 20, marginTop: 8, textAlign: "center" }
});
