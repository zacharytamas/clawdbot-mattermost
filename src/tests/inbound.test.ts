import { expect, test } from 'bun:test'
import { buildEnvelope } from '../inbound.js'
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

const baseEvent: MattermostWebsocketEvent = {
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

test('filters disallowed channel', async () => {
  const envelope = await buildEnvelope(baseEvent, {
    account: { ...account, allowFrom: ['channel-2'] },
  })
  expect(envelope).toBeNull()
})

test('skips self user posts', async () => {
  const envelope = await buildEnvelope(baseEvent, {
    account,
    selfUserId: 'user-1',
  })
  expect(envelope).toBeNull()
})

test('builds envelope from post', async () => {
  const envelope = await buildEnvelope(baseEvent, { account })
  expect(envelope?.Channel).toBe('mattermost')
  expect(envelope?.To).toBe('channel:channel-1')
  expect(envelope?.From).toBe('user-1')
  expect(envelope?.Body).toBe('hello')
})

test('captures reply metadata', async () => {
  const replyEvent: MattermostWebsocketEvent = {
    event: 'posted',
    data: {
      post: JSON.stringify({
        id: 'post-2',
        user_id: 'user-2',
        channel_id: 'channel-1',
        message: 'reply',
        create_at: 456,
        root_id: 'root-1',
      }),
    },
  }

  const envelope = await buildEnvelope(replyEvent, { account })
  expect(envelope?.ReplyToId).toBe('root-1')
  expect(envelope?.MessageThreadId).toBe('root-1')
})
