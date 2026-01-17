export type PluginLogger = {
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
  debug?: (message: string) => void
}

export type ChannelDock = {
  id: ChannelId
  capabilities: ChannelCapabilities
  config?: {
    resolveAllowFrom?: (params: {
      cfg: unknown
      accountId?: string | null
    }) => Array<string | number> | undefined
    formatAllowFrom?: (params: {
      cfg: unknown
      accountId?: string | null
      allowFrom: Array<string | number>
    }) => string[]
  }
  groups?: ChannelGroupAdapter
}

export type ClawdbotPluginApi = {
  id: string
  name: string
  version?: string
  description?: string
  config: unknown
  logger: PluginLogger
  registerChannel: <ResolvedAccount>(registration: {
    plugin: ChannelPlugin<ResolvedAccount>
    dock?: ChannelDock
  }) => void
}

export type ChannelId = string

export type ChannelMeta = {
  id: ChannelId
  label: string
  selectionLabel: string
  docsPath: string
  blurb: string
  docsLabel?: string
  aliases?: string[]
  order?: number
  selectionExtras?: string[]
  quickstartAllowFrom?: boolean
}

export type ChannelCapabilities = {
  chatTypes: Array<'direct' | 'group' | 'channel' | 'thread'>
  polls?: boolean
  reactions?: boolean
  threads?: boolean
  media?: boolean
  nativeCommands?: boolean
  blockStreaming?: boolean
}

export type ChannelAccountSnapshot = {
  accountId: string
  name?: string
  enabled?: boolean
  configured?: boolean
  running?: boolean
  connected?: boolean
  lastStartAt?: number | null
  lastStopAt?: number | null
  lastError?: string | null
  lastInboundAt?: number | null
  lastOutboundAt?: number | null
  baseUrl?: string | null
}

export type ChannelConfigAdapter<ResolvedAccount> = {
  listAccountIds: (cfg: unknown) => string[]
  resolveAccount: (cfg: unknown, accountId?: string | null) => ResolvedAccount
  defaultAccountId?: (cfg: unknown) => string
  setAccountEnabled?: (params: {
    cfg: unknown
    accountId: string
    enabled: boolean
  }) => unknown
  deleteAccount?: (params: { cfg: unknown; accountId: string }) => unknown
  isConfigured?: (
    account: ResolvedAccount,
    cfg: unknown,
  ) => boolean | Promise<boolean>
  describeAccount?: (
    account: ResolvedAccount,
    cfg: unknown,
  ) => ChannelAccountSnapshot
  resolveAllowFrom?: (params: {
    cfg: unknown
    accountId?: string | null
  }) => string[] | undefined
  formatAllowFrom?: (params: {
    cfg: unknown
    accountId?: string | null
    allowFrom: Array<string | number>
  }) => string[]
}

export type OutboundSendDeps = {
  sendMSTeams?: (
    to: string,
    text: string,
    opts?: { mediaUrl?: string },
  ) => Promise<{
    messageId: string
    conversationId: string
  }>
}

export type ChannelOutboundContext = {
  cfg: unknown
  to: string
  text: string
  mediaUrl?: string
  replyToId?: string | null
  threadId?: string | number | null
  accountId?: string | null
  deps?: OutboundSendDeps
  gifPlayback?: boolean
}

export type OutboundDeliveryResult = {
  channel: string
  messageId: string
  channelId?: string
  roomId?: string
  conversationId?: string
  timestamp?: number
  meta?: Record<string, unknown>
}

export type ChannelOutboundAdapter = {
  deliveryMode: 'direct' | 'gateway' | 'hybrid'
  chunker?: ((text: string, limit: number) => string[]) | null
  textChunkLimit?: number
  resolveTarget?: (params: {
    cfg?: unknown
    to?: string
    allowFrom?: string[]
    accountId?: string | null
    mode?: 'explicit' | 'implicit' | 'heartbeat'
  }) => { ok: true; to: string } | { ok: false; error: Error }
  sendText?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>
  sendMedia?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>
  sendTyping?: (ctx: ChannelOutboundContext) => Promise<void>
}

export type ChannelStatusAdapter<ResolvedAccount> = {
  defaultRuntime?: ChannelAccountSnapshot
  buildChannelSummary?: (params: {
    account: ResolvedAccount
    cfg: unknown
    defaultAccountId: string
    snapshot: ChannelAccountSnapshot
  }) => Record<string, unknown> | Promise<Record<string, unknown>>
  buildAccountSnapshot?: (params: {
    account: ResolvedAccount
    cfg: unknown
    runtime?: ChannelAccountSnapshot
    probe?: unknown
  }) => ChannelAccountSnapshot | Promise<ChannelAccountSnapshot>
  probeAccount?: (params: {
    account: ResolvedAccount
    timeoutMs: number
    cfg: unknown
  }) => Promise<unknown>
  collectStatusIssues?: (accounts: ChannelAccountSnapshot[]) => Array<{
    channel: ChannelId
    accountId: string
    kind: 'intent' | 'permissions' | 'config' | 'auth' | 'runtime'
    message: string
    fix?: string
  }>
}

export type ChannelGatewayContext<ResolvedAccount> = {
  cfg: unknown
  accountId: string
  account: ResolvedAccount
  runtime: unknown
  abortSignal: AbortSignal
  log?: PluginLogger
  getStatus: () => ChannelAccountSnapshot
  setStatus: (next: ChannelAccountSnapshot) => void
  emitEnvelope?: (envelope: Record<string, unknown>) => void
}

export type ChannelGatewayAdapter<ResolvedAccount> = {
  startAccount?: (
    ctx: ChannelGatewayContext<ResolvedAccount>,
  ) => Promise<unknown>
  stopAccount?: (ctx: ChannelGatewayContext<ResolvedAccount>) => Promise<void>
}

export type ChannelEventAdapter = {
  onEnvelope?: (envelope: Record<string, unknown>) => void
}

export type ChannelGroupAdapter = {
  resolveRequireMention?: (params: {
    cfg: unknown
    groupId?: string | null
    groupRoom?: string | null
    groupSpace?: string | null
    accountId?: string | null
  }) => boolean | undefined
}

export type ChannelThreadingAdapter = {
  resolveReplyToMode?: (params: {
    cfg: unknown
    accountId?: string | null
  }) => 'off' | 'first' | 'all'
  allowTagsWhenOff?: boolean
  buildToolContext?: (params: {
    cfg: unknown
    accountId?: string | null
    context: {
      Channel?: string
      To?: string
      ReplyToId?: string
      ThreadLabel?: string
      MessageThreadId?: string | number
    }
    hasRepliedRef?: { value: boolean }
  }) =>
    | {
        currentChannelId?: string
        currentThreadTs?: string
        replyToMode?: 'off' | 'first' | 'all'
        hasRepliedRef?: { value: boolean }
      }
    | undefined
}

export type ChannelMessagingAdapter = {
  normalizeTarget?: (raw: string) => string | undefined
}

export type ChannelPlugin<ResolvedAccount = unknown> = {
  id: ChannelId
  meta: ChannelMeta
  capabilities: ChannelCapabilities
  reload?: { configPrefixes: string[]; noopPrefixes?: string[] }
  config: ChannelConfigAdapter<ResolvedAccount>
  outbound?: ChannelOutboundAdapter
  status?: ChannelStatusAdapter<ResolvedAccount>
  gateway?: ChannelGatewayAdapter<ResolvedAccount>
  events?: ChannelEventAdapter
  groups?: ChannelGroupAdapter
  threading?: ChannelThreadingAdapter
  messaging?: ChannelMessagingAdapter
}
