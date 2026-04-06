const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { createInstagramService } = require('../services/instagram');
const { all, get, run } = require('../db/db');

const router = express.Router();
const instagram = createInstagramService();

function maskToken(token) {
  if (!token) {
    return null;
  }

  if (token.length <= 8) {
    return `${token.slice(0, 2)}***`;
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function getMissingSetupFields() {
  const required = [
    'INSTAGRAM_APP_ID',
    'INSTAGRAM_APP_SECRET',
    'INSTAGRAM_REDIRECT_URI'
  ];

  return required.filter((field) => !process.env[field]);
}

router.post('/instagram-setup', (req, res) => {
  const missing = getMissingSetupFields();

  if (missing.length > 0) {
    return res.status(400).json({
      error: 'Instagram OAuth is not configured yet.',
      code: 'INSTAGRAM_CONFIG_MISSING',
      missing
    });
  }

  res.json({
    setupUrl: instagram.buildOauthUrl()
  });
});

router.get('/integrations', (req, res) => {
  const rows = all(
    `SELECT id, platform, account_id, access_token, refresh_token, expires_at, created_at
     FROM social_integrations
     ORDER BY created_at DESC`
  );

  res.json({
    config: {
      ready: getMissingSetupFields().length === 0,
      missing: getMissingSetupFields()
    },
    integrations: rows.map((row) => ({
      id: row.id,
      platform: row.platform,
      accountId: row.account_id,
      hasAccessToken: Boolean(row.access_token),
      accessTokenPreview: maskToken(row.access_token),
      hasRefreshToken: Boolean(row.refresh_token),
      refreshTokenPreview: maskToken(row.refresh_token),
      expiresAt: row.expires_at,
      createdAt: row.created_at
    }))
  });
});

router.get('/instagram-callback', async (req, res, next) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({
        error: 'Missing OAuth code.',
        code: 'MISSING_CODE'
      });
    }

    const token = await instagram.exchangeCodeForToken(code);
    const profile = await instagram.discoverAccount(token.accessToken, req.query.account_id);
    const persistedAccessToken = profile.accessToken || token.accessToken;
    const createdAt = new Date().toISOString();
    const existing = get(
      'SELECT * FROM social_integrations WHERE platform = @platform AND account_id = @accountId',
      {
        platform: 'instagram',
        accountId: profile.accountId
      }
    );

    let integrationId = existing?.id;

    if (existing) {
      run(
        `UPDATE social_integrations
         SET access_token = @accessToken,
             refresh_token = @refreshToken,
             expires_at = @expiresAt
         WHERE id = @id`,
        {
          id: existing.id,
          accessToken: persistedAccessToken,
          refreshToken: token.refreshToken,
          expiresAt: token.expiresAt
        }
      );
    } else {
      integrationId = uuidv4();
      run(
        `INSERT INTO social_integrations (
          id, platform, account_id, access_token, refresh_token, expires_at, created_at
        ) VALUES (
          @id, 'instagram', @accountId, @accessToken, @refreshToken, @expiresAt, @createdAt
        )`,
        {
          id: integrationId,
          accountId: profile.accountId,
          accessToken: persistedAccessToken,
          refreshToken: token.refreshToken,
          expiresAt: token.expiresAt,
          createdAt
        }
      );
    }

    const integration = get('SELECT * FROM social_integrations WHERE id = @id', { id: integrationId });
    return res.json({
      success: true,
      integration,
      profile: {
        accountId: profile.accountId,
        username: profile.username,
        name: profile.name
      }
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
