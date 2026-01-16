export type MattermostAccountConfig = {
  name?: string
  enabled?: boolean
  baseUrl?: string
  token?: string
  allowFrom?: string[]
  mediaMaxMb?: number
  requireDirectAllowlist?: boolean
  replyToMode?: 'off' | 'first' | 'all'
  debugLog?: boolean
}

export type MattermostChannelConfig = {
  defaultAccount?: string
  allowFrom?: string[]
  debugLog?: boolean
  accounts?: Record<string, MattermostAccountConfig>
}

export type MattermostResolvedAccount = {
  accountId: string
  name?: string
  enabled: boolean
  baseUrl: string
  token: string
  allowFrom?: string[]
  mediaMaxBytes?: number
  requireDirectAllowlist: boolean
  replyToMode: 'off' | 'first' | 'all'
  debugLog?: boolean
}

export type MattermostRuntime = {
  client?: {
    close: () => void
    sendTyping: (params: { channelId: string; rootId?: string }) => void
  }
}
