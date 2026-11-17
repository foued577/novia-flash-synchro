// Génère supabase/seed.sql (référentiel) et supabase/demo-data.sql (jeu de démonstration)
// à partir des sources TypeScript de l'application, pour garantir la cohérence.
// Usage : npm run db:seed
import { writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const catalog = await server.ssrLoadModule('/src/data/catalog.ts')
  const demo = await server.ssrLoadModule('/src/data/demoSeed.ts')

  const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replaceAll("'", "''")}'`)
  const j = (v) => `$json$${JSON.stringify(v)}$json$::jsonb`

  // ----- Référentiel ----------------------------------------------------------
  const services = catalog.defaultServices()
  const templates = catalog.defaultTemplates()
  let seed = `-- =============================================================================
-- NOVIA Flash Synchro — Référentiel initial (généré par scripts/generate-seed.mjs)
-- Paramètres, services (couleurs et durées de la présentation historique)
-- et modèles de diapositives. Les responsables sont rattachés ensuite.
-- =============================================================================

insert into public.app_settings (id, settings)
values (1, ${j(catalog.DEFAULT_SETTINGS)})
on conflict (id) do update set settings = excluded.settings;

insert into public.services (id, slug, name, short_name, palette, icon, duration_minutes, position, active, description) values
${services
  .map((s) => `  (${q(s.id)}, ${q(s.slug)}, ${q(s.name)}, ${q(s.shortName)}, ${j(s.palette)}, ${q(s.icon)}, ${s.durationMinutes}, ${s.position}, true, ${q(s.description)})`)
  .join(',\n')}
on conflict (id) do nothing;

insert into public.slide_templates (id, service_id, kind, title, position, blocks) values
${templates.map((t) => `  (${q(t.id)}, ${q(t.serviceId)}, ${q(t.kind)}, ${q(t.title)}, ${t.position}, ${j(t.blocks)})`).join(',\n')}
on conflict (id) do nothing;
`
  writeFileSync('supabase/seed.sql', seed)

  // ----- Jeu de démonstration --------------------------------------------------
  const data = demo.generateDemoData()
  const meetings = data.snapshot.meetings
  let out = `-- =============================================================================
-- NOVIA Flash Synchro — Jeu de démonstration (facultatif)
-- 7 réunions réalistes (dont une période de 2 semaines), statuts et contenus.
-- À exécuter APRÈS seed.sql. Les dates sont celles du jour de génération.
-- =============================================================================

`
  for (const m of meetings) {
    const b = data.bundles[m.id]
    out += `-- Semaine ${m.isoWeek} (${m.isoYear})
insert into public.meetings (id, iso_year, iso_week, week_start, week_end, review_weeks, forecast_reference, meeting_date, meeting_time, status, title, notes, durations, participants, timing)
values (${q(m.id)}, ${m.isoYear}, ${m.isoWeek}, ${q(m.weekStart)}, ${q(m.weekEnd)}, ${m.reviewWeeks}, ${q(m.forecastReference)}, ${q(m.meetingDate)}, ${q(m.meetingTime)}, ${q(m.status)}, ${q(m.title)}, ${q(m.notes)}, ${j(m.durations)}, array[${m.participants.map((p) => `${q(p)}::uuid`).join(', ')}], ${m.timing ? j(m.timing) : 'null'})
on conflict (iso_year, iso_week) do nothing;

insert into public.submissions (id, meeting_id, service_id, status, comment, submitted_at, validated_at) values
${b.submissions.map((s) => `  (${q(s.id)}, ${q(s.meetingId)}, ${q(s.serviceId)}, ${q(s.status)}, ${q(s.comment)}, ${q(s.submittedAt)}, ${q(s.validatedAt)})`).join(',\n')}
on conflict do nothing;

insert into public.slides (id, meeting_id, service_id, kind, title, subtitle, position, hidden, blocks, notes) values
${b.slides.map((s) => `  (${q(s.id)}, ${q(s.meetingId)}, ${q(s.serviceId)}, ${q(s.kind)}, ${q(s.title)}, ${q(s.subtitle)}, ${s.position}, ${s.hidden}, ${j(s.blocks)}, ${q(s.notes)})`).join(',\n')}
on conflict do nothing;

`
  }
  writeFileSync('supabase/demo-data.sql', out)
  console.log(`seed.sql : ${services.length} services, ${templates.length} modèles — demo-data.sql : ${meetings.length} réunions`)
} finally {
  await server.close()
}
