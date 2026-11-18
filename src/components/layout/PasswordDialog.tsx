import { KeyRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Field } from '../ui/Form'
import { useAppStore } from '@/store/useAppStore'

/** Définition (après invitation / réinitialisation) ou changement du mot de passe. */
export function PasswordDialog() {
  const mode = useAppStore((s) => s.passwordDialog)
  const close = useAppStore((s) => s.setPasswordDialog)
  const updatePassword = useAppStore((s) => s.updatePassword)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onClose = () => {
    setPassword('')
    setConfirm('')
    setError(null)
    close(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return setError('8 caractères minimum.')
    if (password !== confirm) return setError('Les deux saisies ne correspondent pas.')
    setBusy(true)
    setError(null)
    try {
      await updatePassword(password)
      toast.success('Mot de passe enregistré.')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={mode !== null}
      onClose={onClose}
      size="sm"
      title={mode === 'setup' ? 'Choisissez votre mot de passe' : 'Changer mon mot de passe'}
      description={mode === 'setup' ? 'Vous pourrez ensuite vous connecter avec votre adresse e-mail et ce mot de passe.' : undefined}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nouveau mot de passe" hint="8 caractères minimum">
          <input className="field" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirmation">
          <input className="field" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {mode === 'setup' ? 'Plus tard' : 'Annuler'}
          </Button>
          <Button type="submit" variant="primary" icon={KeyRound} loading={busy}>
            Enregistrer le mot de passe
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
