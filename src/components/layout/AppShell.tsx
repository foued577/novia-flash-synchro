import { clsx } from 'clsx'
import { CalendarDays, CalendarRange, Check, CheckCircle2, ChevronsUpDown, CircleDashed, CloudUpload, History, KeyRound, LayoutDashboard, LogOut, Menu as MenuIcon, PencilLine, Play, Send, Settings, UserRoundCog, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { env } from '@/config/env'
import { weekOf } from '@/domain/isoWeek'
import { isAdmin } from '@/domain/permissions'
import { submissionStatus } from '@/domain/selectors'
import { ROLE_LABELS, SUBMISSION_STATUS } from '@/domain/status'
import { formatFullDateCap, formatPeriodShort } from '@/lib/format'
import { useBundle, useCurrentMeeting, useServices } from '@/store/hooks'
import { useAppStore } from '@/store/useAppStore'
import { AppMark } from '../brand/Logo'
import { Button } from '../ui/Button'
import { Menu } from '../ui/Menu'
import { Avatar, ServiceIcon } from '../ui/Misc'
import { PasswordDialog } from './PasswordDialog'
import { ProfileSwitcher } from './ProfileSwitcher'

function NavItem({ to, icon: Icon, children, end, badge }: { to: string; icon: typeof LayoutDashboard; children: ReactNode; end?: boolean; badge?: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          'group flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-semibold transition-colors',
          isActive ? 'bg-novia-50 text-novia-700' : 'text-ink-2 hover:bg-canvas hover:text-ink',
        )
      }
    >
      <Icon size={18} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge}
    </NavLink>
  )
}

const STATUS_GLYPHS = { draft: CircleDashed, in_progress: PencilLine, submitted: Send, validated: CheckCircle2 }

