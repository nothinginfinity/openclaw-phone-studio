const express = require('express');
const { get, run } = require('../db/db');
const { requireApprovalToken } = require('../middleware/auth');
const { addToQueue, listQueue, approveAndPublish, updateStatus } = require('../services/queue');

const router = express.Router();

router.post('/queue', requireApprovalToken, (req, res) => {
  const queued = addToQueue({
    userId: req.body.user_id || null,
    platform: req.body.platform || 'instagram',
    content: req.body.content,
    mediaUrls: req.body.media_urls || req.body.mediaUrls || [],
    scheduledFor: req.body.scheduled_for || req.body.scheduledFor || null
  });

  res.status(201).json(queued);
});

router.get('/queue', (req, res) => {
  res.json(listQueue(req.query.status));
});

router.post('/:postId/approve', requireApprovalToken, async (req, res, next) => {
  try {
    const approved = await approveAndPublish(req.params.postId, req.body.approved_by || 'pwa');
    res.json(approved);
  } catch (error) {
    next(error);
  }
});

router.post('/:postId/cancel', (req, res) => {
  const existing = get('SELECT * FROM posting_queue WHERE id = @id', { id: req.params.postId });
  if (!existing) {
    return res.status(404).json({
      error: 'Post not found.',
      code: 'POST_NOT_FOUND'
    });
  }

  const cancelled = updateStatus(req.params.postId, 'cancelled', {
    errorMessage: req.body.reason || null
  });
  res.json(cancelled);
});

router.get('/history', (req, res) => {
  const rows = listQueue().filter((item) => ['posted', 'failed', 'cancelled'].includes(item.status));
  res.json(rows);
});

module.exports = router;
