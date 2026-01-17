import { expect, test } from 'bun:test'
import type { Channel } from '@mattermost/types/channels'
import type { FileInfo } from '@mattermost/types/files'
import type { UserProfile } from '@mattermost/types/users'

import { processMattermostPostedEvent } from '../monitor.js'
import type { MattermostResolvedAccount } from '../types.js'
import type { MattermostWebsocketEvent } from '../websocket.js'

const account: MattermostResolvedAccount = {
  accountId: 'default',
  baseUrl: 'https://mm.example.com',
  token: 'token',
  allowFrom: ['channel-1'],
  mediaMaxBytes: 10_000,
  enabled: true,
  requireDirectAllowlist: false,
  replyToMode: 'off',
}

const baseConfig = {
  agents: {
    list: [
      {
        id: 'main',
        workspace: '/Users/zachary/personas/hightower',
        default: true,
      },
    ],
  },
}

test('dispatches replies for posted events', async () => {
  const event: MattermostWebsocketEvent = {
    event: 'posted',
    data: {
      post: JSON.stringify({
        id: 'post-1',
        user_id: 'user-1',
        channel_id: 'channel-1',
        message: 'hello',
        create_at: 123,
      }),
    },
  }

  const dispatchCalls: Array<{ ctx: Record<string, unknown> }> = []

  await processMattermostPostedEvent({
    event,
    deps: {
      config: baseConfig,
      account,
      client: {
        getChannel: async () =>
          ({
            id: 'channel-1',
            type: 'O',
            display_name: 'General',
            name: 'general',
          }) as unknown as Channel,
        getUser: async () =>
          ({
            id: 'user-1',
            username: 'alice',
            first_name: 'Alice',
            last_name: 'Doe',
          }) as unknown as UserProfile,
        getFileInfosForPost: async () => [] as FileInfo[],
      },
      core: {
        chunkMarkdownText: () => [],
        formatAgentEnvelope: ({ body }) => body,
        resolveAgentRoute: ({ peer, channel }) => {
          expect(peer).toEqual({ kind: 'channel', id: 'channel-1' })
          expect(channel).toBe('mattermost')
          return {
            sessionKey: 'session',
            accountId: 'default',
          }
        },
        shouldLogVerbose: () => false,
        createReplyDispatcherWithTyping: () => ({
          dispatcher: {
            sendToolResult: () => false,
            sendBlockReply: () => false,
            sendFinalReply: () => false,
            waitForIdle: async () => {},
            getQueuedCounts: () => ({ final: 0, block: 0, tool: 0 }),
          },
          replyOptions: {},
          markDispatchIdle: () => {},
        }),
        dispatchReplyFromConfig: async ({ ctx }) => {
          dispatchCalls.push({ ctx: ctx as Record<string, unknown> })
          return { queuedFinal: true, counts: { final: 1 } }
        },
      },
      runtime: { error: () => {} },
    },
  })

  expect(dispatchCalls.length).toBe(1)
  expect(dispatchCalls[0]?.ctx?.To).toBe('channel:channel-1')
  expect(dispatchCalls[0]?.ctx?.RawBody).toBe('hello')
  expect(dispatchCalls[0]?.ctx?.CommandAuthorized).toBe(true)
})

test('skips events not in allowlist', async () => {
  const event: MattermostWebsocketEvent = {
    event: 'posted',
    data: {
      post: JSON.stringify({
        id: 'post-2',
        user_id: 'user-1',
        channel_id: 'channel-2',
        message: 'nope',
        create_at: 123,
      }),
    },
  }

  const dispatchCalls: Array<{ ctx: Record<string, unknown> }> = []

  await processMattermostPostedEvent({
    event,
    deps: {
      config: baseConfig,
      account,
      client: {
        getChannel: async () =>
          ({
            id: 'channel-2',
            type: 'O',
            display_name: 'General',
            name: 'general',
          }) as unknown as Channel,
        getUser: async () =>
          ({
            id: 'user-1',
            username: 'alice',
            first_name: 'Alice',
            last_name: 'Doe',
          }) as unknown as UserProfile,
        getFileInfosForPost: async () => [] as FileInfo[],
      },
      core: {
        chunkMarkdownText: () => [],
        formatAgentEnvelope: ({ body }) => body,
        resolveAgentRoute: () => ({
          sessionKey: 'session',
          accountId: 'default',
        }),
        shouldLogVerbose: () => false,
        createReplyDispatcherWithTyping: () => ({
          dispatcher: {
            sendToolResult: () => false,
            sendBlockReply: () => false,
            sendFinalReply: () => false,
            waitForIdle: async () => {},
            getQueuedCounts: () => ({ final: 0, block: 0, tool: 0 }),
          },
          replyOptions: {},
          markDispatchIdle: () => {},
        }),
        dispatchReplyFromConfig: async ({ ctx }) => {
          dispatchCalls.push({ ctx: ctx as Record<string, unknown> })
          return { queuedFinal: true, counts: { final: 1 } }
        },
      },
      runtime: { error: () => {} },
    },
  })

  expect(dispatchCalls.length).toBe(0)
})

