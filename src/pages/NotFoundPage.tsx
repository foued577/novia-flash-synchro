import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/ui/Misc'

export function NotFoundPage() {
  return (
    <div className="panel">
      <EmptyState
        icon={Compass}
        title="Page introuvable"
        action={
          <Link to="/" className="font-semibold text-novia-600 hover:underline">
            Revenir au tableau de bord
          </Link>
        }
      >
        L’adresse demandée n’existe pas ou la réunion a été supprimée.
      </EmptyState>
    </div>
  )
}
