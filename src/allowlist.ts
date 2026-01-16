export const isAllowed = (
  allowlist: Set<string> | undefined,
  channelId: string,
) => (!allowlist ? true : allowlist.has(channelId))

export const buildAllowlist = (allowFrom?: string[]) => {
  if (!allowFrom?.length) return undefined
  const entries = allowFrom.map((entry) => entry.trim()).filter(Boolean)
  if (entries.includes('*')) return undefined
  return new Set(entries)
}
