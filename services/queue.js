const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../db/db');
const { createInstagramService } = require('./instagram');

const instagram = createInstagramService();

function listQueue(status) {
  if (status) {
    return all('SELECT * FROM posting_queue WHERE status = @status ORDER BY created_at DESC', { status });
  }

  return all('SELECT * FROM posting_queue ORDER BY created_at DESC');
}

function addToQueue({ userId, platform, content, mediaUrls = [], scheduledFor = null }) {
  const id = uuidv4();
  const now = new Date().toISOString();
  run(
    `INSERT INTO posting_queue (
      id, user_id, platform, content, media_urls, status, scheduled_for, created_at
    ) VALUES (
      @id, @userId, @platform, @content, @mediaUrls, 'pending', @scheduledFor, @createdAt
    )`,
    {
      id,
      userId: userId || null,
      platform: platform || 'instagram',
      content,
      mediaUrls: JSON.stringify(mediaUrls),
      scheduledFor,
      createdAt: now
    }
  );

  return get('SELECT * FROM posting_queue WHERE id = @id', { id });
}

function updateStatus(id, status, extras = {}) {
  const merged = {
    id,
    status,
    approvedBy: extras.approvedBy || null,
    approvedAt: extras.approvedAt || null,
    postedAt: extras.postedAt || null,
    instagramPostId: extras.instagramPostId || null,
    errorMessage: extras.errorMessage || null,
    retryCount: extras.retryCount ?? null
  };

  run(
    `UPDATE posting_queue SET
      status = @status,
      approved_by = COALESCE(@approvedBy, approved_by),
      approved_at = COALESCE(@approvedAt, approved_at),
      posted_at = COALESCE(@postedAt, posted_at),
      instagram_post_id = COALESCE(@instagramPostId, instagram_post_id),
      error_message = COALESCE(@errorMessage, error_message),
      retry_count = COALESCE(@retryCount, retry_count)
    WHERE id = @id`,
    merged
  );

  return get('SELECT * FROM posting_queue WHERE id = @id', { id });
}

async function approveAndPublish(postId, approvedBy = 'pwa') {
  const post = get('SELECT * FROM posting_queue WHERE id = @id', { id: postId });
  if (!post) {
    const error = new Error('Queued post not found.');
    error.statusCode = 404;
    throw error;
  }

  const approvedAt = new Date().toISOString();
  updateStatus(postId, 'approved', { approvedBy, approvedAt });

  try {
    const result = await instagram.publishPost(post);
    return updateStatus(postId, 'posted', {
      approvedBy,
      approvedAt,
      postedAt: new Date().toISOString(),
      instagramPostId: result.instagramPostId
    });
  } catch (error) {
    const retryCount = (post.retry_count || 0) + 1;
    return updateStatus(postId, 'failed', {
      approvedBy,
      approvedAt,
      errorMessage: error.message,
      retryCount
    });
  }
}

module.exports = {
  listQueue,
  addToQueue,
  updateStatus,
  approveAndPublish
};
