import {
  createMattermostClient,
  createMattermostWebsocket,
  ensureMattermostWsGlobals,
} from './client.js'
import type { MattermostResolvedAccount } from './types.js'

export type MattermostWebsocketEvent = {
  event: string
  data: Record<string, string | undefined>
  broadcast?: Record<string, string | undefined>
}

export type MattermostWebsocketHandlers = {
  onMessage: (event: MattermostWebsocketEvent) => void | Promise<void>
  onOpen?: () => void
  onClose?: (code: number, reason: string) => void
  onError?: (error: Error) => void
}

const getWsUrl = (account: MattermostResolvedAccount) =>
  createMattermostClient(account).getWebSocketUrl().replace(/^http/i, 'ws')

export const connectWebsocket = async (
  account: MattermostResolvedAccount,
  handlers: MattermostWebsocketHandlers,
): Promise<{
  close: () => void
  sendTyping: (params: { channelId: string; rootId?: string }) => void
}> => {
  const wsUrl = getWsUrl(account)
  await ensureMattermostWsGlobals()
  const wsClient = createMattermostWebsocket()

  wsClient.addMessageListener((payload: unknown) => {
    try {
      handlers.onMessage(payload as unknown as MattermostWebsocketEvent)
    } catch (error) {
      handlers.onError?.(error as Error)
    }
  })

  wsClient.addFirstConnectListener(() => {
    handlers.onOpen?.()
  })

  wsClient.addReconnectListener(() => {
    handlers.onOpen?.()
  })

  wsClient.addErrorListener((event: unknown) => {
    const message =
      event instanceof Error ? event.message : 'Mattermost websocket error'
    handlers.onError?.(new Error(message))
  })

  wsClient.addCloseListener((count: number) => {
    handlers.onClose?.(4000, `websocket closed (retries=${count})`)
  })

  wsClient.initialize(wsUrl, account.token)

  return {
    close: () => wsClient.close(),
    sendTyping: (params) =>
      wsClient.userTyping(params.channelId, params.rootId ?? ''),
  }
}
