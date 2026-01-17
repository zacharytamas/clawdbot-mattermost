import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export type CoreChannelDeps = {
  chunkMarkdownText: (text: string, limit: number) => string[]
  formatAgentEnvelope: (params: {
    channel: string
    from: string
    timestamp?: number
    body: string
  }) => string
  createReplyDispatcherWithTyping: (params: {
    deliver: (payload: unknown, info: { kind: string }) => Promise<void>
    responsePrefix?: string
    onError?: (err: unknown, info: { kind: string }) => void
    onReplyStart?: () => void | Promise<void>
    humanDelay?: unknown
  }) => {
    dispatcher: {
      sendToolResult: (payload: unknown) => boolean
      sendBlockReply: (payload: unknown) => boolean
      sendFinalReply: (payload: unknown) => boolean
      waitForIdle: () => Promise<void>
      getQueuedCounts: () => Record<string, number>
    }
    replyOptions: Record<string, unknown>
    markDispatchIdle: () => void
  }
  dispatchReplyFromConfig: (params: {
    ctx: unknown
    cfg: unknown
    dispatcher: {
      sendToolResult: (payload: unknown) => boolean
      sendBlockReply: (payload: unknown) => boolean
      sendFinalReply: (payload: unknown) => boolean
      waitForIdle: () => Promise<void>
      getQueuedCounts: () => Record<string, number>
    }
    replyOptions?: Record<string, unknown>
  }) => Promise<{ queuedFinal: boolean; counts: Record<string, number> }>
  resolveAgentRoute: (params: {
    cfg: unknown
    channel: string
    accountId: string
    peer?: { kind: 'dm' | 'group' | 'channel'; id: string } | null
  }) => { sessionKey: string; accountId: string; agentId?: string }
  shouldLogVerbose: () => boolean
}

let coreRootCache: string | null = null
let coreDepsPromise: Promise<CoreChannelDeps> | null = null

const resolveClawdbotRoot = async (): Promise<string> => {
  if (coreRootCache) return coreRootCache
  const override = process.env.CLAWDBOT_ROOT?.trim()
  if (override) {
    coreRootCache = override
    return override
  }

  const root = '/Users/zachary/Development/github.com/clawdbot/clawdbot'
  coreRootCache = root
  return root
}

const importCoreModule = async <T>(relativePath: string): Promise<T> => {
  const root = await resolveClawdbotRoot()
  const distPath = path.join(root, 'dist', relativePath)
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Missing core module at ${distPath}. Run \`pnpm build\` or install the official package.`,
    )
  }
  return (await import(pathToFileURL(distPath).href)) as T
}

export const loadCoreChannelDeps = async (): Promise<CoreChannelDeps> => {
  if (coreDepsPromise) return coreDepsPromise

  coreDepsPromise = (async () => {
    const [chunk, envelope, dispatcher, dispatchFromConfig, routing, globals] =
      await Promise.all([
        importCoreModule<{
          chunkMarkdownText: CoreChannelDeps['chunkMarkdownText']
        }>('auto-reply/chunk.js'),
        importCoreModule<{
          formatAgentEnvelope: CoreChannelDeps['formatAgentEnvelope']
        }>('auto-reply/envelope.js'),
        importCoreModule<{
          createReplyDispatcherWithTyping: CoreChannelDeps['createReplyDispatcherWithTyping']
        }>('auto-reply/reply/reply-dispatcher.js'),
        importCoreModule<{
          dispatchReplyFromConfig: CoreChannelDeps['dispatchReplyFromConfig']
        }>('auto-reply/reply/dispatch-from-config.js'),
        importCoreModule<{
          resolveAgentRoute: CoreChannelDeps['resolveAgentRoute']
        }>('routing/resolve-route.js'),
        importCoreModule<{
          shouldLogVerbose: CoreChannelDeps['shouldLogVerbose']
        }>('globals.js'),
      ])

    return {
      chunkMarkdownText: chunk.chunkMarkdownText,
      formatAgentEnvelope: envelope.formatAgentEnvelope,
      createReplyDispatcherWithTyping:
        dispatcher.createReplyDispatcherWithTyping,
      dispatchReplyFromConfig: dispatchFromConfig.dispatchReplyFromConfig,
      resolveAgentRoute: routing.resolveAgentRoute,
      shouldLogVerbose: globals.shouldLogVerbose,
    }
  })()

  return coreDepsPromise
}