function StatusGlyph({ status }: { status: keyof typeof STATUS_GLYPHS }) {
  const Icon = STATUS_GLYPHS[status]
  return <Icon size={15} className="shrink-0" style={{ color: SUBMISSION_STATUS[status].dot }} aria-label={SUBMISSION_STATUS[status].label} />
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const user = useAppStore((s) => s.user)
  const signOut = useAppStore((s) => s.signOut)
  const setPasswordDialog = useAppStore((s) => s.setPasswordDialog)
  const services = useServices().filter((s) => s.active)
  const meeting = useCurrentMeeting()
  const bundle = useBundle(meeting?.id)
  const navigate = useNavigate()
  const [switcher, setSwitcher] = useState(false)
  const myService = services.find((s) => s.id === user?.serviceId)

  return (
    <div className="flex h-full flex-col" onClick={(e) => (e.target as HTMLElement).closest('a') && onNavigate?.()}>
      <div className="px-5 pt-5 pb-4">
        <AppMark />
        {env.dataMode === 'demo' && (
          <div className="mt-4 rounded-lg bg-cyan-novia/10 px-3 py-2 text-xs leading-snug text-novia-800">
            <strong className="font-semibold">Mode démonstration</strong> — données d’exemple enregistrées dans ce navigateur.
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4 scrollbar-thin" aria-label="Navigation principale">
        <div className="space-y-0.5">
          <NavItem to="/" end icon={LayoutDashboard}>
            Tableau de bord
          </NavItem>
          {meeting && (
            <NavItem to={`/reunions/${meeting.id}`} end icon={CalendarRange} badge={<span className="text-xs font-semibold text-ink-3">S{meeting.isoWeek}</span>}>
              Réunion de la semaine
            </NavItem>
          )}
          <NavItem to="/historique" icon={History}>
            Historique
          </NavItem>
        </div>

        {meeting && (
          <div>
            <div className="mb-1.5 px-3 text-[13px] font-semibold text-ink-3">Espaces des services</div>
            <div className="space-y-0.5">
              {services.map((service) => {
                const status = submissionStatus(bundle, service.id)
                const mine = service.id === myService?.id
                return (
                  <NavLink
                    key={service.id}
                    to={`/reunions/${meeting.id}/services/${service.id}`}
                    className={({ isActive }) =>
                      clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-semibold transition-colors', isActive ? 'bg-novia-50 text-novia-700' : 'text-ink-2 hover:bg-canvas hover:text-ink')
                    }
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-md text-white" style={{ background: service.palette.accent }}>
                      <ServiceIcon icon={service.icon} size={13} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {service.shortName}
                      {mine && <span className="ml-1.5 text-xs font-semibold text-novia-600">(vous)</span>}
                    </span>
                    <StatusGlyph status={status} />
                  </NavLink>
                )
              })}
            </div>
          </div>
        )}

        {isAdmin(user) && (
          <div>
            <div className="mb-1.5 px-3 text-[13px] font-semibold text-ink-3">Administration</div>
            <NavItem to="/parametres" icon={Settings}>
              Paramètres
            </NavItem>
          </div>
        )}
      </nav>

      {user && (
        <div className="border-t border-line p-3">
          <Menu
            placement="top"
            align="left"
            className="w-full"
            items={[
              ...(env.dataMode === 'demo'
                ? [{ label: 'Changer de profil', icon: UserRoundCog, onSelect: () => setSwitcher(true) }]
                : [{ label: 'Changer mon mot de passe', icon: KeyRound, onSelect: () => setPasswordDialog('change') }]),
              {
                label: 'Se déconnecter',
                icon: LogOut,
                onSelect: async () => {
                  await signOut()
                  navigate('/connexion')
                },
              },
            ]}
            trigger={(props) => (
              <button {...props} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-canvas">
                <Avatar name={user.fullName} color={myService?.palette.accent ?? '#3661B3'} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{user.fullName}</span>
                  <span className="block truncate text-xs text-ink-3">{myService ? myService.shortName : ROLE_LABELS[user.role]}</span>
                </span>
                <ChevronsUpDown size={16} className="text-ink-3" />
              </button>
            )}
          />
        </div>
      )}
      <ProfileSwitcher open={switcher} onClose={() => setSwitcher(false)} />
      {env.dataMode === 'supabase' && <PasswordDialog />}
    </div>
  )
}

function SaveIndicator() {
  const saving = useAppStore((s) => s.saving)
  const lastSavedAt = useAppStore((s) => s.lastSavedAt)
  if (saving > 0)
    return (
      <span className="hidden items-center gap-1.5 text-sm text-ink-3 sm:inline-flex" role="status">
        <CloudUpload size={16} className="animate-pulse-soft" /> Enregistrement…
      </span>
    )
  if (!lastSavedAt) return null
  return (
    <span className="hidden items-center gap-1.5 text-sm text-ink-3 sm:inline-flex" role="status">
      <Check size={16} className="text-emerald-600" /> Enregistré
    </span>
  )
}

export function AppShell() {
  const [drawer, setDrawer] = useState(false)
  const today = useAppStore((s) => s.today)
  const meeting = useCurrentMeeting()
  const navigate = useNavigate()
  const location = useLocation()
  const week = weekOf(today)

  useEffect(() => setDrawer(false), [location.pathname])

  const launch = () => {
    if (!meeting) return
    void document.documentElement.requestFullscreen?.().catch(() => undefined)
    navigate(`/reunions/${meeting.id}/presentation`)
  }

  return (
    <div className="min-h-screen lg:pl-[268px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[268px] border-r border-line bg-white lg:block">
        <Sidebar />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-novia-950/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-[284px] animate-pop-in bg-white shadow-[var(--shadow-float)]">
            <button className="absolute top-4 right-3 rounded-lg p-2 text-ink-3 hover:bg-canvas" onClick={() => setDrawer(false)} aria-label="Fermer le menu">
              <X size={18} />
            </button>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur lg:px-8">
        <button className="-ml-1 rounded-lg p-2 text-ink-2 hover:bg-canvas lg:hidden" onClick={() => setDrawer(true)} aria-label="Ouvrir le menu">
          <MenuIcon size={20} />
        </button>
        <div className="flex min-w-0 items-center gap-2.5 text-sm">
          <CalendarDays size={18} className="shrink-0 text-novia-600" />
          <span className="truncate">
            <span className="font-semibold text-ink">{formatFullDateCap(today)}</span>
            <span className="hidden text-ink-2 sm:inline">
              {' '}
              — semaine {week.week}, {formatPeriodShort(week.start, week.end)}
            </span>
          </span>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <SaveIndicator />
          {meeting && (
            <Button variant="primary" icon={Play} onClick={launch} className="max-sm:px-3">
              <span className="max-sm:hidden">Lancer la présentation</span>
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1480px] px-4 py-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  )
}
