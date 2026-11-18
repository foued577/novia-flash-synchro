import { clsx } from 'clsx'
import { ArrowDown, ArrowUp, Database, Download, Plus, RefreshCcw, Trash2, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button, IconButton } from '@/components/ui/Button'
import { confirmAction } from '@/components/ui/Dialog'
import { Field, Select, Stepper, Switch } from '@/components/ui/Form'
import { PageHeader, ServiceIcon, SERVICE_ICONS } from '@/components/ui/Misc'
import { env } from '@/config/env'
import { getRepository } from '@/data'
import { PALETTE_LABELS, SERVICE_PALETTES, type PaletteKey } from '@/data/catalog'
import { FORECAST_REFERENCE_LABELS, SLIDE_KIND_LABELS } from '@/domain/periods'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/domain/status'
import type { AppSettings, AppUser, ForecastReference, Role, Service, ServiceIcon as ServiceIconKey, SlideKind, SlideTemplate } from '@/domain/types'
import { slugify } from '@/lib/files'
import { saveFile } from '@/lib/platform'
import { WEEKDAY_LABELS } from '@/lib/format'
import { uid } from '@/lib/ids'
import { useServices } from '@/store/hooks'
import { useAppStore } from '@/store/useAppStore'

type Tab = 'meeting' | 'services' | 'templates' | 'users' | 'data'

const TABS: { key: Tab; label: string }[] = [
  { key: 'meeting', label: 'Réunion et chronomètre' },
  { key: 'services', label: 'Services' },
  { key: 'templates', label: 'Modèles de diapositives' },
  { key: 'users', label: 'Utilisateurs et rôles' },
  { key: 'data', label: 'Données' },
]

