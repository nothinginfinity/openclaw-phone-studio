const express = require('express');
const { all, get, getActiveDbPath } = require('../db/db');
const { syncIntegrationToDb } = require('../services/dmSync');

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({
    service: 'openclaw-phone-studio',
    status: 'ok',
    dbPath: getActiveDbPath(),
    dmThreads: all('SELECT COUNT(*) AS count FROM dm_threads')[0]?.count || 0,
    queuedPosts: all("SELECT COUNT(*) AS count FROM posting_queue WHERE status = 'pending'")[0]?.count || 0
  });
});

router.post('/sync/full', async (req, res, next) => {
  try {
    const integration = get(
      `SELECT * FROM social_integrations
       WHERE platform = @platform
       ORDER BY created_at DESC
       LIMIT 1`,
      {
        platform: 'instagram'
      }
    );

    if (!integration) {
      return res.status(404).json({
        error: 'No Instagram integration found. Complete OAuth setup first.',
        code: 'INTEGRATION_NOT_FOUND'
      });
    }

    const result = await syncIntegrationToDb({ integration });
    res.json({
      success: true,
      fullSync: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
});

router.get('/config', (req, res) => {
  res.json({
    port: Number(process.env.PORT || 3001),
    nodeEnv: process.env.NODE_ENV || 'development',
    pwaOrigin: process.env.PWA_ORIGIN || 'http://localhost:3000',
    dmSyncIntervalMinutes: Number(process.env.DM_SYNC_INTERVAL_MINUTES || 5),
    postRetryMaxAttempts: Number(process.env.POST_RETRY_MAX_ATTEMPTS || 3)
  });
});

module.exports = router;
