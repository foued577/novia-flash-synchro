import { clsx } from 'clsx'
import { Bot, FileText, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AgentDialog, OrgChart } from '@/ai/views/Organization'
import { AiSettingsView } from '@/ai/views/AiSettingsView'
import { AgentMessages, CeoChat } from '@/ai/views/Conversations'
import { ActivityLog, Decisions, Reports, Requests } from '@/ai/views/Governance'
import { MissionDialog, MissionsBoard } from '@/ai/views/Missions'
import { Overview, SetupBanner } from '@/ai/views/Overview'
import { useAiStore } from '@/ai/store'
import { Button } from '@/components/ui/Button'
import { EmptyState, PageHeader } from '@/components/ui/Misc'
import { env } from '@/config/env'

const TABS = [
  { key: 'vue', label: 'Vue d’ensemble' },
  { key: 'organigramme', label: 'Organigramme' },
  { key: 'chat', label: 'Chat avec la CEO' },
  { key: 'missions', label: 'Missions' },
  { key: 'messagerie', label: 'Messagerie' },
  { key: 'validations', label: 'Validations' },
  { key: 'journal', label: 'Journal' },
  { key: 'rapports', label: 'Rapports' },
  { key: 'demandes', label: 'Demandes' },
  { key: 'parametres', label: 'Paramètres IA' },
] as const

export function AiCompanyPage() {
  if (env.dataMode !== 'supabase') {
    return (
      <div className="panel">
        <EmptyState icon={Bot} title="AI Company indisponible en démonstration">
          L’organisation d’agents fonctionne avec la base Supabase de production : ses données, ses validations et son journal y sont conservés.
        </EmptyState>
      </div>
    )
  }
  return <AiCompany />
}

function AiCompany() {
  const { tab = 'vue' } = useParams()
  const navigate = useNavigate()
  const start = useAiStore((s) => s.start)
  const loaded = useAiStore((s) => s.loaded)
  const error = useAiStore((s) => s.error)
  const status = useAiStore((s) => s.status)
  const settings = useAiStore((s) => s.settings)
  const invoke = useAiStore((s) => s.invoke)
  const pending = useAiStore((s) => s.decisions.filter((d) => d.status === 'pending').length)
  const [agentId, setAgentId] = useState<string | null>(null)
  const [missionId, setMissionId] = useState<string | null>(null)
  const [busy, setBusy] = useState<'cycle' | 'report' | null>(null)

  useEffect(() => start(), [start])

  const go = (key: string) => navigate(`/ai-company/${key}`)
  const running = !!status?.running
  const ready = !!status?.configured && settings?.enabled !== false

  const launch = async (action: 'run_cycle' | 'daily_report') => {
    setBusy(action === 'run_cycle' ? 'cycle' : 'report')
    try {
      await invoke({ action })
      toast.success(action === 'run_cycle' ? 'Cycle lancé : chaque agent traite sa mission prioritaire, en parallèle.' : 'La CEO rédige le rapport du jour.')
      void useAiStore.getState().refreshStatus()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="AI Company"
        description="Sept agents IA qui pilotent, maintiennent et font évoluer Flash Synchro, sous votre supervision."
        actions={
          <>
            {running && (
              <span className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                <span className="size-2 animate-pulse-soft rounded-full bg-amber-500" /> Cycle en cours
              </span>
            )}
            <Button icon={FileText} disabled={!ready || running} loading={busy === 'report'} onClick={() => launch('daily_report')}>
              Rapport du jour
            </Button>
            <Button variant="primary" icon={Play} disabled={!ready || running} loading={busy === 'cycle'} onClick={() => launch('run_cycle')}>
              Lancer un cycle
            </Button>
          </>
        }
      />
      <SetupBanner />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line scrollbar-thin" aria-label="Sections de l’AI Company">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => go(t.key)}
            className={clsx('relative shrink-0 px-3 pt-2 pb-3 text-[15px] font-semibold whitespace-nowrap transition-colors', tab === t.key ? 'text-novia-700' : 'text-ink-2 hover:text-ink')}
            aria-current={tab === t.key ? 'page' : undefined}
          >
            {t.label}
            {t.key === 'validations' && pending > 0 && <span className="ml-1.5 rounded-full bg-violet-600 px-1.5 py-0.5 text-[11px] text-white">{pending}</span>}
            {tab === t.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-novia-600" />}
          </button>
        ))}
      </nav>

      {!loaded ? (
        <div className="h-64 animate-pulse rounded-xl bg-white/60" />
      ) : error ? (
        <div className="panel p-6 text-sm text-red-800">Chargement impossible : {error}</div>
      ) : (
        <>
          {tab === 'vue' && <Overview go={go} onOpenAgent={setAgentId} onOpenMission={setMissionId} />}
          {tab === 'organigramme' && <OrgChart onOpen={setAgentId} />}
          {tab === 'chat' && <CeoChat />}
          {tab === 'missions' && <MissionsBoard onOpen={setMissionId} />}
          {tab === 'messagerie' && <AgentMessages onOpenMission={setMissionId} />}
          {tab === 'validations' && <Decisions onOpenMission={setMissionId} />}
          {tab === 'journal' && <ActivityLog onOpenMission={setMissionId} />}
          {tab === 'rapports' && <Reports />}
          {tab === 'demandes' && <Requests />}
          {tab === 'parametres' && <AiSettingsView />}
        </>
      )}

      <AgentDialog id={agentId} onClose={() => setAgentId(null)} onOpenMission={(id) => { setAgentId(null); setMissionId(id) }} />
      <MissionDialog id={missionId} onClose={() => setMissionId(null)} onOpenAgent={(id) => { setMissionId(null); setAgentId(id) }} />
    </div>
  )
}
