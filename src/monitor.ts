import type { Channel } from '@mattermost/types/channels'
import type { FileInfo } from '@mattermost/types/files'
import type { Post } from '@mattermost/types/posts'
import type { UserProfile } from '@mattermost/types/users'

import { buildAllowlist, isAllowed } from './allowlist.js'

import { createMattermostClient } from './client.js'
import { fetchMedia, saveMediaBuffer } from './media.js'
import type { loadCoreChannelDeps } from './core-bridge.js'
import type { MattermostResolvedAccount } from './types.js'
import type { MattermostWebsocketEvent } from './websocket.js'

export type MonitorDeps = {
  account: MattermostResolvedAccount
  config: unknown
  client: {
    getChannel: (channelId: string) => Promise<Channel>
    getUser: (userId: string) => Promise<UserProfile>
    getFileInfosForPost: (postId: string) => Promise<FileInfo[]>
  }
  core: Awaited<ReturnType<typeof loadCoreChannelDeps>>
  runtime: {
    error?: (message: string) => void
    info?: (message: string) => void
    debug?: (message: string) => void
  }
  selfUserId?: string
}

const buildSenderLabel = (profile?: UserProfile | null, fallback?: string) => {
  if (!profile) {
    const raw = fallback?.trim() || 'unknown'
    return { name: raw, username: undefined }
  }
  const fullName = [profile.first_name, profile.last_name]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' ')
    .trim()
  const username = profile.username?.trim()
  const label = fullName || username || profile.id
  return { name: label, username: username || undefined }
}

const normalizeCoreConfig = (cfg: unknown): unknown => {
  if (!cfg || typeof cfg !== 'object') return cfg
  const root = cfg as {
    agent?: unknown
    agents?: {
      defaults?: Record<string, unknown>
      list?: Array<Record<string, unknown>>
    }
    bindings?: Array<Record<string, unknown>>
    routing?: Record<string, unknown>
  }
  const agentsList = Array.isArray(root.agents?.list) ? root.agents?.list : []
  const routingAgents: Record<string, unknown> = {}
  for (const entry of agentsList) {
    if (!entry || typeof entry !== 'object') continue
    const id = typeof entry.id === 'string' ? entry.id.trim() : ''
    if (!id) continue
    routingAgents[id] = {
      name: entry.name,
      workspace: entry.workspace,
      agentDir: entry.agentDir,
      model: entry.model,
      memorySearch: entry.memorySearch,
      humanDelay: entry.humanDelay,
      heartbeat: entry.heartbeat,
      identity: entry.identity,
      groupChat: entry.groupChat,
      subagents: entry.subagents,
      sandbox: entry.sandbox,
      tools: entry.tools,
    }
  }

  const defaultAgentId = (() => {
    const defaultEntry = agentsList.find((entry) => entry?.default)
    const raw =
      (typeof defaultEntry?.id === 'string' && defaultEntry?.id.trim()) ||
      (typeof agentsList[0]?.id === 'string' && agentsList[0]?.id.trim())
    return raw || undefined
  })()

  const routing = {
    ...(root.routing ?? {}),
  } as Record<string, unknown>
  if (!routing.agents && Object.keys(routingAgents).length > 0) {
    routing.agents = routingAgents
  }
  if (!routing.defaultAgentId && defaultAgentId) {
    routing.defaultAgentId = defaultAgentId
  }

  return {
    ...root,
    agent: root.agent ?? root.agents?.defaults,
    routing,
  }
}

