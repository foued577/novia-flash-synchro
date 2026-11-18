import { env } from '@/config/env'
import { DemoRepository } from './demoRepository'
import type { DataRepository } from './repository'
import { SupabaseRepository } from './supabaseRepository'

let instance: DataRepository | null = null

/** Point d'accès unique aux données (démo ou Supabase selon la configuration). */
export function getRepository(): DataRepository {
  if (!instance) {
    if (env.dataMode === 'supabase') forgetDemoData()
    instance = env.dataMode === 'supabase' ? new SupabaseRepository(env.supabaseUrl, env.supabaseAnonKey) : new DemoRepository()
  }
  return instance
}

/** Après le passage en production, efface les données de démonstration laissées dans le navigateur. */
function forgetDemoData() {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('novia-flash-synchro:demo')) window.localStorage.removeItem(key)
    }
  } catch {
    /* stockage indisponible */
  }
}

export type { DataRepository } from './repository'
