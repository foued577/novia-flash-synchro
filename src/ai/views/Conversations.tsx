import { clsx } from 'clsx'
import { ArrowUp, MessagesSquare, Send } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Form'
import { EmptyState } from '@/components/ui/Misc'
import { aiDb, useAiStore } from '../store'
import { actorLabel, AgentAvatar, agentById, dateTime, Markdown, timeAgo } from '../ui'

const STARTERS = [
  'Fais un état des lieux complet de l’application et propose un plan d’action priorisé.',
  'Lance un audit de sécurité et dis-moi ce qu’il faut corriger en priorité.',
  'Où en est la préparation de la réunion de cette semaine ? Qui est en retard ?',
  'Analyse le respect des temps de parole sur les dernières réunions.',
]

export function CeoChat() {
  const messages = useAiStore((s) => s.messages)
  const agents = useAiStore((s) => s.agents)
  const pending = useAiStore((s) => s.chatPending)
  const chat = useAiStore((s) => s.chat)
  const status = useAiStore((s) => s.status)
  const ceo = agents.find((a) => a.id === 'ceo')
  const thread = useMemo(() => messages.filter((m) => m.channel === 'ceo_chat'), [messages])
  const [draft, setDraft] = useState('')
  const [lastSent, setLastSent] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [thread.length, pending])

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || pending) return
    setDraft('')
    setLastSent(message)
    try {
      const res = await chat(message)
      if (res.delegated > 0) toast.success(`${res.delegated} mission(s) déléguée(s) : les agents se mettent au travail.`)
    } catch (e) {
      toast.error((e as Error).message)
      setDraft(message)
    } finally {
      setLastSent(null)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void send(draft)
  }

  const showOptimistic = pending && lastSent && thread[thread.length - 1]?.content !== lastSent

  return (
    <div className="panel flex h-[calc(100vh-260px)] min-h-[480px] flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line px-5 py-3">
        <AgentAvatar agent={ceo} size={40} ring />
        <div>
          <div className="font-display font-bold text-ink">{ceo ? `${ceo.name}, CEO` : 'CEO'}</div>
          <div className="text-xs text-ink-3">Donnez une orientation : la CEO découpe le travail et le confie aux agents.</div>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 scrollbar-thin">
        {thread.length === 0 && !pending && (
          <div className="mx-auto max-w-xl py-6 text-center">
            <p className="text-ink-2">Par quoi voulez-vous commencer ?</p>
            <div className="mt-4 grid gap-2">
              {STARTERS.map((s) => (
                <button key={s} type="button" disabled={!status?.configured} onClick={() => void send(s)} className="rounded-xl bg-canvas px-4 py-3 text-left text-sm font-semibold text-ink ring-1 ring-line hover:bg-novia-50 disabled:opacity-50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {thread.map((m) => (
          <Bubble key={m.id} fromHuman={m.sender === 'human'} at={m.created_at} content={m.content} />
        ))}
        {showOptimistic && <Bubble fromHuman at={new Date().toISOString()} content={lastSent!} />}
        {pending && (
          <div className="flex items-center gap-3 text-sm text-ink-3">
            <AgentAvatar agent={ceo} size={28} />
            <span className="animate-pulse-soft">{ceo?.name ?? 'La CEO'} analyse la demande et consulte l’organisation…</span>
          </div>
        )}
        <div ref={end} />
      </div>
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-line p-3">
        <textarea
          className="field max-h-40 min-h-[44px] flex-1 resize-none"
          rows={1}
          value={draft}
          disabled={!status?.configured}
          placeholder={status?.configured ? 'Écrire à la CEO…' : 'Ajoutez la clé de l’API Claude pour activer le chat'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(draft)
            }
          }}
        />
        <Button type="submit" variant="primary" icon={ArrowUp} loading={pending} disabled={!draft.trim() || !status?.configured} aria-label="Envoyer">
          Envoyer
        </Button>
      </form>
    </div>
  )
}

function Bubble({ fromHuman, content, at }: { fromHuman: boolean; content: string; at: string }) {
  return (
    <div className={clsx('flex', fromHuman ? 'justify-end' : 'justify-start')}>
      <div className={clsx('max-w-[78%] rounded-2xl px-4 py-3', fromHuman ? 'bg-novia-600 text-white' : 'bg-canvas ring-1 ring-line')}>
        {fromHuman ? <p className="text-[15px] whitespace-pre-wrap">{content}</p> : <Markdown text={content} />}
        <div className={clsx('mt-1 text-[11px]', fromHuman ? 'text-novia-100' : 'text-ink-3')}>{timeAgo(at)}</div>
      </div>
    </div>
  )
}

export function AgentMessages({ onOpenMission }: { onOpenMission: (id: string) => void }) {
  const messages = useAiStore((s) => s.messages)
  const agents = useAiStore((s) => s.agents)
  const missions = useAiStore((s) => s.missions)
  const [agent, setAgent] = useState('')
  const [to, setTo] = useState('ceo')
  const [draft, setDraft] = useState('')
  const list = useMemo(
    () => messages.filter((m) => m.channel === 'agents' && (!agent || m.sender === agent || m.recipient === agent)).slice().reverse(),
    [messages, agent],
  )

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="panel">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <h3 className="font-bold text-ink">Échanges entre agents</h3>
          <Select className="field-sm ml-auto w-52" value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Filtrer">
            <option value="">Tous les agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.title} — {a.name}</option>
            ))}
          </Select>
        </div>
        {list.length === 0 ? (
          <EmptyState icon={MessagesSquare} title="Aucun message pour l’instant">
            Les agents s’écrivent quand une mission demande l’avis ou l’aide d’un collègue.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((m) => {
              const from = agentById(agents, m.sender)
              const mission = missions.find((x) => x.id === m.mission_id)
              return (
                <li key={m.id} className="flex gap-3 px-4 py-3">
                  <AgentAvatar agent={from} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-semibold text-ink">{actorLabel(agents, m.sender)}</span>
                      <span className="text-ink-3">à {actorLabel(agents, m.recipient)}</span>
                      <span className="ml-auto text-xs text-ink-3">{dateTime(m.created_at)}{!m.read_at && ' · non lu'}</span>
                    </div>
                    <p className="mt-1 text-[15px] whitespace-pre-wrap text-ink-2">{m.content}</p>
                    {mission && (
                      <button type="button" onClick={() => onOpenMission(mission.id)} className="mt-1 text-xs font-semibold text-novia-600 hover:underline">
                        Mission : {mission.title}
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <form
        className="panel h-fit space-y-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!draft.trim()) return
          try {
            await aiDb.sendToAgent(to, draft.trim())
            setDraft('')
            toast.success('Message déposé : il sera traité au prochain cycle.')
          } catch (err) {
            toast.error((err as Error).message)
          }
        }}
      >
        <h3 className="font-bold text-ink">Écrire à un agent</h3>
        <Select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Destinataire">
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.title} — {a.name}</option>
          ))}
        </Select>
        <textarea className="field min-h-28" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Consigne, question ou information…" />
        <Button type="submit" variant="secondary" icon={Send} className="w-full">Déposer le message</Button>
      </form>
    </div>
  )
}