function MeetingSettings() {
  const settings = useAppStore((s) => s.snapshot!.settings)
  const saveSettings = useAppStore((s) => s.saveSettings)
  const set = (patch: Partial<AppSettings>) => void saveSettings({ ...settings, ...patch })
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="panel space-y-5 p-5 sm:p-6">
        <h2 className="text-[17px] font-bold">Rythme de la réunion</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Jour de la réunion">
            <Select value={settings.meetingWeekday} onChange={(e) => set({ meetingWeekday: Number(e.target.value) })}>
              {WEEKDAY_LABELS.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Heure de début">
            <input type="time" className="field" value={settings.meetingTime} onChange={(e) => e.target.value && set({ meetingTime: e.target.value })} />
          </Field>
        </div>
        <Field label="Semaine des prévisions" hint="S-1 correspond toujours à la semaine précédant la réunion.">
          <Select value={settings.forecastReference} onChange={(e) => set({ forecastReference: e.target.value as ForecastReference })}>
            {Object.entries(FORECAST_REFERENCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <span className="label">Date limite de saisie</span>
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink-2">
            <Stepper label="Jours avant la réunion" value={settings.submissionDeadlineDaysBefore} min={0} max={6} suffix="j" onChange={(v) => set({ submissionDeadlineDaysBefore: v })} />
            jour(s) avant, à
            <input type="time" className="field w-32" value={settings.submissionDeadlineTime} onChange={(e) => e.target.value && set({ submissionDeadlineTime: e.target.value })} />
          </div>
        </div>
        <Switch checked={settings.autoCreateWeeklyMeeting} onChange={(v) => set({ autoCreateWeeklyMeeting: v })} label="Créer automatiquement la réunion de la semaine" description="À l’ouverture de l’application, la Flash Synchro de la semaine est créée à partir de la précédente si elle n’existe pas." />
      </section>

      <section className="panel space-y-5 p-5 sm:p-6">
        <h2 className="text-[17px] font-bold">Présentation et chronomètre</h2>
        <Field label="Nom de l’organisme">
          <input className="field" value={settings.orgName} onChange={(e) => set({ orgName: e.target.value })} />
        </Field>
        <Field label="Accroche de la page de couverture">
          <input className="field" value={settings.tagline} onChange={(e) => set({ tagline: e.target.value })} />
        </Field>
        <div>
          <span className="label">Alerte « temps bientôt écoulé »</span>
          <div className="flex items-center gap-3 text-sm text-ink-2">
            <Stepper label="Secondes restantes" value={settings.warningSeconds} min={10} max={300} step={10} suffix="s" onChange={(v) => set({ warningSeconds: v })} />
            avant la fin du temps de parole
          </div>
        </div>
        <Switch checked={settings.showSectionSlides} onChange={(v) => set({ showSectionSlides: v })} label="Diapositive d’ouverture pour chaque service" description="Affiche le nom du service, l’intervenant et son temps de parole avant ses diapositives." />
        <Switch checked={settings.syncTimerWithSlides} onChange={(v) => set({ syncTimerWithSlides: v })} label="Synchroniser le chronomètre avec les diapositives" description="Le compte à rebours bascule automatiquement sur le service présenté." />
      </section>
    </div>
  )
}

function ServicesSettings() {
  const services = useServices()
  const users = useAppStore((s) => s.snapshot!.users)
  const saveService = useAppStore((s) => s.saveService)
  const deleteService = useAppStore((s) => s.deleteService)
  const meetings = useAppStore((s) => s.snapshot!.meetings)

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= services.length) return
    const a = services[index]
    const b = services[target]
    void saveService({ ...a, position: b.position })
    void saveService({ ...b, position: a.position })
  }

  const add = () => {
    const position = Math.max(-1, ...services.map((s) => s.position)) + 1
    const service: Service = { id: uid(), slug: `service-${position + 1}`, name: 'Nouveau service', shortName: 'Nouveau', palette: { ...SERVICE_PALETTES.teal }, icon: 'building', durationMinutes: 3, position, active: true, managerId: null, description: '' }
    void saveService(service)
  }

  const remove = async (service: Service) => {
    const used = meetings.some((m) => m.participants.includes(service.id))
    const ok = await confirmAction({
      title: `Supprimer « ${service.name} » ?`,
      message: used ? 'Ce service figure dans des réunions archivées : ses diapositives seront supprimées. Préférez « Désactiver » pour conserver l’historique.' : 'Le service et ses modèles de diapositives seront supprimés.',
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (ok) await deleteService(service.id)
  }

  return (
    <section className="space-y-4">
      {services.map((s, i) => {
        const paletteKey = (Object.keys(SERVICE_PALETTES) as PaletteKey[]).find((k) => SERVICE_PALETTES[k].accent === s.palette.accent) ?? ''
        return (
          <div key={s.id} className={clsx('panel p-4 sm:p-5', !s.active && 'opacity-70')}>
            <div className="flex flex-wrap items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl text-white" style={{ background: s.palette.accent }}>
                <ServiceIcon icon={s.icon} size={24} />
              </span>
              <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Nom complet">
                  <input className="field" value={s.name} onChange={(e) => saveService({ ...s, name: e.target.value, slug: slugify(e.target.value) || s.slug })} />
                </Field>
                <Field label="Nom court">
                  <input className="field" value={s.shortName} onChange={(e) => saveService({ ...s, shortName: e.target.value })} />
                </Field>
                <Field label="Responsable">
                  <Select value={s.managerId ?? ''} onChange={(e) => saveService({ ...s, managerId: e.target.value || null })}>
                    <option value="">— À désigner —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div>
                  <span className="label">Temps de parole</span>
                  <Stepper label={`Durée ${s.shortName}`} value={s.durationMinutes} min={1} max={60} suffix="min" onChange={(v) => saveService({ ...s, durationMinutes: v })} />
                </div>
                <Field label="Couleur">
                  <Select value={paletteKey} onChange={(e) => e.target.value && saveService({ ...s, palette: { ...SERVICE_PALETTES[e.target.value as PaletteKey] } })}>
                    {!paletteKey && <option value="">Personnalisée</option>}
                    {(Object.keys(SERVICE_PALETTES) as PaletteKey[]).map((k) => (
                      <option key={k} value={k}>
                        {PALETTE_LABELS[k]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Pictogramme">
                  <Select value={s.icon} onChange={(e) => saveService({ ...s, icon: e.target.value as ServiceIconKey })}>
                    {(Object.keys(SERVICE_ICONS) as ServiceIconKey[]).map((k) => (
                      <option key={k} value={k}>
                        {{ graduation: 'Diplôme', briefcase: 'Mallette', folder: 'Dossier', users: 'Personnes', megaphone: 'Mégaphone', building: 'Bâtiment', sparkles: 'Étoiles' }[k]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Description" className="md:col-span-2">
                  <input className="field" value={s.description} onChange={(e) => saveService({ ...s, description: e.target.value })} />
                </Field>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <IconButton icon={ArrowUp} label="Monter" disabled={i === 0} onClick={() => move(i, -1)} />
                <IconButton icon={ArrowDown} label="Descendre" disabled={i === services.length - 1} onClick={() => move(i, 1)} />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              <Switch checked={s.active} onChange={(v) => saveService({ ...s, active: v })} label="Service actif" description="Les services inactifs ne sont plus ajoutés aux nouvelles réunions." />
              <Button size="sm" variant="danger" icon={Trash2} onClick={() => void remove(s)}>
                Supprimer
              </Button>
            </div>
          </div>
        )
      })}
      <Button icon={Plus} onClick={add}>
        Ajouter un service
      </Button>
    </section>
  )
}

function TemplatesSettings() {
  const services = useServices()
  const templates = useAppStore((s) => s.snapshot!.templates)
  const saveTemplates = useAppStore((s) => s.saveTemplates)
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '')
  const service = services.find((s) => s.id === serviceId)
  const list = templates.filter((t) => t.serviceId === serviceId).sort((a, b) => a.position - b.position)
  const save = (next: SlideTemplate[]) => void saveTemplates(serviceId, next.map((t, i) => ({ ...t, position: i })))

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav className="panel h-fit p-2">
        {services.map((s) => (
          <button key={s.id} onClick={() => setServiceId(s.id)} className={clsx('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[15px] font-semibold', s.id === serviceId ? 'bg-novia-50 text-novia-700' : 'text-ink-2 hover:bg-canvas')}>
            <span className="size-2.5 rounded-sm" style={{ background: s.palette.accent }} />
            {s.shortName}
          </button>
        ))}
      </nav>
      {service && (
        <section className="panel p-5 sm:p-6">
          <h2 className="text-[17px] font-bold">Diapositives par défaut — {service.name}</h2>
          <p className="mt-1 mb-4 text-sm text-ink-2">Structure appliquée aux réunions créées à partir des modèles. Les réunions dupliquées reprennent la structure de la réunion source ; chaque réunion reste modifiable.</p>
          <ol className="divide-y divide-line rounded-xl border border-line">
            {list.map((t, i) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <span className="w-6 text-center font-display font-bold text-ink-3">{i + 1}</span>
                <Select className="w-56" value={t.kind} onChange={(e) => save(list.map((x) => (x.id === t.id ? { ...x, kind: e.target.value as SlideKind } : x)))} aria-label="Type de diapositive">
                  {(Object.keys(SLIDE_KIND_LABELS) as SlideKind[]).map((k) => (
                    <option key={k} value={k}>
                      {SLIDE_KIND_LABELS[k]}
                    </option>
                  ))}
                </Select>
                <input className="field min-w-48 flex-1" value={t.title} placeholder="Titre automatique" onChange={(e) => save(list.map((x) => (x.id === t.id ? { ...x, title: e.target.value } : x)))} aria-label="Titre" />
                <span className="text-xs text-ink-3">{t.blocks.length} bloc(s)</span>
                <IconButton icon={ArrowUp} label="Monter" size="xs" disabled={i === 0} onClick={() => save(list.map((x, j) => (j === i - 1 ? list[i] : j === i ? list[i - 1] : x)))} />
                <IconButton icon={ArrowDown} label="Descendre" size="xs" disabled={i === list.length - 1} onClick={() => save(list.map((x, j) => (j === i + 1 ? list[i] : j === i ? list[i + 1] : x)))} />
                <IconButton icon={X} label="Supprimer" size="xs" onClick={() => save(list.filter((x) => x.id !== t.id))} />
              </li>
            ))}
          </ol>
          <Button className="mt-3" size="sm" icon={Plus} onClick={() => save([...list, { id: uid(), serviceId, kind: 'custom', title: 'Nouvelle diapositive', position: list.length, blocks: [] }])}>
            Ajouter une diapositive au modèle
          </Button>
        </section>
      )}
    </div>
  )
}

function UsersSettings() {
  const users = useAppStore((s) => s.snapshot!.users)
  const services = useServices()
  const saveUser = useAppStore((s) => s.saveUser)
  const deleteUser = useAppStore((s) => s.deleteUser)
  const current = useAppStore((s) => s.user)
  const update = (u: AppUser, patch: Partial<AppUser>) => void saveUser({ ...u, ...patch, serviceId: (patch.role ?? u.role) === 'manager' ? (patch.serviceId !== undefined ? patch.serviceId : u.serviceId) : null })

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
          <div key={r} className="rounded-xl bg-white p-4 ring-1 ring-line">
            <div className="font-semibold">{ROLE_LABELS[r]}</div>
            <div className="text-sm text-ink-2">{ROLE_DESCRIPTIONS[r]}</div>
          </div>
        ))}
      </div>
      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[820px] text-[15px]">
          <thead>
            <tr className="border-b border-line bg-canvas/60 text-left text-[13px] font-semibold text-ink-3">
              <th className="px-4 py-2.5">Nom</th>
              <th className="px-3 py-2.5">Adresse e-mail</th>
              <th className="px-3 py-2.5">Fonction</th>
              <th className="px-3 py-2.5">Rôle</th>
              <th className="px-3 py-2.5">Service</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2">
                  <input className="field field-sm font-semibold" value={u.fullName} onChange={(e) => update(u, { fullName: e.target.value })} aria-label="Nom" />
                </td>
                <td className="px-3 py-2">
                  <input className="field field-sm" value={u.email} disabled={env.dataMode === 'supabase'} onChange={(e) => update(u, { email: e.target.value })} aria-label="Adresse e-mail" />
                </td>
                <td className="px-3 py-2">
                  <input className="field field-sm" value={u.jobTitle} onChange={(e) => update(u, { jobTitle: e.target.value })} aria-label="Fonction" />
                </td>
                <td className="px-3 py-2">
                  <Select className="field-sm" value={u.role} disabled={u.id === current?.id} onChange={(e) => update(u, { role: e.target.value as Role })} aria-label="Rôle">
                    {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <Select className="field-sm" value={u.serviceId ?? ''} disabled={u.role !== 'manager'} onChange={(e) => update(u, { serviceId: e.target.value || null })} aria-label="Service">
                    <option value="">—</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.shortName}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-4 py-2 text-right">
                  {u.id !== current?.id && (
                    <IconButton
                      icon={Trash2}
                      label={`Supprimer ${u.fullName}`}
                      onClick={async () => {
                        const ok = await confirmAction({ title: `Supprimer ${u.fullName} ?`, message: 'Cette personne n’aura plus accès à l’application.', confirmLabel: 'Supprimer', danger: true })
                        if (ok) await deleteUser(u.id)
                      }}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {env.dataMode === 'demo' ? (
        <Button icon={Plus} onClick={() => saveUser({ id: uid(), fullName: 'Nouvelle personne', email: `utilisateur${users.length + 1}@demo-novia.fr`, role: 'viewer', serviceId: null, jobTitle: 'Collaborateur' })}>
          Ajouter une personne
        </Button>
      ) : (
        <p className="text-sm text-ink-2">Pour ajouter une personne, invitez-la depuis Supabase (Authentication → Users → Invite user) : son profil apparaît ici dès sa première connexion, avec le rôle « Collaborateur ».</p>
      )}
    </div>
  )
}

function DataSettings() {
  const resetDemo = useAppStore((s) => s.resetDemo)
  const refresh = useAppStore((s) => s.refresh)
  const input = useRef<HTMLInputElement>(null)
  const repo = getRepository()
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="panel p-5 sm:p-6">
        <h2 className="inline-flex items-center gap-2 text-[17px] font-bold">
          <Database size={18} /> Source des données
        </h2>
        {env.dataMode === 'demo' ? (
          <div className="mt-3 space-y-3 text-[15px] text-ink-2">
            <p>
              L’application fonctionne en <strong className="font-semibold text-ink">mode démonstration</strong> : les données sont enregistrées dans ce navigateur. Les autres onglets ouverts se mettent à jour en direct.
            </p>
            <p>Pour passer en production, créez un projet Supabase, exécutez les scripts du dossier <code className="rounded bg-canvas px-1">supabase/</code>, puis renseignez <code className="rounded bg-canvas px-1">VITE_DATA_MODE=supabase</code>, l’URL et la clé publique dans <code className="rounded bg-canvas px-1">.env.local</code>.</p>
          </div>
        ) : (
          <div className="mt-3 space-y-2 text-[15px] text-ink-2">
            <p>
              Connecté à Supabase : <code className="rounded bg-canvas px-1">{env.supabaseUrl}</code>
            </p>
            <p>Les droits sont contrôlés côté serveur par les politiques de sécurité (RLS) ; les modifications sont diffusées en temps réel.</p>
          </div>
        )}
      </section>
      {env.dataMode === 'demo' && (
        <section className="panel space-y-4 p-5 sm:p-6">
          <h2 className="text-[17px] font-bold">Sauvegarde et réinitialisation</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              icon={Download}
              onClick={async () => {
                const json = await repo.exportData?.()
                if (!json) return
                try {
                  await saveFile(new Blob([json], { type: 'application/json' }), `flash-synchro-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`)
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Téléchargement impossible')
                }
              }}
            >
              Exporter les données (JSON)
            </Button>
            <Button icon={Upload} onClick={() => input.current?.click()}>
              Importer une sauvegarde
            </Button>
            <input
              ref={input}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                try {
                  await repo.importData?.(await file.text())
                  await refresh()
                  useAppStore.setState({ bundles: {} })
                  toast.success('Sauvegarde importée')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Import impossible')
                }
              }}
            />
          </div>
          <div className="border-t border-line pt-4">
            <Button
              variant="danger"
              icon={RefreshCcw}
              onClick={async () => {
                const ok = await confirmAction({ title: 'Réinitialiser la démonstration ?', message: 'Toutes les modifications faites dans ce navigateur seront remplacées par le jeu de données d’origine (recalé sur la semaine en cours).', confirmLabel: 'Réinitialiser', danger: true })
                if (!ok) return
                await resetDemo()
                toast.success('Démonstration réinitialisée')
              }}
            >
              Réinitialiser la démonstration
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('meeting')
  return (
    <div>
      <PageHeader title="Paramètres" description="Organisation de la réunion, services, modèles de diapositives et droits d’accès." />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={clsx('-mb-px shrink-0 border-b-2 px-4 py-2.5 text-[15px] font-semibold transition-colors', tab === t.key ? 'border-novia-600 text-novia-700' : 'border-transparent text-ink-2 hover:text-ink')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'meeting' && <MeetingSettings />}
      {tab === 'services' && <ServicesSettings />}
      {tab === 'templates' && <TemplatesSettings />}
      {tab === 'users' && <UsersSettings />}
      {tab === 'data' && <DataSettings />}
    </div>
  )
}
