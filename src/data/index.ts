import { env } from '@/config/env'
import { DemoRepository } from './demoRepository'
import type { DataRepository } from './repository'
import { SupabaseRepository } from './supabaseRepository'

let instance: DataRepository | null = null

/** Point d'accès unique aux données (démo ou Supabase selon la configuration). */
export function getRepository(): DataRepository {
  if (!instance) {
    instance = env.dataMode === 'supabase' ? new SupabaseRepository(env.supabaseUrl, env.supabaseAnonKey) : new DemoRepository()
  }
  return instance
}

export type { DataRepository } from './repository'
