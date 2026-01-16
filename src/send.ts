import FormData from 'form-data'
import type {
  ChannelOutboundContext,
  OutboundDeliveryResult,
} from './clawdbot.js'
import { createMattermostClient } from './client.js'
import { fetchMedia } from './media.js'
import type { MattermostResolvedAccount } from './types.js'

const stripEmpty = (value?: string | null) => (value ? value : undefined)

const resolveChannelId = (target: string) =>
  target.startsWith('channel:') ? target.slice('channel:'.length) : target

const resolveRootId = (ctx: ChannelOutboundContext) =>
  stripEmpty(ctx.threadId ? String(ctx.threadId) : ctx.replyToId)

const buildPost = (ctx: ChannelOutboundContext, fileIds?: string[]) => ({
  channel_id: resolveChannelId(ctx.to),
  message: ctx.text,
  root_id: resolveRootId(ctx),
  file_ids: fileIds,
})

const uploadMedia = async (
  account: MattermostResolvedAccount,
  channelId: string,
  mediaUrl: string,
) => {
  const payload = await fetchMedia(mediaUrl, account.mediaMaxBytes ?? 0)
  const form = new FormData()
  form.append('channel_id', channelId)
  form.append('files', payload.buffer, {
    filename: payload.filename,
    contentType: payload.contentType,
  })
  const client = createMattermostClient(account)
  const response = await client.uploadFile(form as never)
  return response.file_infos?.map((info) => info.id) ?? []
}

export const sendMattermost = async (
  ctx: ChannelOutboundContext,
  account: MattermostResolvedAccount,
): Promise<OutboundDeliveryResult> => {
  const client = createMattermostClient(account)
  const channelId = resolveChannelId(ctx.to)
  const fileIds = ctx.mediaUrl
    ? await uploadMedia(account, channelId, ctx.mediaUrl)
    : undefined
  const post = await client.createPost(buildPost(ctx, fileIds))
  return {
    channel: 'mattermost',
    messageId: post.id,
    channelId: post.channel_id,
    timestamp: Number(post.create_at) || Date.now(),
  }
}
