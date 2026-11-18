// Configuration lue au build (variables VITE_*). Voir .env.example.

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ''
const requestedMode = (import.meta.env.VITE_DATA_MODE as string | undefined)?.trim() ?? 'demo'

const supabaseConfigured = url.startsWith('http') && anonKey.length > 20 && !url.includes('votre-projet')

export const env = {
  /** Le mode Supabase n'est activé que si la configuration est complète. */
  dataMode: (requestedMode === 'supabase' && supabaseConfigured ? 'supabase' : 'demo') as 'demo' | 'supabase',
  supabaseRequestedButMissing: requestedMode === 'supabase' && !supabaseConfigured,
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  router: (['hash', 'memory'].includes(import.meta.env.VITE_ROUTER as string) ? import.meta.env.VITE_ROUTER : 'browser') as 'hash' | 'browser' | 'memory',
}
