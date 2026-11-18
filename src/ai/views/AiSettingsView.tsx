import { clsx } from 'clsx'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Field, Select, Switch } from '@/components/ui/Form'
import { aiDb, useAiStore } from '../store'
import type { AiSettings } from '../types'
import { AgentAvatar, TOOL_LABELS } from '../ui'

const MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — équilibré (recommandé)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 — rapide et économique' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 — le plus capable, plus coûteux' },
]

const AUTONOMY: { id: AiSettings['autonomy']; title: string; text: string }[] = [
  { id: 'observe', title: 'Observation', text: 'Les agents analysent, organisent et recommandent. Aucune action sur l’application.' },
  { id: 'supervised', title: 'Supervisé', text: 'Toute action sur l’application attend votre validation. Recommandé.' },
  { id: 'autonomous', title: 'Autonome encadré', text: 'Actions à risque faible ou moyen exécutées directement ; les actions à risque élevé restent soumises à validation.' },
]

const ALL_TOOLS = Object.keys(TOOL_LABELS)

export function AiSettingsView() {
  const settings = useAiStore((s) => s.settings)
  const agents = useAiStore((s) => s.agents)
  const status = useAiStore((s) => s.status)
  const [draft, setDraft] = useState<AiSettings | null>(settings)
  useEffect(() => setDraft(settings), [settings])
  if (!draft) return null
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)

  const save = async () => {
    try {
      await aiDb.saveSettings({ enabled: draft.enabled, model: draft.model, autonomy: draft.autonomy, daily_token_budget: draft.daily_token_budget, max_steps: draft.max_steps })
      toast.success('Paramètres IA enregistrés.')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-6">
      <section className="panel space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-ink">Fonctionnement</h2>
          <span className={clsx('rounded-md px-2 py-0.5 text-xs font-semibold', status?.configured ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800')}>
            {status?.configured ? 'Clé API Claude configurée' : 'Clé API Claude absente'}
          </span>
        </div>
        <Switch checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} label="AI Company active" description="En pause, aucun agent ne travaille et aucun appel au modèle n’est fait." />
        <fieldset>
          <legend className="label">Niveau d’autonomie</legend>
          <div className="grid gap-2 md:grid-cols-3">
            {AUTONOMY.map((o) => (
              <label key={o.id} className={clsx('cursor-pointer rounded-xl p-3 ring-1', draft.autonomy === o.id ? 'bg-novia-50 ring-novia-500' : 'ring-line hover:bg-canvas')}>
                <input type="radio" name="autonomy" className="sr-only" checked={draft.autonomy === o.id} onChange={() => setDraft({ ...draft, autonomy: o.id })} />
                <span className="block text-sm font-semibold text-ink">{o.title}</span>
                <span className="block text-xs text-ink-2">{o.text}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Modèle">
            <Select value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })}>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Budget quotidien (jetons)" hint="Au-delà, les agents s’arrêtent jusqu’au lendemain.">
            <input className="field" type="number" min={10000} step={10000} value={draft.daily_token_budget} onChange={(e) => setDraft({ ...draft, daily_token_budget: Number(e.target.value) })} />
          </Field>
          <Field label="Étapes de réflexion par tâche" hint="1 à 12. Plus d’étapes = travail plus poussé, plus de jetons.">
            <input className="field" type="number" min={1} max={12} value={draft.max_steps} onChange={(e) => setDraft({ ...draft, max_steps: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button variant="primary" disabled={!dirty} onClick={save}>Enregistrer</Button>
        </div>
      </section>

      <section className="panel overflow-x-auto">
        <div className="border-b border-line px-5 py-3">
          <h2 className="font-bold text-ink">Outils autorisés par agent</h2>
          <p className="text-sm text-ink-3">Liste blanche appliquée par le serveur : un agent ne peut appeler que les outils cochés. Les actions sur l’application restent en plus limitées par rôle et par niveau d’autonomie.</p>
        </div>
        <table className="w-full min-w-[980px] text-xs">
          <thead>
            <tr className="text-left text-ink-3">
              <th className="sticky left-0 bg-white px-4 py-2">Agent</th>
              {ALL_TOOLS.map((t) => (
                <th key={t} className="px-1 py-2 font-semibold"><span className="block w-16 leading-tight">{TOOL_LABELS[t]}</span></th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {agents.map((a) => (
              <tr key={a.id}>
                <td className="sticky left-0 bg-white px-4 py-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink whitespace-nowrap"><AgentAvatar agent={a} size={22} /> {a.title}</span>
                </td>
                {ALL_TOOLS.map((t) => (
                  <td key={t} className="px-1 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${TOOL_LABELS[t]} pour ${a.title}`}
                      checked={a.tools.includes(t)}
                      onChange={async (e) => {
                        const tools = e.target.checked ? [...a.tools, t] : a.tools.filter((x) => x !== t)
                        try {
                          await aiDb.updateAgent(a.id, { tools })
                        } catch (err) {
                          toast.error((err as Error).message)
                        }
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel space-y-2 p-5 text-sm text-ink-2">
        <h2 className="font-bold text-ink">Travail planifié (facultatif)</h2>
        <p>
          Pour que les agents travaillent sans que la page soit ouverte (par exemple un cycle toutes les heures et un rapport chaque soir), ajoutez un secret <code className="rounded bg-canvas px-1">AI_CRON_SECRET</code> dans Supabase, puis une tâche planifiée qui appelle la fonction <code className="rounded bg-canvas px-1">ai-company</code> avec l’en-tête <code className="rounded bg-canvas px-1">x-ai-cron-secret</code>. La procédure est détaillée dans <code className="rounded bg-canvas px-1">docs/AI_COMPANY.md</code>.
        </p>
        <p className="text-ink-3">État : {status?.cron ? 'secret de planification configuré.' : 'pas de planification configurée.'}</p>
      </section>
    </div>
  )
}
