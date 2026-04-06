const express = require('express');
const { all, get, run } = require('../db/db');
const { getIntegrationById, getLatestIntegration, syncIntegrationToDb } = require('../services/dmSync');

const router = express.Router();

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getActiveIntegration(integrationId) {
  if (integrationId) {
    return getIntegrationById(integrationId);
  }

  return getLatestIntegration();
}

router.get('/threads', (req, res) => {
  const threads = all('SELECT * FROM dm_threads ORDER BY updated_at DESC');
  res.json(threads);
});

router.get('/threads/:threadId/messages', (req, res) => {
  const thread = get('SELECT * FROM dm_threads WHERE thread_id = @threadId OR id = @threadId', {
    threadId: req.params.threadId
  });

  if (!thread) {
    return res.status(404).json({
      error: 'Thread not found.',
      code: 'THREAD_NOT_FOUND'
    });
  }

  const messages = all('SELECT * FROM dm_messages WHERE thread_id = @threadId ORDER BY received_at ASC', {
    threadId: thread.id
  });

  return res.json({
    ...thread,
    messages
  });
});

router.post('/sync', async (req, res, next) => {
  try {
    const integrationId = req.body?.integrationId || req.query.integrationId || null;
    const integration = getActiveIntegration(integrationId);

    if (!integration) {
      return res.status(404).json({
        error: 'No Instagram integration found. Complete OAuth setup first.',
        code: 'INTEGRATION_NOT_FOUND'
      });
    }

    const result = await syncIntegrationToDb({
      integration,
      conversationLimit: parsePositiveInt(req.body?.conversationLimit || req.query.conversationLimit, 25),
      messageLimit: parsePositiveInt(req.body?.messageLimit || req.query.messageLimit, 100)
    });

    res.json({
      success: true,
      source: result.source,
      accountId: result.accountId,
      integrationId: result.integrationId,
      syncedThreads: result.syncedThreads,
      syncedMessages: result.syncedMessages
    });
  } catch (error) {
    next(error);
  }
});

router.put('/threads/:threadId/read', (req, res) => {
  const thread = get('SELECT * FROM dm_threads WHERE thread_id = @threadId OR id = @threadId', {
    threadId: req.params.threadId
  });

  if (!thread) {
    return res.status(404).json({
      error: 'Thread not found.',
      code: 'THREAD_NOT_FOUND'
    });
  }

  run('UPDATE dm_threads SET unread_count = 0, updated_at = @updatedAt WHERE id = @id', {
    id: thread.id,
    updatedAt: new Date().toISOString()
  });
  run('UPDATE dm_messages SET is_read = 1 WHERE thread_id = @threadId', { threadId: thread.id });

  return res.json({
    success: true
  });
});

module.exports = router;
