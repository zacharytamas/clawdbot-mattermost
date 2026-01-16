import { afterEach, expect, test } from 'bun:test'
import { sendMattermost } from '../send.js'
import type { MattermostResolvedAccount } from '../types.js'

const account: MattermostResolvedAccount = {
  accountId: 'default',
  baseUrl: 'https://mm.example.com',
  token: 'token',
  allowFrom: undefined,
  mediaMaxBytes: 10_000,
  enabled: true,
  requireDirectAllowlist: false,
  replyToMode: 'off',
}

const originalFetch = globalThis.fetch

const mockResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('sends post via client', async () => {
  ;(globalThis.fetch as unknown) = async (input: string | Request) => {
    const url = typeof input === 'string' ? input : input.url

    if (url.includes('/posts')) {
      return mockResponse({
        id: 'post-1',
        channel_id: 'channel-1',
        create_at: 123,
      })
    }
    return mockResponse({})
  }

  const result = await sendMattermost(
    {
      cfg: {},
      to: 'channel:channel-1',
      text: 'hello',
      accountId: 'default',
    },
    account,
  )

  expect(result.messageId).toBe('post-1')
})

test('uploads media and attaches file ids', async () => {
  let postedPayload: { file_ids?: string[] } | undefined
  let uploadCalled = false

  ;(globalThis.fetch as unknown) = async (
    input: string | Request,
    init?: RequestInit,
  ) => {
    const url = typeof input === 'string' ? input : input.url

    if (url === 'https://assets.example.com/cat.png') {
      return new Response('meow', {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': '4',
        },
      })
    }

    if (url.includes('/files')) {
      uploadCalled = true
      return mockResponse({ file_infos: [{ id: 'file-1' }] })
    }

    if (url.includes('/posts')) {
      const request =
        typeof input === 'string' ? new Request(input, init) : input
      postedPayload = JSON.parse(await request.text()) as {
        file_ids?: string[]
      }
      return mockResponse({
        id: 'post-2',
        channel_id: 'channel-1',
        create_at: 456,
      })
    }

    return mockResponse({})
  }

  await sendMattermost(
    {
      cfg: {},
      to: 'channel:channel-1',
      text: 'hello',
      mediaUrl: 'https://assets.example.com/cat.png',
      accountId: 'default',
    },
    account,
  )

  expect(uploadCalled).toBe(true)
  expect(postedPayload?.file_ids).toEqual(['file-1'])
})
