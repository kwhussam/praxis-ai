# RLS Partner Role Matrix

This matrix documents the server-side access model enforced by `public.can_access_practice(user_id, practice_id, required_role)`.

Required-role order (`partner_role_rank`, unchanged):

`viewer(10) < white_label(20) < manager(30) < owner(40)`

Access is granted when any of the following holds for the practice:

1. the user is the direct `practices.owner_id` (satisfies every required role), or
2. the user has an **active `public.practice_memberships` row** whose `practice_member_role_rank` meets the required role, or
3. the user has a `public.partner_practices` row **with role `white_label`** meeting the required role.

Practice-membership rank (`practice_member_role_rank`, B1a — coarse RLS read gate only, not an action-permission model):

`viewer(10) < assessor(20) < practice_manager(30) < practice_owner(40)`

**B1a authorization cutover:** since B1a, `can_access_practice` no longer treats non-`white_label` `partner_practices` rows as an access source. Those grants were migrated into `practice_memberships` (owner→practice_owner, manager→practice_manager, viewer→viewer) so that revoking a membership actually removes access (no dual-source). Legacy `partner_practices` rows may persist for a transition but only `white_label` is still an effective grant. Action-level permissions (`assessment.execute`, `practice.manage`, `membership.manage`, `report.read`) are deferred to capability enforcement in B2 and are not encoded in the rank.

