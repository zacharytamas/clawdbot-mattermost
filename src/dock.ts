import type { ChannelDock } from './clawdbot.js'
import { resolveAllowFrom } from './config.js'

export const mattermostDock: ChannelDock = {
  id: 'mattermost',
  capabilities: {
    chatTypes: ['direct', 'group', 'channel', 'thread'],
    media: true,
    threads: true,
  },
  config: {
    resolveAllowFrom: ({ cfg, accountId }) =>
      resolveAllowFrom({ cfg, accountId })?.map((entry) => String(entry)),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom.map((entry) => String(entry).trim()).filter(Boolean),
  },
  groups: {
    resolveRequireMention: () => false,
  },
}
