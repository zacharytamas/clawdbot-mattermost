# clawdbot-mattermost

Mattermost channel plugin for Clawdbot (PAT auth + WebSocket inbound).

## Configuration

```yaml
channels:
  mattermost:
    defaultAccount: "primary"
    allowFrom:
      - "channel-id-1"
    accounts:
      primary:
        baseUrl: "https://mattermost.example.com"
        token: "mm-personal-access-token"
        allowFrom:
          - "channel-id-1"
      secondary:
        enabled: true
        baseUrl: "https://mattermost.secondary"
        token: "mm-secondary-token"
        mediaMaxMb: 25
```

Notes:

- Use `channel:<id>` targets when sending outbound.
- Typing indicators are sent via the websocket connection.
- Thread replies will be wired up in a follow-up (metadata already captured).

## Development

```bash
bun install
bun test
```
