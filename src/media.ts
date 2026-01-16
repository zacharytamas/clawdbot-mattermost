import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const CACHE_DIR = '/tmp/clawdbot-mattermost-media'

export type MediaPayload = {
  buffer: Buffer
  filename: string
  contentType?: string
}

const ensureCacheDir = async () => {
  await mkdir(CACHE_DIR, { recursive: true })
}

const sanitizeFilename = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_')

export const fetchMedia = async (
  mediaUrl: string,
  maxBytes: number,
  options?: { headers?: Record<string, string> },
): Promise<MediaPayload> => {
  const response = await fetch(mediaUrl, {
    headers: {
      ...options?.headers,
      Accept: options?.headers?.Accept ?? '*/*',
      'X-Requested-With': 'XMLHttpRequest',
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`)
  }
  const contentLength = response.headers.get('content-length')
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error('Media exceeds configured size limit')
  }
  const arrayBuffer = await response.arrayBuffer()
  if (arrayBuffer.byteLength > maxBytes) {
    throw new Error('Media exceeds configured size limit')
  }
  const url = new URL(mediaUrl)
  const filename = sanitizeFilename(url.pathname.split('/').pop() || 'media')
  return {
    buffer: Buffer.from(arrayBuffer),
    filename,
    contentType: response.headers.get('content-type') ?? undefined,
  }
}

export const saveMediaBuffer = async (
  payload: MediaPayload,
): Promise<{ path: string; url: string }> => {
  await ensureCacheDir()
  const hash = createHash('sha256').update(payload.buffer).digest('hex')
  const ext = extname(payload.filename) || ''
  const filename = `${hash}${ext}`
  const filepath = join(CACHE_DIR, filename)
  await writeFile(filepath, payload.buffer)
  return { path: filepath, url: `file://${filepath}` }
}
