import { Check, Copy, KeyRound, Mail, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Select } from '@/components/ui/Form'
import { env } from '@/config/env'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/domain/status'
import type { NewUserInput, Role } from '@/domain/types'
import { copyText } from '@/lib/platform'
import { useServices } from '@/store/hooks'
import { useAppStore } from '@/store/useAppStore'

export interface Credentials {
  fullName: string
  email: string
  password: string
}

/** Identifiants à transmettre : affichés une seule fois à l'administrateur. */
export function CredentialsDialog({ credentials, onClose }: { credentials: Credentials | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  if (!credentials) return null
  const url = window.location.origin
  const message = `Bonjour ${credentials.fullName},\n\nVotre accès à NOVIA Flash Synchro est prêt :\n${url}\n\nAdresse e-mail : ${credentials.email}\nMot de passe provisoire : ${credentials.password}\n\nVous choisirez votre propre mot de passe à la première connexion.`
  const copy = async () => {
    if (await copyText(message)) {
      setCopied(true)
      toast.success('Message copié : collez-le dans un e-mail ou un Teams.')
    } else toast.error('Copie impossible : sélectionnez le texte manuellement.')
  }
  return (
    <Dialog
      open
      onClose={() => {
        setCopied(false)
        onClose()
      }}
      size="sm"
      title="Compte prêt"
      description="Transmettez ces identifiants à la personne. Le mot de passe ne sera plus affiché ensuite."
    >
      <dl className="space-y-3 rounded-xl bg-canvas p-4 text-[15px]">
        <div>
          <dt className="text-xs font-semibold text-ink-3">Adresse de l’application</dt>
          <dd className="font-semibold break-all text-ink">{url}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-ink-3">Adresse e-mail</dt>
          <dd className="font-semibold text-ink">{credentials.email}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-ink-3">Mot de passe provisoire</dt>
          <dd className="font-mono text-lg font-semibold tracking-wide text-novia-700 select-all">{credentials.password}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-ink-2">À sa première connexion, la personne devra choisir son propre mot de passe.</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Fermer
        </Button>
        <Button variant="primary" icon={copied ? Check : Copy} onClick={copy}>
          {copied ? 'Message copié' : 'Copier le message à envoyer'}
        </Button>
      </div>
    </Dialog>
  )
}

const EMPTY: NewUserInput = { email: '', fullName: '', jobTitle: '', role: 'manager', serviceId: null, mode: 'password' }

export function AddUserDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (c: Credentials | null) => void }) {
  const services = useServices().filter((s) => s.active)
  const createUser = useAppStore((s) => s.createUser)
  const [form, setForm] = useState<NewUserInput>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<NewUserInput>) => setForm((f) => ({ ...f, ...patch }))

  const close = () => {
    setForm(EMPTY)
    setError(null)
    onClose()
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.fullName.trim()) return setError('Indiquez le nom de la personne.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError('Adresse e-mail invalide.')
    if (form.role === 'manager' && !form.serviceId) return setError('Choisissez le service dont la personne est responsable.')
    setBusy(true)
    setError(null)
    try {
      const { user, password } = await createUser({ ...form, serviceId: form.role === 'manager' ? form.serviceId : null })
      toast.success(form.mode === 'invite' ? `Invitation envoyée à ${user.email}.` : `Compte créé pour ${user.fullName}.`)
      onCreated(password ? { fullName: user.fullName, email: user.email, password } : null)
      setForm(EMPTY)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={close} title="Ajouter un utilisateur" description="Le compte est créé immédiatement, avec le rôle choisi.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom et prénom">
            <input className="field" value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} placeholder="Camille Durand" autoComplete="off" />
          </Field>
          <Field label="Adresse e-mail">
            <input className="field" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="camille.durand@cfa-novia.fr" autoComplete="off" />
          </Field>
          <Field label="Fonction" hint="Facultatif">
            <input className="field" value={form.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} placeholder="Responsable pédagogique" />
          </Field>
          <Field label="Rôle" hint={ROLE_DESCRIPTIONS[form.role]}>
            <Select value={form.role} onChange={(e) => set({ role: e.target.value as Role })}>
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          {form.role === 'manager' && (
            <Field label="Service" className="sm:col-span-2">
              <Select value={form.serviceId ?? ''} onChange={(e) => set({ serviceId: e.target.value || null })}>
                <option value="">Choisir le service…</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        {env.dataMode === 'supabase' && (
          <fieldset>
            <legend className="label">Accès</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  { mode: 'password', icon: KeyRound, title: 'Mot de passe provisoire', text: 'Affiché ici, à transmettre vous-même. Fonctionne toujours.' },
                  { mode: 'invite', icon: Mail, title: 'Invitation par e-mail', text: 'Lien envoyé par Supabase. Nécessite un serveur d’envoi configuré.' },
                ] as const
              ).map((o) => (
                <label key={o.mode} className={`flex cursor-pointer gap-3 rounded-xl p-3 ring-1 ${form.mode === o.mode ? 'bg-novia-50 ring-novia-500' : 'ring-line hover:bg-canvas'}`}>
                  <input type="radio" name="mode" className="sr-only" checked={form.mode === o.mode} onChange={() => set({ mode: o.mode })} />
                  <o.icon size={18} className="mt-0.5 shrink-0 text-novia-600" />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{o.title}</span>
                    <span className="block text-xs text-ink-2">{o.text}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" icon={UserPlus} loading={busy}>
            Créer le compte
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
