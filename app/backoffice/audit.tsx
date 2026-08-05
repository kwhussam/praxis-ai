import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";

import { listBackofficeAuditEvents } from "@/lib/backoffice/api";
import { getBackofficeAuthState } from "@/lib/backoffice/auth";
import type { BackofficeAuditEvent, BackofficeAuditPage } from "@/lib/backoffice/types";

const RESULT_LABEL: Record<string, string> = { success: "Erfolgreich", denied: "Abgelehnt", failure: "Fehlgeschlagen" };

export default function BackofficeAuditScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 900;
  const [authReady, setAuthReady] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    void getBackofficeAuthState().then((state) => {
      if (state === "signed_out") router.replace("/backoffice/login" as never);
      else if (state === "aal1") router.replace("/backoffice/mfa" as never);
      else setAuthReady(true);
    }).catch(() => router.replace("/backoffice/login" as never));
  }, [router]);

  const audit = useInfiniteQuery<BackofficeAuditPage>({
    queryKey: ["backoffice-audit"],
    queryFn: ({ pageParam }) => listBackofficeAuditEvents({ offset: pageParam as number, limit: 50 }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.page.nextOffset ?? undefined,
    enabled: authReady
  });
  const events = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("de-DE");
    const rows = audit.data?.pages.flatMap((page) => page.events) ?? [];
    if (!needle) return rows;
    return rows.filter((event) => [event.action, event.target_type, event.result, event.practice_id, event.request_id]
      .some((value) => value?.toLocaleLowerCase("de-DE").includes(needle)));
  }, [audit.data, search]);

  if (Platform.OS !== "web") return <View style={styles.center}><Text>Das Backoffice ist nur im Web verfügbar.</Text></View>;
  if (!authReady) return <View style={styles.center}><ActivityIndicator color="#147D6B" /></View>;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable accessibilityRole="link" onPress={() => router.replace("/backoffice" as never)} style={styles.back}>
        <Ionicons color="#486581" name="arrow-back" size={18} /><Text style={styles.backText}>Praxen</Text>
      </Pressable>
      <View style={[styles.header, compact && styles.headerCompact]}>
        <View><Text style={styles.kicker}>NACHVOLLZIEHBARE VERWALTUNG</Text><Text style={styles.heading}>Audit-Protokoll</Text><Text style={styles.copy}>Sicherheitsrelevante Backoffice-Aktionen im zulässigen Praxis-Scope.</Text></View>
        <View style={styles.searchBox}><Ionicons color="#829AB1" name="search" size={18} /><TextInput onChangeText={setSearch} placeholder="Aktion, Ergebnis, Praxis- oder Request-ID" placeholderTextColor="#829AB1" style={styles.searchInput} value={search} /></View>
      </View>
      <View style={styles.retentionNotice}><Ionicons color="#147D6B" name="information-circle-outline" size={22} /><Text style={styles.retentionText}>Personenbezogene Audit-Daten werden sechs Monate aufbewahrt und danach automatisch irreversibel anonymisiert. Aktive dokumentierte Aufbewahrungssperren bleiben davon ausgenommen.</Text></View>
      <View style={styles.card}>
        {audit.isLoading ? <ActivityIndicator color="#147D6B" style={styles.loader} /> : null}
        {audit.isError ? <View style={styles.empty}><Text style={styles.errorTitle}>Audit-Protokoll nicht verfügbar</Text><Text style={styles.emptyText}>Deine Rolle besitzt möglicherweise keine Audit-Berechtigung oder die Verbindung ist fehlgeschlagen.</Text></View> : null}
        {!audit.isLoading && !audit.isError && events.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>Keine Ereignisse gefunden</Text><Text style={styles.emptyText}>Passe die Suche an oder führe zuerst eine Backoffice-Aktion aus.</Text></View> : null}
        {events.map((event) => <AuditRow compact={compact} event={event} key={event.id} />)}
        {audit.hasNextPage ? <Pressable disabled={audit.isFetchingNextPage} onPress={() => void audit.fetchNextPage()} style={styles.loadMore}><Text style={styles.loadMoreText}>{audit.isFetchingNextPage ? "Weitere Ereignisse werden geladen …" : "Weitere Ereignisse laden"}</Text></Pressable> : null}
      </View>
    </ScrollView>
  );
}

