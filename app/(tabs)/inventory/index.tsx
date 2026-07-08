import { useEffect, useMemo, useState } from "react";
import { Building2, Globe, Mail, Network, Package, Plus, Server, Smartphone, Trash2 } from "lucide-react-native";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { summarizeInventory } from "@/lib/inventory/inventory";
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CRITICALITIES,
  inventoryCategoryLabel,
  inventoryCategoryPluralLabel,
  inventoryCriticalityLabel,
  type InventoryCriticality,
  type InventoryItem,
  type InventoryItemType
} from "@/lib/inventory/types";
import { useInventoryStore } from "@/lib/store/inventory";
import { useSessionStore } from "@/lib/store/session";

type FilterType = InventoryItemType | "all";

const iconByType: Record<InventoryItemType, typeof Smartphone> = {
  device: Smartphone,
  network: Network,
  domain: Globe,
  subdomain: Globe,
  email: Mail,
  provider: Building2,
  critical_system: Server
};

const criticalityColors: Record<InventoryCriticality, string> = {
  critical: colors.critical,
  high: colors.warning,
  medium: colors.electric,
  low: colors.safe
};

export default function InventoryScreen() {
  const practice = useSessionStore((state) => state.practice);
  const ensurePracticeInventory = useInventoryStore((state) => state.ensurePracticeInventory);
  const items = useInventoryStore((state) => state.getItems(practice?.id));
  const addItem = useInventoryStore((state) => state.addItem);
  const removeItem = useInventoryStore((state) => state.removeItem);
  const [filter, setFilter] = useState<FilterType>("all");
  const [draftType, setDraftType] = useState<InventoryItemType>("device");
  const [draftCriticality, setDraftCriticality] = useState<InventoryCriticality>("medium");
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [owner, setOwner] = useState("");

  useEffect(() => {
    ensurePracticeInventory(practice);
  }, [ensurePracticeInventory, practice]);

  const summary = useMemo(() => summarizeInventory(items), [items]);
  const visibleItems = useMemo(
    () => items.filter((item) => filter === "all" || item.type === filter).sort(sortInventoryItems),
    [filter, items]
  );

  function handleAdd() {
    if (!practice) return;
    const normalizedName = name.trim();
    if (!normalizedName) {
      Alert.alert("Inventar", "Bitte einen Namen eintragen.");
      return;
    }

    addItem(practice.id, {
      type: draftType,
      name: normalizedName,
      detail,
      owner,
      criticality: draftCriticality
    });
    setName("");
    setDetail("");
    setOwner("");
    setFilter(draftType);
  }

  function handleRemove(item: InventoryItem) {
    if (!practice) return;
    removeItem(practice.id, item.id);
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>Praxis-Inventar</Text>
          <Text style={styles.title}>{practice?.name ?? "Praxis"}</Text>
        </View>
        <View style={styles.headerIcon}>
          <Package color={colors.electric} size={24} />
        </View>
      </View>

      <View style={styles.metrics}>
        <Metric label="Einträge" value={summary.total} />
        <Metric label="Kritisch" value={summary.critical} tone="critical" />
      </View>

      <View style={styles.filters}>
        <FilterChip label="Alle" active={filter === "all"} onPress={() => setFilter("all")} />
        {INVENTORY_CATEGORIES.map((category) => (
          <FilterChip
            key={category.type}
            label={`${category.pluralLabel} ${summary.byType[category.type]}`}
            active={filter === category.type}
            onPress={() => setFilter(category.type)}
          />
        ))}
      </View>

      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Neuer Eintrag</Text>
        <View style={styles.segmentWrap}>
          {INVENTORY_CATEGORIES.map((category) => (
            <Pressable
              key={category.type}
              onPress={() => setDraftType(category.type)}
              style={[styles.segment, draftType === category.type ? styles.segmentActive : null]}
            >
              <Text style={[styles.segmentText, draftType === category.type ? styles.segmentTextActive : null]}>
                {category.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={`${inventoryCategoryLabel(draftType)} erfassen`}
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <TextInput
          value={detail}
          onChangeText={setDetail}
          placeholder="Details, Adresse, Zweck oder Standort"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <TextInput
          value={owner}
          onChangeText={setOwner}
          placeholder="Verantwortlich oder Dienstleister"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />

        <View style={styles.segmentWrap}>
          {INVENTORY_CRITICALITIES.map((criticality) => (
            <Pressable
              key={criticality.value}
              onPress={() => setDraftCriticality(criticality.value)}
              style={[styles.segment, draftCriticality === criticality.value ? styles.segmentActive : null]}
            >
              <Text style={[styles.segmentText, draftCriticality === criticality.value ? styles.segmentTextActive : null]}>
                {criticality.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <AnimatedButton label="Eintrag hinzufügen" onPress={handleAdd} icon={<Plus color={colors.ink} size={18} />} />
      </GlassCard>

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>{filter === "all" ? "Inventar" : inventoryCategoryPluralLabel(filter)}</Text>
        <Text style={styles.count}>{visibleItems.length}</Text>
      </View>

      <View style={styles.list}>
        {visibleItems.length === 0 ? (
          <GlassCard>
            <Text style={styles.emptyTitle}>Keine Einträge</Text>
          </GlassCard>
        ) : (
          visibleItems.map((item) => <InventoryRow key={item.id} item={item} onRemove={() => handleRemove(item)} />)
        )}
      </View>
    </Screen>
  );
}

function Metric({ label, value, tone = "info" }: { label: string; value: number; tone?: "critical" | "info" }) {
  return (
    <GlassCard style={styles.metricCard} tone={tone === "critical" ? "critical" : undefined}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </GlassCard>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.filterChip, active ? styles.filterChipActive : null]}>
      <Text style={[styles.filterText, active ? styles.filterTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function InventoryRow({ item, onRemove }: { item: InventoryItem; onRemove: () => void }) {
  const Icon = iconByType[item.type];
  const criticalityColor = criticalityColors[item.criticality];

  return (
    <GlassCard style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <View style={styles.itemIcon}>
          <Icon color={colors.electric} size={20} />
        </View>
        <View style={styles.itemText}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemMeta}>{inventoryCategoryLabel(item.type)}</Text>
        </View>
        <Pressable onPress={onRemove} style={styles.deleteButton}>
          <Trash2 color={colors.muted} size={18} />
        </Pressable>
      </View>
      {item.detail ? <Text style={styles.itemDetail}>{item.detail}</Text> : null}
      <View style={styles.itemFooter}>
        <View style={[styles.criticalityBadge, { borderColor: criticalityColor }]}>
          <Text style={[styles.criticalityText, { color: criticalityColor }]}>{inventoryCriticalityLabel(item.criticality)}</Text>
        </View>
        {item.owner ? <Text style={styles.owner}>{item.owner}</Text> : null}
      </View>
    </GlassCard>
  );
}

function sortInventoryItems(left: InventoryItem, right: InventoryItem) {
  const leftCriticality = INVENTORY_CRITICALITIES.findIndex((criticality) => criticality.value === left.criticality);
  const rightCriticality = INVENTORY_CRITICALITIES.findIndex((criticality) => criticality.value === right.criticality);
  if (leftCriticality !== rightCriticality) return leftCriticality - rightCriticality;
  return left.name.localeCompare(right.name, "de");
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20
  },
  kicker: {
    color: colors.electric,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "900",
    marginTop: 6
  },
  headerIcon: {
    alignItems: "center",
    backgroundColor: colors.electricSoft,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  metrics: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16
  },
  metricCard: {
    flex: 1
  },
  metricValue: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: "900"
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 4
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16
  },
  filterChip: {
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  filterChipActive: {
    backgroundColor: colors.electric,
    borderColor: colors.electric
  },
  filterText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  filterTextActive: {
    color: colors.ink
  },
  card: {
    marginBottom: 18
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900"
  },
  segmentWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  segment: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  segmentActive: {
    backgroundColor: colors.glassStrong,
    borderColor: colors.electric
  },
  segmentText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  segmentTextActive: {
    color: colors.ink
  },
  input: {
    backgroundColor: colors.glass,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    marginTop: 12,
    minHeight: 48,
    paddingHorizontal: 14
  },
  listHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12
  },
  count: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "900"
  },
  list: {
    gap: 12
  },
  emptyTitle: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "800"
  },
  itemCard: {
    marginBottom: 0
  },
  itemHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  itemIcon: {
    alignItems: "center",
    backgroundColor: colors.electricSoft,
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  itemText: {
    flex: 1
  },
  itemName: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900"
  },
  itemMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4
  },
  deleteButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  itemDetail: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12
  },
  itemFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    marginTop: 14
  },
  criticalityBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  criticalityText: {
    fontSize: 11,
    fontWeight: "900"
  },
  owner: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right"
  }
});
