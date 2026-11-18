// ---------------------------------------------------------------------------
// Intégration à l'hébergement sur claude.ai (page « artefact »).
// La page y tourne dans un cadre sécurisé : les téléchargements passent par la
// capacité `downloads` (le visiteur confirme chaque fichier). Hors de cet
// hébergement (Vercel, Netlify, serveur interne…), le téléchargement est classique.
// ---------------------------------------------------------------------------

interface DownloadsApi {
  save(request: { filename: string; data: string | Blob | ArrayBuffer }): Promise<{ status: 'saved' | 'delivered' }>
}

interface ClaudeRuntime {
  use(name: string): Promise<unknown>
}

function runtime(): ClaudeRuntime | null {
  const candidate = (window as unknown as { claude?: ClaudeRuntime }).claude
  return candidate && typeof candidate.use === 'function' ? candidate : null
}

/** La page est-elle servie par l'hébergement claude.ai ? */
export const isHostedOnClaude = () => runtime() !== null

let downloads: Promise<DownloadsApi | null> | null = null

function getDownloads(): Promise<DownloadsApi | null> {
  if (!downloads) {
    const rt = runtime()
    downloads = rt
      ? rt
          .use('downloads')
          .then((ns) => (ns as DownloadsApi | null) ?? null)
          .catch(() => null)
      : Promise.resolve(null)
  }
  return downloads
}

const ERROR_MESSAGES: Record<string, string> = {
  rejected_extension: 'Ce type de fichier ne peut pas être téléchargé depuis cette page.',
  extension_not_enabled: 'Ce format n’est pas disponible dans cette vue.',
  too_large: 'Le fichier est trop volumineux pour être téléchargé ici.',
  rate_limited: 'Un téléchargement est déjà en attente de confirmation : réessayez dans un instant.',
}

export type SaveOutcome = 'saved' | 'declined'

/**
 * Propose un fichier au visiteur. Renvoie « declined » s'il refuse ;
 * lève une erreur explicite si le téléchargement est impossible.
 */
export async function saveFile(data: Blob, filename: string): Promise<SaveOutcome> {
  if (isHostedOnClaude()) {
    const api = await getDownloads()
    if (!api) throw new Error('Les téléchargements ne sont pas disponibles dans cette vue.')
    try {
      await api.save({ filename, data })
      return 'saved'
    } catch (error) {
      const code = (error as { code?: string }).code ?? 'unavailable'
      if (code === 'declined') return 'declined'
      throw new Error(ERROR_MESSAGES[code] ?? 'Le téléchargement n’est pas disponible dans cette vue.')
    }
  }
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return 'saved'
}

/** Convertit une data URL (pièce jointe en mode démonstration) en Blob. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, body] = dataUrl.split(',', 2)
  const mime = /data:([^;,]+)/.exec(header)?.[1] ?? 'application/octet-stream'
  if (header.includes(';base64')) {
    const binary = atob(body)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  }
  return new Blob([decodeURIComponent(body)], { type: mime })
}

/** Copie un texte (appel depuis un clic). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