export const processMattermostPostedEvent = async (params: {
  event: MattermostWebsocketEvent
  deps: MonitorDeps
}) => {
  const { event, deps } = params
  const log = deps.runtime.info ?? deps.runtime.debug
  if (event.event !== 'posted') {
    log?.(`mattermost ignored event ${event.event}`)
    return
  }
  const postRaw = event.data.post
  if (!postRaw) return
  let post: Post
  try {
    post = JSON.parse(postRaw) as Post
  } catch {
    return
  }
  if (!post?.id || !post.channel_id || !post.user_id) return
  if (deps.selfUserId && post.user_id === deps.selfUserId) {
    log?.(`mattermost ignored self post ${post.id}`)
    return
  }
  if (post.type?.startsWith('system_')) return

  const allowlist = buildAllowlist(deps.account.allowFrom)
  if (!isAllowed(allowlist, post.channel_id)) return

  let channel: Channel | null = null
  try {
    channel = await deps.client.getChannel(post.channel_id)
  } catch {
    return
  }
  if (!channel) return

  log?.(
    `mattermost posted event ${post.id} channel=${channel.id} type=${channel.type} user=${post.user_id}`,
  )

  const senderProfile = await deps.client
    .getUser(post.user_id)
    .catch(() => null)
  const senderLabel = buildSenderLabel(senderProfile, event.data.sender_name)

  const isDirectMessage = channel.type === 'D'
  const isGroupMessage = channel.type === 'G'
  const peer = isDirectMessage
    ? { kind: 'dm' as const, id: post.user_id }
    : isGroupMessage
      ? { kind: 'group' as const, id: channel.id }
      : { kind: 'channel' as const, id: channel.id }

  const coreConfig = normalizeCoreConfig(deps.config)

  const route = deps.core.resolveAgentRoute({
    cfg: coreConfig,
    channel: 'mattermost',
    accountId: deps.account.accountId,
    peer,
  })

  const rawBody = (post.message ?? '').trim()
  const fileIds = post.file_ids ?? []
  if (!rawBody && fileIds.length === 0) return

  const media: FileInfo[] = fileIds.length
    ? await deps.client.getFileInfosForPost(post.id).catch(() => [])
    : []
  const mediaInfo = media.find((info) => info.id === fileIds[0]) ?? media[0]
  const mediaLabel =
    mediaInfo?.name ?? (fileIds.length ? 'attachment' : undefined)

  const mediaPath = await (async () => {
    if (!fileIds.length) return undefined
    const fileId = fileIds[0] ?? ''
    if (!fileId) return undefined
    const fileUrl = new URL(
      createMattermostClient(deps.account).getFileUrl(fileId, 0),
    )
    fileUrl.searchParams.set('download', '1')
    fileUrl.searchParams.set('access_token', deps.account.token)
    const payload = await fetchMedia(
      fileUrl.toString(),
      deps.account.mediaMaxBytes ?? 0,
      {
        headers: {
          Authorization: `BEARER ${deps.account.token}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
      },
    ).catch(() => undefined)
    if (!payload) return undefined
    const saved = await saveMediaBuffer(payload)
    return saved.path
  })()

  const contentText = rawBody || (mediaLabel ? `[media: ${mediaLabel}]` : '')
  if (!contentText) return
  const body = deps.core.formatAgentEnvelope({
    channel: 'Mattermost',
    from: senderLabel.name,
    timestamp: post.create_at ?? undefined,
    body: contentText,
  })

  const ctxPayload = {
    Body: body,
    RawBody: contentText,
    CommandBody: contentText,
    From: isDirectMessage
      ? `mattermost:${post.user_id}`
      : isGroupMessage
        ? `mattermost:group:${channel.id}`
        : `mattermost:channel:${channel.id}`,
    To: `channel:${channel.id}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isDirectMessage ? 'direct' : isGroupMessage ? 'group' : 'channel',
    SenderName: senderLabel.name,
    SenderId: post.user_id,
    SenderUsername: senderLabel.username ?? undefined,
    GroupSubject: isDirectMessage ? undefined : channel.display_name,
    GroupRoom: isDirectMessage ? undefined : channel.name,
    Provider: 'mattermost' as const,
    Surface: 'mattermost' as const,
    WasMentioned: isDirectMessage ? true : undefined,
    CommandAuthorized: true,
    MessageSid: post.id,
    ReplyToId: post.root_id?.trim() || post.id,
    MessageThreadId: post.root_id?.trim() || undefined,
    Timestamp: post.create_at ?? undefined,
    OriginatingChannel: 'mattermost' as const,
    OriginatingTo: `channel:${channel.id}`,
    MediaUrl: mediaPath,
    MediaPath: mediaPath,
    MediaId: mediaInfo?.id,
    MediaName: mediaInfo?.name,
    MediaType: mediaInfo?.mime_type,
    MediaSize: mediaInfo?.size,
  }

  const replyTarget = `channel:${channel.id}`
  const { dispatcher, replyOptions, markDispatchIdle } =
    deps.core.createReplyDispatcherWithTyping({
      deliver: async (payload: unknown) => {
        const replyText = (payload as { text?: string }).text
        if (!replyText) return
        const client = createMattermostClient(deps.account)
        await client.createPost({
          channel_id: channel.id,
          message: replyText,
          root_id: post.root_id?.trim() || undefined,
        })
      },
      responsePrefix: (coreConfig as { messages?: { responsePrefix?: string } })
        ?.messages?.responsePrefix,
      humanDelay: undefined,
      onError: (err: unknown) => {
        deps.runtime.error?.(`mattermost reply failed: ${String(err)}`)
      },
      onReplyStart: async () => {},
    })

  await deps.core.dispatchReplyFromConfig({
    ctx: {
      ...ctxPayload,
      OriginatingChannel: 'mattermost',
      OriginatingTo: replyTarget,
    },
    cfg: coreConfig,
    dispatcher,
    replyOptions,
  })
  markDispatchIdle()
}
