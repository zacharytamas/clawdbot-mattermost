import type { ClawdbotPluginApi } from './clawdbot.js'

import { mattermostPlugin } from './channel.js'

const plugin = {
  id: 'clawdbot-mattermost',
  name: 'Mattermost',
  description: 'Mattermost messaging channel (WebSocket + REST)',
  register(api: ClawdbotPluginApi) {
    api.registerChannel({ plugin: mattermostPlugin })
  },
}

export default plugin
