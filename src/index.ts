import { mattermostPlugin } from './channel.js'
import type { ClawdbotPluginApi } from './clawdbot.js'
import { mattermostDock } from './dock.js'

const plugin = {
  id: 'clawdbot-mattermost',
  name: 'Mattermost',
  description: 'Mattermost messaging channel (WebSocket + REST)',
  register(api: ClawdbotPluginApi) {
    api.registerChannel({ plugin: mattermostPlugin, dock: mattermostDock })
  },
}

export default plugin
