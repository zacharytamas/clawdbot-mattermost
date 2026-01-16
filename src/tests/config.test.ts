import { describe, expect, test } from 'bun:test'
import { defaultAccountId, resolveAccount } from '../config.js'

const baseConfig = {
  allowFrom: ['channel-a'],
  defaultAccount: 'team',
  accounts: {
    default: {
      baseUrl: 'https://mm.example.com',
      token: 'token-default',
    },
    team: {
      baseUrl: 'https://mm.team',
      token: 'token-team',
      allowFrom: ['channel-b'],
    },
  },
}

describe('config', () => {
  test('resolves default account', () => {
    const account = resolveAccount(baseConfig, 'team')
    expect(account.baseUrl).toBe('https://mm.team')
    expect(account.token).toBe('token-team')
    expect(account.allowFrom).toEqual(['channel-b'])
  })

  test('inherits global allowFrom', () => {
    const account = resolveAccount(baseConfig, 'default')
    expect(account.allowFrom).toEqual(['channel-a'])
  })

  test('picks fallback account id', () => {
    expect(defaultAccountId(baseConfig)).toBe('team')
  })
})
