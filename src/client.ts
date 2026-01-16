import { Client4, WebSocketClient } from '@mattermost/client'
import type { MattermostResolvedAccount } from './types.js'

export const createMattermostClient = (account: MattermostResolvedAccount) => {
  const client = new Client4()
  client.setUrl(account.baseUrl)
  client.setToken(account.token)
  client.setUserAgent('clawdbot-mattermost')
  return client
}

const ensureWsGlobals = () => {
  const globalAny = globalThis as typeof globalThis & {
    WebSocket?: typeof WebSocket
    window?: {
      addEventListener?: (type: string, listener: unknown) => void
      removeEventListener?: (type: string, listener: unknown) => void
    }
  }

  if (!globalAny.window) {
    const stub = globalThis as {
      addEventListener?: (type: string, listener: unknown) => void
      removeEventListener?: (type: string, listener: unknown) => void
    }
    if (!stub.addEventListener) {
      stub.addEventListener = () => {}
    }
    if (!stub.removeEventListener) {
      stub.removeEventListener = () => {}
    }
    globalAny.window = stub
  }
}

export const ensureMattermostWsGlobals = async () => {
  ensureWsGlobals()
  if (!globalThis.WebSocket) {
    const module = await import('ws')
    const WebSocketCtor = module.default as typeof WebSocket
    globalThis.WebSocket = WebSocketCtor
  }
}

export const createMattermostWebsocket = () => new WebSocketClient()
