import type { ChannelOutboundContext, ChannelPlugin } from './clawdbot.js'
import { mattermostConfigAdapter, resolveAccount } from './config.js'
import { startGateway, stopGateway } from './gateway.js'
import { sendMattermost } from './send.js'
import type { MattermostResolvedAccount, MattermostRuntime } from './types.js'

const docsPath = 'docs/channels/mattermost'

const resolveAccountOrThrow = (
  cfg: unknown,
  accountId?: string | null,
): MattermostResolvedAccount => {
  const account = resolveAccount(cfg, accountId)
  if (!account.baseUrl || !account.token) {
    throw new Error('Mattermost account is not configured')
  }
  return account
}

const send = async (
  ctx: ChannelOutboundContext,
): Promise<{ channel: string; messageId: string }> => {
  const account = resolveAccountOrThrow(ctx.cfg, ctx.accountId)
  return sendMattermost(ctx, account)
}

export const mattermostPlugin: ChannelPlugin<MattermostResolvedAccount> = {
  id: 'mattermost',
  meta: {
    id: 'mattermost',
    label: 'Mattermost',
    selectionLabel: 'Mattermost',
    docsPath,
    blurb: 'Mattermost channel (PAT + WebSocket)',
    selectionExtras: ['Supports media', 'Typing indicators', 'Multi-account'],
    order: 20,
  },
  capabilities: {
    chatTypes: ['direct', 'group', 'channel', 'thread'],
    media: true,
    threads: true,
  },
  reload: {
    configPrefixes: ['channels.mattermost'],
    noopPrefixes: ['channels.mattermost.accounts'],
  },
  config: mattermostConfigAdapter,
  outbound: {
    deliveryMode: 'gateway',
    sendText: send,
    sendMedia: send,
    sendTyping: async (ctx) => {
      resolveAccountOrThrow(ctx.cfg, ctx.accountId)
      const runtime = (ctx.deps as MattermostRuntime | undefined) ?? undefined
      const client = runtime?.client
      if (!client) {
        return
      }
      const channelId = ctx.to.startsWith('channel:')
        ? ctx.to.slice('channel:'.length)
        : ctx.to
      client.sendTyping({
        channelId,
        rootId: ctx.threadId
          ? String(ctx.threadId)
          : (ctx.replyToId ?? undefined),
      })
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const runtime = (ctx.runtime as MattermostRuntime) ?? {}
      await startGateway(
        {
          ...ctx,
          runtime,
        },
        {
          onEnvelope: ctx.emitEnvelope,
        },
      )
      return runtime
    },
    stopAccount: stopGateway,
  },
  threading: {
    resolveReplyToMode: ({ cfg, accountId }) =>
      resolveAccount(cfg, accountId).replyToMode,
    allowTagsWhenOff: true,
    buildToolContext: ({ context }) => ({
      currentChannelId: context.Channel,
      currentThreadTs: context.MessageThreadId
        ? String(context.MessageThreadId)
        : undefined,
      replyToMode: 'off',
      hasRepliedRef: { value: false },
    }),
  },
  messaging: {
    normalizeTarget: (raw) => (raw ? `channel:${raw}` : undefined),
  },
}
