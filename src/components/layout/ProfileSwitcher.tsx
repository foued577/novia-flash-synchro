import { clsx } from 'clsx'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ROLE_LABELS } from '@/domain/status'
import type { AppUser } from '@/domain/types'
import { useAppStore } from '@/store/useAppStore'
import { Dialog } from '../ui/Dialog'
import { Avatar } from '../ui/Misc'

/** Liste des profils de démonstration, regroupés par rôle. */
export function DemoProfiles({ onPick, currentId }: { onPick: (u: AppUser) => void; currentId?: string }) {
  const users = useAppStore((s) => s.snapshot?.users ?? [])
  const services = useAppStore((s) => s.snapshot?.services ?? [])
  const groups: { role: AppUser['role']; title: string }[] = [
    { role: 'admin', title: 'Administration' },
    { role: 'manager', title: 'Responsables de service' },
    { role: 'viewer', title: 'Collaborateurs' },
  ]
  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const list = users.filter((u) => u.role === g.role)
        if (list.length === 0) return null
        return (
          <div key={g.role}>
            <div className="mb-2 text-[13px] font-semibold text-ink-3">{g.title}</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {list.map((u) => {
                const service = services.find((s) => s.id === u.serviceId)
                return (
                  <button
                    key={u.id}
                    onClick={() => onPick(u)}
                    className={clsx(
                      'flex items-center gap-3 rounded-xl border bg-white p-3 text-left transition-colors hover:border-novia-300 hover:bg-novia-50/40',
                      currentId === u.id ? 'border-novia-500 ring-2 ring-novia-100' : 'border-line',
                    )}
                  >
                    <Avatar name={u.fullName} color={service?.palette.accent ?? '#3661B3'} size={40} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">{u.fullName}</span>
                      <span className="block truncate text-sm text-ink-2">{service ? service.name : u.jobTitle || ROLE_LABELS[u.role]}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ProfileSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAppStore((s) => s.user)
  const signInAsDemoUser = useAppStore((s) => s.signInAsDemoUser)
  const navigate = useNavigate()
  return (
    <Dialog open={open} onClose={onClose} title="Changer de profil" description="Testez l’application avec les droits de chaque rôle." size="lg">
      <DemoProfiles
        currentId={user?.id}
        onPick={async (u) => {
          await signInAsDemoUser(u.id)
          onClose()
          toast.success(`Connecté en tant que ${u.fullName}`)
          navigate(u.role === 'manager' ? '/mon-espace' : '/')
        }}
      />
    </Dialog>
  )
}
