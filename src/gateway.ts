import type { Channel } from '@mattermost/types/channels'
import type { UserProfile } from '@mattermost/types/users'

import type { ChannelGatewayContext } from './clawdbot.js'
import { createMattermostClient } from './client.js'
import { loadCoreChannelDeps } from './core-bridge.js'
import { buildEnvelope } from './inbound.js'
import { processMattermostPostedEvent } from './monitor.js'
import type { MattermostResolvedAccount, MattermostRuntime } from './types.js'
import { connectWebsocket } from './websocket.js'

export type GatewayDependencies = {
  onEnvelope?: (envelope: Record<string, unknown>) => void
  resolveSelfUserId?: (
    account: MattermostResolvedAccount,
  ) => Promise<string | undefined>
}

const resolveSelfUserId = async (account: MattermostResolvedAccount) => {
  try {
    const response = await createMattermostClient(account).getMe()
    return response?.id
  } catch {
    return undefined
  }
}

export const startGateway = async (
  ctx: ChannelGatewayContext<MattermostResolvedAccount>,
  deps?: GatewayDependencies,
) => {
  const runtime = ctx.runtime as MattermostRuntime
  const selfUserId = deps?.resolveSelfUserId
    ? await deps.resolveSelfUserId(ctx.account)
    : await resolveSelfUserId(ctx.account)

  const coreDeps = await loadCoreChannelDeps()

  const mmClient = createMattermostClient(ctx.account)

  const logInfo = ctx.account.debugLog ? ctx.log?.info : ctx.log?.debug
  const logWarn = ctx.account.debugLog ? ctx.log?.warn : ctx.log?.debug
  const logError = ctx.account.debugLog ? ctx.log?.error : ctx.log?.debug

  if (selfUserId) {
    logInfo?.(`mattermost self user id ${selfUserId}`)
  } else {
    logWarn?.('mattermost self user id not resolved')
  }

  logInfo?.('mattermost websocket connecting')

  const client = await connectWebsocket(ctx.account, {
    onOpen: () => {
      logInfo?.('mattermost websocket connected')
      ctx.setStatus({ ...ctx.getStatus(), connected: true, running: true })
    },
    onClose: (code, reason) => {
      const suffix = reason ? `: ${reason}` : ''
      logWarn?.(`mattermost websocket closed (${code})${suffix}`)
      ctx.setStatus({
        ...ctx.getStatus(),
        connected: false,
        running: false,
        lastError: reason || `Websocket closed (${code})`,
      })
    },
    onError: (error) => {
      logError?.(`mattermost websocket error: ${error.message}`)
      ctx.setStatus({
        ...ctx.getStatus(),
        connected: false,
        running: false,
        lastError: error.message,
      })
    },
    onMessage: async (event) => {
      const envelope = await buildEnvelope(event, {
        account: ctx.account,
        selfUserId,
      })
      if (envelope) {
        ctx.setStatus({
          ...ctx.getStatus(),
          lastInboundAt: Date.now(),
        })
        deps?.onEnvelope?.(envelope)
      }

      await processMattermostPostedEvent({
        event,
        deps: {
          account: ctx.account,
          config: ctx.cfg,
          client: {
            getChannel: (channelId) =>
              mmClient.getChannel(channelId) as Promise<Channel>,
            getUser: (userId) =>
              mmClient.getUser(userId) as Promise<UserProfile>,
            getFileInfosForPost: (postId) =>
              mmClient.getFileInfosForPost(postId),
          },
          core: coreDeps,
          runtime: {
            error: (message) => logError?.(message),
            info: (message) => logInfo?.(message),
            debug: (message) => logInfo?.(message),
          },
          selfUserId,
        },
      })
    },
  })

  runtime.client = client
  ctx.setStatus({
    ...ctx.getStatus(),
    connected: true,
    running: true,
    lastStartAt: Date.now(),
  })
  return runtime
}

export const stopGateway = async (
  ctx: ChannelGatewayContext<MattermostResolvedAccount>,
) => {
  const runtime = ctx.runtime as MattermostRuntime
  runtime.client?.close()
  runtime.client = undefined
  ctx.setStatus({
    ...ctx.getStatus(),
    connected: false,
    running: false,
    lastStopAt: Date.now(),
  })
}
