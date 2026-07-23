# PERF-04 / PERF-08 / PERF-09 — Index-Validierung (EXPLAIN ANALYZE)

Belegt die drei Index-Migrationen aus Phase 6:

- `supabase/migrations/20260722100000_perf_monitoring_targets_domain_index.sql` (PERF-04)
- `supabase/migrations/20260722101000_perf_security_checks_history_index.sql` (PERF-08)
- `supabase/migrations/20260722102000_perf_reports_list_index.sql` (PERF-09)

## Methodik

Der lokale Seed (`supabase db reset` + seed) enthält nur 3 `practices` / 2 `security_checks` / 0 `reports`
— bei dieser Zeilenzahl wählt der Planner immer einen Seq Scan, unabhängig vom Index, sodass ein
Vorher/Nachher-Vergleich auf den Seed-Tabellen nichts aussagt. Die Messungen unten wurden daher auf
temporären Tabellen mit identischer Spalten-/Index-/Query-Form und realistischer Zeilenzahl innerhalb
einer `begin; … rollback;`-Transaktion durchgeführt (keine Persistenz, keine Produktionsdaten). Alle
Läufe mit `explain (analyze, buffers, costs off)`.

---

## PERF-04 — `practices (domain) where domain is not null`

Query: `select id, domain, email from practices where domain is not null;` (aus `fetchMonitoringTargets`).

**Wichtiger Befund zur Selektivität:** Ein partieller Index auf `domain is not null` beschleunigt die
Bulk-Query **nur, wenn Nicht-NULL-Domains eine Minderheit sind**. Sind die meisten Zeilen Nicht-NULL
(hier 75 %), bleibt der Seq Scan die korrekte Wahl — ein Indexscan über 75 % der Tabelle wäre langsamer,
und der Planner ignoriert den Index bewusst. Der Index hilft dort weiterhin für Punkt-Lookups
(`domain = '…'`).

Realistisch (frühe Praxen ohne konfigurierte Domain überwiegen → Nicht-NULL ist Minderheit), 100k Zeilen,
5 % mit Domain:

```
--- BEFORE ---
Seq Scan on t_practices (actual rows=5000)
  Filter: (domain IS NOT NULL)
  Rows Removed by Filter: 95000
  Buffers: local hit=20 read=1022

--- AFTER (partial index) ---
Bitmap Heap Scan on t_practices (actual rows=5000)
  Recheck Cond: (domain IS NOT NULL)
  ->  Bitmap Index Scan on t_practices_domain_not_null_idx (actual rows=5000)
        Buffers: local read=26
```

Punkt-Lookup (immer profitierend):

```
--- AFTER: where domain = 'domain5001.example' ---
Index Scan using t_practices_domain_not_null_idx (actual rows=1)
  Index Cond: (domain = 'domain5001.example'::text)
  Buffers: local read=4     (vs. Seq Scan mit ~1177 Buffers)
```

Fazit: Index ist gerechtfertigt (Punkt-Lookups + Bulk-Query solange Domains die Minderheit sind).
Bei künftig hohem Domain-Füllgrad trägt v. a. die noch offene **Cron-Pagination**-Folgearbeit
(siehe Migrationskommentar) — der Index ersetzt sie nicht.

---

## PERF-08 — `security_checks (practice_id, completed_at desc)`

Query: `... where practice_id = $1 order by completed_at desc limit 30;` (ungetypte History in `handleDashboard`).
Vorher existiert nur der Composite `(practice_id, type, completed_at desc)`. 500 Praxen × 200 Checks.

```
--- BEFORE (nur (practice_id, type, completed_at desc)) ---
Limit (actual rows=30)  Buffers: local hit=190 read=15
  ->  Sort (top-N heapsort)                 <-- expliziter Sort
        ->  Bitmap Heap Scan (actual rows=200)   <-- liest ALLE 200 Zeilen der Praxis
              ->  Bitmap Index Scan on t_sc_practice_type_completed_idx (rows=200)

--- AFTER (+ (practice_id, completed_at desc)) ---
Limit (actual rows=30)  Buffers: local hit=19 read=15
  ->  Index Scan using t_sc_practice_completed_idx (actual rows=30)   <-- nur 30 Zeilen, kein Sort
```

Fazit: Sort-Schritt entfällt, gelesene Zeilen 200 → 30, Buffers 205 → 34. Klare Verbesserung.

---

## PERF-09 — `reports (practice_id, anonymized_at, created_at desc)`

Query: `... where practice_id = $1 and anonymized_at is null order by created_at desc limit 30;` (`handleReportsList`).
Vorher existiert nur `reports_practice_id_idx (practice_id)`. 500 Praxen × 200 Reports, 20 % anonymisiert.

```
--- BEFORE (nur single-column practice_id) ---
Bitmap Heap Scan (actual rows=160)
  Filter: (anonymized_at IS NULL)
  Rows Removed by Filter: 40          <-- Nachfilterung im Heap
  Heap Blocks: exact=200
  ->  Bitmap Index Scan on t_reports_practice_id_idx (rows=200)

--- AFTER (+ (practice_id, anonymized_at, created_at desc)) ---
Bitmap Heap Scan (actual rows=160)
  Recheck Cond: ((practice_id = $1) AND (anonymized_at IS NULL))   <-- Filter im Index
  Heap Blocks: exact=160
  ->  Bitmap Index Scan on t_reports_practice_anon_created_idx (rows=160)
```

Fazit: `anonymized_at`-Filter wandert in die Index-Bedingung (keine `Rows Removed by Filter` mehr),
Heap Blocks 200 → 160. Moderate, aber reale Verbesserung — konsistent mit der „Low"-Severity des Findings
(heute durch `FREE_PLAN_DAILY_AI_REPORT_LIMIT` natürlich begrenzt, relevanter für Paid-Nutzer über Zeit).
