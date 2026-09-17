select jsonb_build_object(
  'practice', jsonb_build_object('name', p.name, 'domain', p.domain),
  'report', to_jsonb(r),
  'assessment_manifest', to_jsonb(m)
)
from public.reports r
join public.assessment_manifests m on m.id = r.assessment_manifest_id
join public.practices p on p.id = r.practice_id
where r.id = 'a2400000-0000-4000-8000-000000000001';
