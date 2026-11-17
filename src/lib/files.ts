// Outils de fichiers côté navigateur.

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Lecture du fichier impossible'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image illisible'))
    img.src = src
  })
}

/**
 * Redimensionne et compresse une image (JPEG/WebP) pour limiter le poids
 * stocké. Les PNG avec transparence sont conservés en PNG.
 */
export async function compressImage(file: File, maxSize = 1800, quality = 0.85): Promise<Blob> {
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
    return blob && blob.size < file.size ? blob : file
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Convertit n'importe quelle image (y compris SVG) en PNG data URL, pour l'export PowerPoint. */
export async function imageToPngDataUrl(src: string, maxSize = 1600): Promise<{ data: string; width: number; height: number }> {
  const img = await loadImage(src)
  const w = img.naturalWidth || 1200
  const h = img.naturalHeight || 675
  const scale = Math.min(1, maxSize / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponible')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { data: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}
