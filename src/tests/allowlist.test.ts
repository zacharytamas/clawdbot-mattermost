import { expect, test } from 'bun:test'
import { buildAllowlist, isAllowed } from '../allowlist.js'

test('allowlist defaults to allow all', () => {
  expect(isAllowed(undefined, 'channel-1')).toBe(true)
})

test('allowlist matches allowed channel', () => {
  const allowlist = buildAllowlist(['channel-1'])
  expect(isAllowed(allowlist, 'channel-1')).toBe(true)
  expect(isAllowed(allowlist, 'channel-2')).toBe(false)
})

test('allowlist wildcard allows all', () => {
  const allowlist = buildAllowlist(['*'])
  expect(isAllowed(allowlist, 'channel-1')).toBe(true)
  expect(isAllowed(allowlist, 'channel-2')).toBe(true)
})