| Resource | Action | Required role | Notes |
| --- | --- | --- | --- |
| `practices` | Read own/shared practice | `viewer` | Direct owner or granted partner can read the practice row. |
| `practices` | Create/update practice tenant link | Direct owner only | `white_label_partner_id` must belong to the same authenticated owner. |
| `security_checks` | Read | `viewer` | Covers direct `practice_id` filters and IDOR attempts through guessed check IDs. |
| `security_checks` | Insert/update | `manager` | Existing permissive owner policies still control whether writes are reachable. |
| `reports` | Read | `viewer` | Also requires `reports.check_id` to belong to the same `practice_id` when present. |
| `reports` | Insert/update | `manager` | Also requires `reports.check_id` to belong to the same `practice_id` when present. |
| `monitoring_events` | Read | `viewer` | Blocks exchanged `practice_id` access. |
| `monitoring_events` | Write | `manager` | Intended for server-side workflows. |
| `monitoring_snapshots` | Read | `viewer` | Blocks exchanged `snapshot_id` access through the row's `practice_id`. |
| `monitoring_snapshots` | Write | `manager` | Intended for server-side workflows. |
| `wlan_scans` | Read | `viewer` | Blocks exchanged scan IDs through the row's `practice_id`. |
| `wlan_scans` | Write | `manager` | Existing permissive owner policies still control whether writes are reachable. |
| `external_check_usage` | Read | `viewer` plus same `user_id` | Prevents a matching user from reading usage rows for an unshared practice. |
| `external_check_usage` | Write | `manager` plus same `user_id` | Intended for server-side quota workflows. |
| `ai_report_usage` | Read | `viewer` plus same `user_id` | Prevents a matching user from reading Anthropic quota rows for an unshared practice. |
| `ai_report_usage` | Write | Service role only | Intended for server-side AI report quota workflows via `consume_ai_report_quota`. |
| `practice_access_audit` | Read | `viewer` plus same `user_id` | Users can only read their own audit rows for accessible practices. |
| `practice_access_audit` | Write | `manager` plus same `user_id` | Sensitive partner access should be logged by Worker/RPC using `audit_partner_practice_access`. |
| `data_processing_agreements` | Read | `viewer` plus same `user_id` | Prevents user/practice mismatch leakage. |
| `data_processing_agreements` | Write | `manager` plus same `user_id` | Intended for server-side agreement workflows. |
| `deletion_requests` | Read | `viewer` plus same `user_id` | Prevents user/practice mismatch leakage. |
| `deletion_requests` | Write | `manager` plus same `user_id` | Intended for server-side deletion workflows. |
| `partner_plan_pricing` | Read/write | Partner profile owner | Bound to `white_label_partners.owner_id`, not a practice grant. |
| `consent_log` | Read | `viewer` | Practice-scoped. |
| `consent_log` | Write | `manager` | Intended for server-side consent workflows. |
| `partner_practices` | Read | Self grant or practice owner | Partners can see their own grants; practice owners can manage grants. |
| `partner_practices` | Create/update/delete | Practice owner | Partners cannot self-grant access to arbitrary practices. |
| `email_outbox` | Any | No policy | Deny-by-default. Server-side delivery only. |
| `inventory_items` | Read | `viewer` | pgTAP-covered (DB-03): owner A ↛ practice B, viewer-partner read-only. |
| `inventory_items` | Write | `manager` | pgTAP-covered (DB-03): viewer-partner insert denied. |
| `monitoring_targets` | Read | `viewer` | pgTAP-covered (DB-03): owner A ↛ practice B, viewer-partner read-only. |
| `monitoring_targets` | Write | `manager` | pgTAP-covered (DB-03): viewer-partner insert denied. |
| `inventory_known_devices` | Read | `viewer` | Same tenant-guard pattern as `inventory_items`; not yet pgTAP-covered. |
| `inventory_known_devices` | Write | `manager` | Same tenant-guard pattern as `inventory_items`; not yet pgTAP-covered. |
| `inventory_access_points` | Read | `viewer` | Same tenant-guard pattern as `inventory_items`; not yet pgTAP-covered. |
| `inventory_access_points` | Write | `manager` | Same tenant-guard pattern as `inventory_items`; not yet pgTAP-covered. |
| `router_wifi_configurations` | Read | `viewer` | Same tenant-guard pattern as `inventory_items`; not yet pgTAP-covered. |
| `router_wifi_configurations` | Write | `manager` | Same tenant-guard pattern as `inventory_items`; not yet pgTAP-covered. |
| `router_firewall_rules` | Read | `viewer` | Same tenant-guard pattern as `inventory_items`; not yet pgTAP-covered. |
| `router_firewall_rules` | Write | `manager` | Same tenant-guard pattern as `inventory_items`; not yet pgTAP-covered. |
| `practice_memberships` (B1a) | Read | Self or `manager` of the practice | Users read their own memberships; practice managers read all rows of the practice. |
| `practice_memberships` (B1a) | Create/update/revoke | `owner` of the practice | Server-side/service_role in practice. Last active `practice_owner` is protected by a trigger; ownership transfer via `transfer_practice_ownership` RPC (service_role only). pgTAP-covered: membership grant, revocation removes access, non-white_label partner alone denied, white_label retained, last-owner guard. |
| `platform_staff` (B1a) | Read | Self row only | Authoritative platform-staff identity; management is service_role only. `current_user_platform_role()` exposes the caller's active role. |
| `staff_practice_assignments` (B1a) | Read | Self (`staff_user_id`) | Limits a `security_consultant` to explicitly assigned practices; management is service_role only. |
| `practice_invitations` (B1a) | Read | `manager` of the practice | Stores only a hash/provider `proof_reference`, never a cleartext code. Creation/acceptance is service_role only. |
| `backoffice_audit_events` (B1a/B1b) | Read | `platform_admin` / assigned `security_consultant` | Append-only: no UPDATE/DELETE grant to regular roles; inserts via service_role only. After at least 183 days, a service-role-only bounded RPC irreversibly removes direct/indirect identifiers unless an active documented legal hold applies. |

Audit note:

RLS policies do not perform audit inserts during raw `SELECT` evaluation. Sensitive partner-mediated Worker/RPC flows must explicitly call `public.audit_partner_practice_access(user_id, practice_id, action, resource, metadata)` after authorization succeeds. The function writes to the existing `public.practice_access_audit` table only when the user is a partner grant holder rather than the direct practice owner.
