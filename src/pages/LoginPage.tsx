import { KeyRound, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { NoviaLogo } from '@/components/brand/Logo'
import { DemoProfiles } from '@/components/layout/ProfileSwitcher'
import { Splash } from '@/components/layout/Splash'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Form'
import { env } from '@/config/env'
import type { AppUser } from '@/domain/types'
import { useAppStore } from '@/store/useAppStore'

const RIBBON = [
  { name: 'Pédagogie', minutes: 6, color: '#D9702C' },
  { name: 'Commercial', minutes: 7, color: '#3E7CC4' },
  { name: 'Administratif', minutes: 6, color: '#6F8F2F' },
  { name: 'Vie scolaire', minutes: 3, color: '#7C55B0' },
  { name: 'Com & IMS', minutes: 3, color: '#C0504D' },
]

function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-novia-600 p-12 text-white lg:flex lg:flex-col">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 800 1000" preserveAspectRatio="xMaxYMid slice" aria-hidden>
        <polygon points="560,0 660,0 380,1000 280,1000" fill="#fff" opacity="0.06" />
        <polygon points="700,0 760,0 480,1000 420,1000" fill="#229CD7" opacity="0.18" />
      </svg>
      <NoviaLogo variant="light" height={40} className="relative self-start" />
      <div className="relative mt-auto">
        <p className="text-lg font-semibold text-novia-100">CFA NOVIA</p>
        <h1 className="mt-2 font-display text-6xl leading-[0.95] font-extrabold tracking-tight text-white">Flash Synchro</h1>
        <p className="mt-5 max-w-md text-lg text-novia-50">
          Chaque semaine, chaque service prépare sa partie, la direction valide, et la réunion se déroule en 25 minutes chrono.
        </p>
        <div className="mt-10 flex h-9 gap-[3px]">
          {RIBBON.map((r) => (
            <div key={r.name} className="flex min-w-0 items-center rounded-[4px] px-2 text-xs font-semibold text-white" style={{ flexGrow: r.minutes, flexBasis: 0, background: r.color }}>
              <span className="truncate">{r.name}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs font-semibold text-novia-100">
          <span>10 h 00</span>
          <span>10 h 25</span>
        </div>
      </div>
    </div>
  )
}

function PasswordForm() {
  const signIn = useAppStore((s) => s.signInWithPassword)
  const sendMagicLink = useAppStore((s) => s.sendMagicLink)
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible')
    } finally {
      setBusy(false)
    }
  }

  const magic = async () => {
    if (!email) return setError('Saisissez votre adresse e-mail pour recevoir le lien.')
    setBusy(true)
    try {
      await sendMagicLink(email)
      toast.success('Lien de connexion envoyé : consultez votre messagerie.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Adresse e-mail">
        <input className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@cfa-novia.fr" />
      </Field>
      <Field label="Mot de passe">
        <input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <Button type="submit" variant="primary" size="lg" icon={KeyRound} loading={busy} className="w-full">
        Se connecter
      </Button>
      <Button variant="ghost" icon={Mail} onClick={magic} disabled={busy} className="w-full">
        Recevoir un lien de connexion par e-mail
      </Button>
    </form>
  )
}

export function LoginPage() {
  const status = useAppStore((s) => s.status)
  const user = useAppStore((s) => s.user)
  const signInAsDemoUser = useAppStore((s) => s.signInAsDemoUser)
  const navigate = useNavigate()
  const location = useLocation()

  if (status !== 'ready') return <Splash />
  if (user) return <Navigate to="/" replace />

  const pick = async (u: AppUser) => {
    await signInAsDemoUser(u.id)
    toast.success(`Bienvenue, ${u.fullName.split(' ')[0]}`)
    navigate((location.state as { from?: string } | null)?.from ?? (u.role === 'manager' ? '/mon-espace' : '/'), { replace: true })
  }

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(420px,5fr)_7fr]">
      <BrandPanel />
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-2xl">
          <div className="mb-8 lg:hidden">
            <NoviaLogo height={34} />
          </div>
          {env.dataMode === 'demo' ? (
            <>
              <h2 className="text-2xl font-bold sm:text-3xl">Choisissez un profil</h2>
              <p className="mt-2 mb-7 text-ink-2">
                Version de démonstration : chaque profil ouvre l’application avec ses droits. Les modifications restent dans ce navigateur.
              </p>
              <DemoProfiles onPick={pick} />
              {env.supabaseRequestedButMissing && (
                <p className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Le mode Supabase est demandé mais l’URL ou la clé est absente : la démonstration est utilisée en attendant.
                </p>
              )}
            </>
          ) : (
            <div className="mx-auto max-w-md">
              <h2 className="text-2xl font-bold sm:text-3xl">Connexion</h2>
              <p className="mt-2 mb-7 text-ink-2">Accédez à l’espace de préparation de la Flash Synchro.</p>
              <PasswordForm />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
