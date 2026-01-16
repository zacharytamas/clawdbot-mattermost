import type { FileInfo } from '@mattermost/types/files'
import { buildAllowlist, isAllowed } from './allowlist.js'
import { createMattermostClient } from './client.js'
import { fetchMedia, saveMediaBuffer } from './media.js'
import type { MattermostResolvedAccount } from './types.js'
import type { MattermostWebsocketEvent } from './websocket.js'

export type MattermostEnvelope = {
  Channel: 'mattermost'
  AccountId: string
  To: string
  From: string
  Body: string
  RawBody: string
  MessageSid: string
  ReplyToId?: string
  MessageThreadId?: string
  Timestamp: number
  IsGroup?: boolean
  MediaUrl?: string
  MediaPath?: string
}

export type MattermostInboundContext = {
  account: MattermostResolvedAccount
  selfUserId?: string
}

type MattermostPost = {
  id: string
  user_id: string
  channel_id: string
  message: string
  create_at: number
  root_id?: string | null
  file_ids?: string[]
}

type MattermostFileClient = {
  getFileInfosForPost: (postId: string) => Promise<FileInfo[]>
  getFileUrl: (fileId: string) => string
}

const parsePost = (
  payload: MattermostWebsocketEvent,
): MattermostPost | null => {
  if (payload.event !== 'posted') {
    return null
  }
  const postRaw = payload.data.post
  if (!postRaw) {
    return null
  }
  try {
    return JSON.parse(postRaw) as MattermostPost
  } catch {
    return null
  }
}

const normalizeTarget = (channelId: string) => `channel:${channelId}`

const hydrateMedia = async (
  account: MattermostResolvedAccount,
  post: MattermostPost,
) => {
  if (!post.file_ids?.length) {
    return undefined
  }
  const client = createMattermostClient(account)
  const fileId = post.file_ids[0]
  if (!fileId) {
    return undefined
  }
  const fileInfos = await client.getFileInfosForPost(post.id).catch(() => [])
  const fileInfo = fileInfos.find((info) => info.id === fileId) ?? fileInfos[0]
  const fileUrl = new URL(client.getFileUrl(fileId))
  fileUrl.searchParams.set('access_token', account.token)
  const payload = await fetchMedia(
    fileUrl.toString(),
    account.mediaMaxBytes ?? 0,
    {
      headers: {
        Authorization: `BEARER ${account.token}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
    },
  ).catch(() => undefined)
  if (!payload) {
    return undefined
  }
  const saved = await saveMediaBuffer(payload)
  return {
    url: saved.url,
    path: saved.path,
    filename: fileInfo?.name ?? payload.filename,
  }
}

export const buildEnvelope = async (
  payload: MattermostWebsocketEvent,
  context: MattermostInboundContext,
): Promise<MattermostEnvelope | null> => {
  const post = parsePost(payload)
  if (!post) {
    return null
  }
  if (context.selfUserId && post.user_id === context.selfUserId) {
    return null
  }
  const allowlist = buildAllowlist(context.account.allowFrom)
  if (!isAllowed(allowlist, post.channel_id)) {
    return null
  }
  const media = await hydrateMedia(context.account, post)
  return {
    Channel: 'mattermost',
    AccountId: context.account.accountId,
    To: normalizeTarget(post.channel_id),
    From: post.user_id,
    Body: post.message,
    RawBody: post.message,
    MessageSid: post.id,
    ReplyToId: post.root_id || undefined,
    MessageThreadId: post.root_id || undefined,
    Timestamp: post.create_at,
    IsGroup: true,
    MediaUrl: media?.url,
    MediaPath: media?.path,
  }
}