test('routes direct messages with dm peer and sender id', async () => {
  const dmAccount = { ...account, allowFrom: ['channel-dm'] }
  const event: MattermostWebsocketEvent = {
    event: 'posted',
    data: {
      post: JSON.stringify({
        id: 'post-3',
        user_id: 'user-2',
        channel_id: 'channel-dm',
        message: 'hi',
        create_at: 123,
      }),
    },
  }

  const dispatchCalls: Array<{ ctx: Record<string, unknown> }> = []

  await processMattermostPostedEvent({
    event,
    deps: {
      config: baseConfig,
      account: dmAccount,
      client: {
        getChannel: async () =>
          ({
            id: 'channel-dm',
            type: 'D',
            display_name: 'DM',
            name: 'dm',
          }) as unknown as Channel,
        getUser: async () =>
          ({
            id: 'user-2',
            username: 'bob',
            first_name: 'Bob',
            last_name: 'Smith',
          }) as unknown as UserProfile,
        getFileInfosForPost: async () => [] as FileInfo[],
      },
      core: {
        chunkMarkdownText: () => [],
        formatAgentEnvelope: ({ body }) => body,
        resolveAgentRoute: ({ peer }) => {
          expect(peer).toEqual({ kind: 'dm', id: 'user-2' })
          return {
            sessionKey: 'session',
            accountId: 'default',
          }
        },
        shouldLogVerbose: () => false,
        createReplyDispatcherWithTyping: () => ({
          dispatcher: {
            sendToolResult: () => false,
            sendBlockReply: () => false,
            sendFinalReply: () => false,
            waitForIdle: async () => {},
            getQueuedCounts: () => ({ final: 0, block: 0, tool: 0 }),
          },
          replyOptions: {},
          markDispatchIdle: () => {},
        }),
        dispatchReplyFromConfig: async ({ ctx }) => {
          dispatchCalls.push({ ctx: ctx as Record<string, unknown> })
          return { queuedFinal: true, counts: { final: 1 } }
        },
      },
      runtime: { error: () => {} },
    },
  })

  expect(dispatchCalls.length).toBe(1)
  expect(dispatchCalls[0]?.ctx?.ChatType).toBe('direct')
  expect(dispatchCalls[0]?.ctx?.From).toBe('mattermost:user-2')
})

test('routes group messages with group peer and group from', async () => {
  const groupAccount = { ...account, allowFrom: ['channel-group'] }
  const event: MattermostWebsocketEvent = {
    event: 'posted',
    data: {
      post: JSON.stringify({
        id: 'post-4',
        user_id: 'user-3',
        channel_id: 'channel-group',
        message: 'hi team',
        create_at: 123,
      }),
    },
  }

  const dispatchCalls: Array<{ ctx: Record<string, unknown> }> = []

  await processMattermostPostedEvent({
    event,
    deps: {
      config: baseConfig,
      account: groupAccount,
      client: {
        getChannel: async () =>
          ({
            id: 'channel-group',
            type: 'G',
            display_name: 'Group DM',
            name: 'group-dm',
          }) as unknown as Channel,
        getUser: async () =>
          ({
            id: 'user-3',
            username: 'carol',
            first_name: 'Carol',
            last_name: 'Jones',
          }) as unknown as UserProfile,
        getFileInfosForPost: async () => [] as FileInfo[],
      },
      core: {
        chunkMarkdownText: () => [],
        formatAgentEnvelope: ({ body }) => body,
        resolveAgentRoute: ({ peer }) => {
          expect(peer).toEqual({ kind: 'group', id: 'channel-group' })
          return {
            sessionKey: 'session',
            accountId: 'default',
          }
        },
        shouldLogVerbose: () => false,
        createReplyDispatcherWithTyping: () => ({
          dispatcher: {
            sendToolResult: () => false,
            sendBlockReply: () => false,
            sendFinalReply: () => false,
            waitForIdle: async () => {},
            getQueuedCounts: () => ({ final: 0, block: 0, tool: 0 }),
          },
          replyOptions: {},
          markDispatchIdle: () => {},
        }),
        dispatchReplyFromConfig: async ({ ctx }) => {
          dispatchCalls.push({ ctx: ctx as Record<string, unknown> })
          return { queuedFinal: true, counts: { final: 1 } }
        },
      },
      runtime: { error: () => {} },
    },
  })

  expect(dispatchCalls.length).toBe(1)
  expect(dispatchCalls[0]?.ctx?.ChatType).toBe('group')
  expect(dispatchCalls[0]?.ctx?.From).toBe('mattermost:group:channel-group')
})
