import { useEffect, type ReactNode } from 'react'
import { createBrowserRouter, createHashRouter, createMemoryRouter, Navigate, RouterProvider, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
import { Splash } from '@/components/layout/Splash'
import { ConfirmHost } from '@/components/ui/Dialog'
import { env } from '@/config/env'
import { isAdmin } from '@/domain/permissions'
import { currentMeeting } from '@/domain/selectors'
import { AiCompanyPage } from '@/pages/AiCompanyPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { LoginPage } from '@/pages/LoginPage'
import { MeetingPage } from '@/pages/MeetingPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PresentPage } from '@/pages/PresentPage'
import { ServiceWorkspacePage } from '@/pages/ServiceWorkspacePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { useAppStore } from '@/store/useAppStore'

function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAppStore((s) => s.status)
  const user = useAppStore((s) => s.user)
  const location = useLocation()
  if (status !== 'ready') return <Splash />
  if (!user) return <Navigate to="/connexion" replace state={{ from: location.pathname }} />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const user = useAppStore((s) => s.user)
  if (!isAdmin(user)) return <Navigate to="/" replace />
  return <>{children}</>
}

/** Raccourcis : /reunion-en-cours et /mon-espace. */
function CurrentRedirect({ to }: { to: 'meeting' | 'space' }) {
  const snapshot = useAppStore((s) => s.snapshot)
  const user = useAppStore((s) => s.user)
  const today = useAppStore((s) => s.today)
  const nowTime = useAppStore((s) => s.nowTime)
  const meeting = snapshot ? currentMeeting(snapshot.meetings, snapshot.settings, today, nowTime) : null
  if (!meeting) return <Navigate to="/historique" replace />
  if (to === 'space' && user?.serviceId) return <Navigate to={`/reunions/${meeting.id}/services/${user.serviceId}`} replace />
  return <Navigate to={`/reunions/${meeting.id}`} replace />
}

const routes = [
  { path: '/connexion', element: <LoginPage /> },
  {
    path: '/reunions/:meetingId/presentation',
    element: (
      <RequireAuth>
        <PresentPage />
      </RequireAuth>
    ),
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'reunion-en-cours', element: <CurrentRedirect to="meeting" /> },
      { path: 'mon-espace', element: <CurrentRedirect to="space" /> },
      { path: 'reunions/:meetingId', element: <MeetingPage /> },
      { path: 'reunions/:meetingId/services/:serviceId', element: <ServiceWorkspacePage /> },
      { path: 'historique', element: <HistoryPage /> },
      {
        path: 'ai-company/:tab?',
        element: (
          <RequireAdmin>
            <AiCompanyPage />
          </RequireAdmin>
        ),
      },
      {
        path: 'parametres',
        element: (
          <RequireAdmin>
            <SettingsPage />
          </RequireAdmin>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

// « memory » : page hébergée dans un cadre sécurisé (claude.ai), l'adresse ne change pas.
const router = env.router === 'memory' ? createMemoryRouter(routes) : env.router === 'hash' ? createHashRouter(routes) : createBrowserRouter(routes)

export function App() {
  const init = useAppStore((s) => s.init)
  const tick = useAppStore((s) => s.tick)

  useEffect(() => {
    void init()
    // La date, le numéro de semaine et l'heure se mettent à jour d'eux-mêmes.
    const t = window.setInterval(tick, 30_000)
    return () => window.clearInterval(t)
  }, [init, tick])

  return (
    <>
      <RouterProvider router={router} />
      <ConfirmHost />
      <Toaster position="bottom-right" richColors closeButton toastOptions={{ style: { fontFamily: 'Source Sans 3, sans-serif', fontSize: 15 } }} />
    </>
  )
}
