import { LifeBuoy, Send } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { REQUEST_CATEGORY, REQUEST_STATUS } from '@/ai/views/Governance'
import type { SupportRequest } from '@/ai/types'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Field, Select } from '../ui/Form'
import { getSupabaseClient } from '@/data'

/** « Aide et demandes » : tout utilisateur signale un problème ou propose une amélioration. */
export function SupportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mine, setMine] = useState<SupportRequest[]>([])
  const [form, setForm] = useState({ category: 'question' as SupportRequest['category'], subject: '', body: '' })
  const [busy, setBusy] = useState(false)
  const db = getSupabaseClient()

  const load = async () => {
    if (!db) return
    const { data: session } = await db.auth.getSession()
    const uid = session.session?.user.id
    if (!uid) return
    const { data } = await db.from('support_requests').select('*').eq('author_id', uid).order('created_at', { ascending: false }).limit(20)
    setMine((data ?? []) as SupportRequest[])
  }

  useEffect(() => {
    if (open) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!db) return
    if (form.subject.trim().length < 3) return toast.error('Indiquez un objet.')
    setBusy(true)
    const { data: session } = await db.auth.getSession()
    const { error } = await db.from('support_requests').insert({ category: form.category, subject: form.subject.trim(), body: form.body.trim(), author_id: session.session?.user.id })
    setBusy(false)
    if (error) return toast.error(`Envoi impossible : ${error.message}`)
    toast.success('Demande envoyée. Vous verrez la réponse ici.')
    setForm({ category: 'question', subject: '', body: '' })
    void load()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Aide et demandes" description="Signalez un problème, posez une question ou proposez une amélioration de l’application.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <Field label="Type">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as SupportRequest['category'] })}>
              {Object.entries(REQUEST_CATEGORY).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field label="Objet">
            <input className="field" value={form.subject} maxLength={200} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="L’export PDF est vide" />
          </Field>
        </div>
        <Field label="Détails">
          <textarea className="field min-h-24" value={form.body} maxLength={5000} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Ce que vous faisiez, ce qui s’est passé, ce que vous attendiez." />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" icon={Send} loading={busy}>Envoyer</Button>
        </div>
      </form>
      {mine.length > 0 && (
        <section className="mt-6 border-t border-line pt-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><LifeBuoy size={16} /> Mes demandes</h3>
          <ul className="space-y-3">
            {mine.map((r) => (
              <li key={r.id} className="rounded-xl bg-canvas p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${REQUEST_STATUS[r.status].tone}`}>{REQUEST_STATUS[r.status].label}</span>
                  <span className="font-semibold text-ink">{r.subject}</span>
                </div>
                {r.response && <p className="mt-2 whitespace-pre-wrap text-ink-2"><span className="font-semibold text-ink">Réponse : </span>{r.response}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Dialog>
  )
}
