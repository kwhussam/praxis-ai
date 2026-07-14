# RLS Partner Role Matrix

This matrix documents the server-side access model enforced by `public.can_access_practice(user_id, practice_id, required_role)`.

Role order:

`viewer < white_label < manager < owner`

Direct practice owners satisfy every required role for their own practice. Partner users only satisfy access through rows in `public.partner_practices`.

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

Audit note:

RLS policies do not perform audit inserts during raw `SELECT` evaluation. Sensitive partner-mediated Worker/RPC flows must explicitly call `public.audit_partner_practice_access(user_id, practice_id, action, resource, metadata)` after authorization succeeds. The function writes to the existing `public.practice_access_audit` table only when the user is a partner grant holder rather than the direct practice owner.
