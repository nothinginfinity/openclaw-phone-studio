const { v4: uuidv4 } = require('uuid');
const { get, run } = require('../db/db');
const { createInstagramService } = require('./instagram');

const instagram = createInstagramService();

function getLatestIntegration(platform = 'instagram') {
  return get(
    `SELECT * FROM social_integrations
     WHERE platform = @platform
     ORDER BY created_at DESC
     LIMIT 1`,
    {
      platform
    }
  );
}

function getIntegrationById(id, platform = 'instagram') {
  return get(
    'SELECT * FROM social_integrations WHERE id = @id AND platform = @platform',
    {
      id,
      platform
    }
  );
}

function upsertThread(integration, thread) {
  const timestamp = new Date().toISOString();
  const localThreadId = uuidv4();

  run(
    `INSERT INTO dm_threads (
      id, user_id, platform, thread_id, sender_id, sender_name, last_message_at, unread_count, created_at, updated_at
    ) VALUES (
      @id, @userId, 'instagram', @threadId, @senderId, @senderName, @lastMessageAt, @unreadCount, @createdAt, @updatedAt
    )
    ON CONFLICT(user_id, thread_id) DO UPDATE SET
      sender_id = excluded.sender_id,
      sender_name = excluded.sender_name,
      last_message_at = excluded.last_message_at,
      unread_count = excluded.unread_count,
      updated_at = excluded.updated_at`,
    {
      id: localThreadId,
      userId: integration.id,
      threadId: thread.conversationId,
      senderId: thread.senderId,
      senderName: thread.senderName,
      lastMessageAt: thread.updatedAt,
      unreadCount: Number(thread.unreadCount || 0),
      createdAt: timestamp,
      updatedAt: timestamp
    }
  );

  return get(
    'SELECT * FROM dm_threads WHERE user_id = @userId AND thread_id = @threadId',
    {
      userId: integration.id,
      threadId: thread.conversationId
    }
  );
}

function persistMessages(threadRecord, messages) {
  let inserted = 0;

  for (const message of messages) {
    const result = run(
      `INSERT OR IGNORE INTO dm_messages (
        id, thread_id, platform, sender_id, text, media_urls, direction, received_at, is_read, created_at
      ) VALUES (
        @id, @threadId, 'instagram', @senderId, @text, @mediaUrls, @direction, @receivedAt, @isRead, @createdAt
      )`,
      {
        id: message.id,
        threadId: threadRecord.id,
        senderId: message.senderId,
        text: message.text,
        mediaUrls: message.mediaUrls.length ? JSON.stringify(message.mediaUrls) : null,
        direction: message.direction,
        receivedAt: message.receivedAt,
        isRead: message.isRead ? 1 : 0,
        createdAt: new Date().toISOString()
      }
    );

    inserted += result.changes;
  }

  return inserted;
}

async function syncIntegrationToDb({
  integration,
  conversationLimit = 25,
  messageLimit = 100
}) {
  const result = await instagram.syncThreads({
    integration,
    conversationLimit,
    messageLimit
  });
  let syncedMessages = 0;

  result.threads.forEach((thread) => {
    const threadRecord = upsertThread(integration, thread);
    syncedMessages += persistMessages(threadRecord, thread.messages);
  });

  return {
    ...result,
    integrationId: integration.id,
    syncedMessages
  };
}

module.exports = {
  getLatestIntegration,
  getIntegrationById,
  syncIntegrationToDb
};
