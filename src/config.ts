import type {
  ChannelAccountSnapshot,
  ChannelConfigAdapter,
} from './clawdbot.js'
import type {
  MattermostChannelConfig,
  MattermostResolvedAccount,
} from './types.js'

const DEFAULT_MEDIA_MB = 25
const DEFAULT_REPLY_MODE: MattermostResolvedAccount['replyToMode'] = 'off'

const normalizeBaseUrl = (raw: string): string => raw.replace(/\/+$/, '')

const defaultAccountConfig = (): MattermostResolvedAccount => ({
  accountId: 'default',
  enabled: true,
  baseUrl: '',
  token: '',
  requireDirectAllowlist: false,
  replyToMode: DEFAULT_REPLY_MODE,
})

const normalizeAllowFrom = (allowFrom?: string[]): string[] | undefined => {
  if (!allowFrom?.length) {
    return undefined
  }

  const deduped = new Set(
    allowFrom.map((entry) => entry.trim()).filter(Boolean),
  )
  return deduped.size ? Array.from(deduped) : undefined
}

const resolveMattermostConfig = (
  cfg: unknown,
): MattermostChannelConfig | undefined => {
  const root = cfg as { channels?: { mattermost?: MattermostChannelConfig } }
  return (
    root?.channels?.mattermost ?? (cfg as MattermostChannelConfig | undefined)
  )
}

export const listAccountIds = (cfg: unknown): string[] => {
  const config = resolveMattermostConfig(cfg)
  const accounts = config?.accounts ?? {}
  const ids = Object.keys(accounts)
  if (!ids.length) {
    return ['default']
  }
  return ids
}

export const resolveAccount = (
  cfg: unknown,
  accountId?: string | null,
): MattermostResolvedAccount => {
  const config = resolveMattermostConfig(cfg)
  const baseConfig = config?.accounts?.[accountId ?? '']
  const fallbackConfig = config?.accounts?.default

  const defaults = defaultAccountConfig()
  const merged = {
    ...defaults,
    ...fallbackConfig,
    ...baseConfig,
    accountId: accountId ?? 'default',
  }

  return {
    ...merged,
    enabled: merged.enabled ?? true,
    baseUrl: merged.baseUrl ? normalizeBaseUrl(merged.baseUrl) : '',
    token: merged.token ?? '',
    allowFrom: normalizeAllowFrom(merged.allowFrom ?? config?.allowFrom),
    mediaMaxBytes: (merged.mediaMaxMb ?? DEFAULT_MEDIA_MB) * 1024 * 1024,
    requireDirectAllowlist: merged.requireDirectAllowlist ?? false,
    replyToMode: merged.replyToMode ?? DEFAULT_REPLY_MODE,
    debugLog: merged.debugLog ?? config?.debugLog ?? false,
  }
}

export const defaultAccountId = (cfg: unknown): string => {
  const config = resolveMattermostConfig(cfg)
  const fallback = config?.defaultAccount
  if (fallback && listAccountIds(cfg).includes(fallback)) {
    return fallback
  }
  return listAccountIds(cfg)[0] ?? 'default'
}

export const isConfigured = (account: MattermostResolvedAccount): boolean => {
  return Boolean(account.baseUrl && account.token)
}

export const describeAccount = (
  account: MattermostResolvedAccount,
): ChannelAccountSnapshot => ({
  accountId: account.accountId,
  name: account.name,
  enabled: account.enabled,
  configured: isConfigured(account),
  baseUrl: account.baseUrl || null,
})

export const resolveAllowFrom = (params: {
  cfg: unknown
  accountId?: string | null
}): string[] | undefined => {
  return resolveAccount(params.cfg, params.accountId).allowFrom
}

export const formatAllowFrom = (params: {
  cfg: unknown
  accountId?: string | null
  allowFrom: Array<string | number>
}): string[] => {
  return params.allowFrom.map((entry) => String(entry))
}

export const mattermostConfigAdapter: ChannelConfigAdapter<MattermostResolvedAccount> =
  {
    listAccountIds,
    resolveAccount,
    defaultAccountId,
    isConfigured,
    describeAccount,
    resolveAllowFrom,
    formatAllowFrom,
  }