function AuditRow({ compact, event }: { compact: boolean; event: BackofficeAuditEvent }) {
  const result = RESULT_LABEL[event.result] ?? event.result;
  return <View style={[styles.row, compact && styles.rowCompact]}><View style={styles.eventMain}><View style={[styles.resultDot, event.result !== "success" && styles.resultDotWarning]} /><View><Text style={styles.action}>{humanize(event.action)}</Text><Text style={styles.target}>{humanize(event.target_type)}{event.target_id ? ` · ${shortId(event.target_id)}` : ""}</Text></View></View><View style={styles.meta}><Text style={styles.metaPrimary}>{result}</Text><Text style={styles.metaSecondary}>{new Date(event.created_at).toLocaleString("de-DE")}</Text></View><View style={styles.meta}><Text style={styles.metaPrimary}>{event.practice_id ? `Praxis ${shortId(event.practice_id)}` : "Plattformweit"}</Text><Text style={styles.metaSecondary}>{event.request_id ? `Request ${shortId(event.request_id)}` : "Keine Request-ID"}</Text></View></View>;
}

function humanize(value: string) { return value.replace(/[._-]+/g, " ").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()); }
function shortId(value: string) { return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value; }

const styles = StyleSheet.create({
  page: { backgroundColor: "#F4F7FB", flexGrow: 1, padding: 38 }, center: { alignItems: "center", backgroundColor: "#F4F7FB", flex: 1, justifyContent: "center", padding: 24 }, back: { alignItems: "center", flexDirection: "row", gap: 8, paddingVertical: 8 }, backText: { color: "#486581", fontSize: 14, fontWeight: "700" },
  header: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", marginTop: 24 }, headerCompact: { alignItems: "stretch", flexDirection: "column", gap: 20 }, kicker: { color: "#147D6B", fontSize: 11, fontWeight: "900", letterSpacing: 1.4 }, heading: { color: "#102A43", fontSize: 34, fontWeight: "800", marginTop: 8 }, copy: { color: "#627D98", fontSize: 14, marginTop: 5 }, searchBox: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#CBD5E1", borderRadius: 9, borderWidth: 1, flexDirection: "row", gap: 8, minWidth: 360, paddingHorizontal: 12 }, searchInput: { color: "#102A43", flex: 1, fontSize: 13, height: 44 },
  retentionNotice: { alignItems: "flex-start", backgroundColor: "#ECF9F6", borderColor: "#B9E8DC", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 12, marginTop: 26, padding: 16 }, retentionText: { color: "#39766C", flex: 1, fontSize: 12, lineHeight: 19 }, card: { backgroundColor: "#FFFFFF", borderColor: "#E1E8EF", borderRadius: 14, borderWidth: 1, marginTop: 18, overflow: "hidden" }, loader: { margin: 40 }, loadMore: { alignItems: "center", borderTopColor: "#EDF2F7", borderTopWidth: 1, padding: 18 }, loadMoreText: { color: "#147D6B", fontSize: 13, fontWeight: "800" }, row: { alignItems: "center", borderBottomColor: "#EDF2F7", borderBottomWidth: 1, flexDirection: "row", gap: 24, justifyContent: "space-between", padding: 18 }, rowCompact: { alignItems: "flex-start", flexDirection: "column", gap: 10 }, eventMain: { alignItems: "center", flex: 1, flexDirection: "row", gap: 12 }, resultDot: { backgroundColor: "#24A68B", borderRadius: 99, height: 9, width: 9 }, resultDotWarning: { backgroundColor: "#D9822B" }, action: { color: "#243B53", fontSize: 14, fontWeight: "800" }, target: { color: "#829AB1", fontSize: 11, marginTop: 4 }, meta: { minWidth: 190 }, metaPrimary: { color: "#486581", fontSize: 12, fontWeight: "700" }, metaSecondary: { color: "#9FB3C8", fontSize: 11, marginTop: 4 }, empty: { alignItems: "center", padding: 48 }, emptyTitle: { color: "#334E68", fontSize: 16, fontWeight: "800" }, errorTitle: { color: "#B42318", fontSize: 16, fontWeight: "800" }, emptyText: { color: "#829AB1", fontSize: 13, marginTop: 7, textAlign: "center" }
});
