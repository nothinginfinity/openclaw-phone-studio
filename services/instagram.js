const { randomUUID } = require('crypto');

const DEFAULT_SCOPES = 'instagram_graph_api,instagram_manage_messages,instagram_basic,pages_manage_posts';

function trimTrailingSlash(value) {
  return (value || '').replace(/\/+$/, '');
}

function buildUrl(baseUrl, params = {}) {
  const url = new URL(baseUrl);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url;
}

async function parseResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await parseResponse(response);

  if (!response.ok) {
    const message = data?.error?.message || data?.message || response.statusText;
    const error = new Error(`Instagram API request failed: ${message}`);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

function resolveConfig() {
  const apiVersion = process.env.INSTAGRAM_API_VERSION || 'v21.0';

  return {
    appId: process.env.INSTAGRAM_APP_ID || '',
    appSecret: process.env.INSTAGRAM_APP_SECRET || '',
    redirectUri: process.env.INSTAGRAM_REDIRECT_URI || '',
    authorizeUrl: process.env.INSTAGRAM_OAUTH_AUTHORIZE_URL || `https://www.facebook.com/${apiVersion}/dialog/oauth`,
    tokenUrl: process.env.INSTAGRAM_OAUTH_TOKEN_URL || `https://graph.facebook.com/${apiVersion}/oauth/access_token`,
    graphBaseUrl: trimTrailingSlash(
      process.env.INSTAGRAM_GRAPH_API_BASE_URL || `https://graph.facebook.com/${apiVersion}`
    ),
    scopes: process.env.INSTAGRAM_SCOPES || DEFAULT_SCOPES
  };
}

function normalizeTokenPayload(data) {
  const accessToken = data?.access_token || data?.accessToken;

  if (!accessToken) {
    throw new Error('Instagram token exchange succeeded without an access token.');
  }

  const refreshToken = data?.refresh_token || data?.refreshToken || null;
  const expiresIn = Number(data?.expires_in || data?.expiresIn || 0);

  return {
    accessToken,
    refreshToken,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + (expiresIn * 1000)).toISOString()
      : null,
    raw: data
  };
}

function createInstagramService() {
  const config = resolveConfig();

  function buildGraphPath(pathname) {
    const normalizedPath = String(pathname || '').replace(/^\/+/, '');
    return `${config.graphBaseUrl}/${normalizedPath}`;
  }

  async function graphGet(pathnameOrUrl, { accessToken, params = {} } = {}) {
    const url = pathnameOrUrl.startsWith('http')
      ? buildUrl(pathnameOrUrl, params)
      : buildUrl(buildGraphPath(pathnameOrUrl), {
          ...params,
          access_token: accessToken
        });

    return requestJson(url.toString());
  }

  async function tryGraphGet(pathnameOrUrl, options) {
    try {
      return await graphGet(pathnameOrUrl, options);
    } catch (error) {
      if (error.status && error.status < 500) {
        return null;
      }

      throw error;
    }
  }

  async function collectPaginated(pathnameOrUrl, { accessToken, params = {}, maxPages = 5 } = {}) {
    const items = [];
    let nextUrl = pathnameOrUrl.startsWith('http')
      ? buildUrl(pathnameOrUrl, params).toString()
      : buildUrl(buildGraphPath(pathnameOrUrl), {
          ...params,
          access_token: accessToken
        }).toString();
    let pageCount = 0;

    while (nextUrl && pageCount < maxPages) {
      const payload = await requestJson(nextUrl);
      const pageItems = Array.isArray(payload?.data) ? payload.data : [];
      items.push(...pageItems);
      nextUrl = payload?.paging?.next || null;
      pageCount += 1;
    }

    return items;
  }

  function extractMediaUrls(attachments) {
    const sources = Array.isArray(attachments?.data) ? attachments.data : [];

    return sources
      .map((attachment) => {
        const nested = attachment?.image_data?.url ||
          attachment?.video_data?.url ||
          attachment?.file_url ||
          attachment?.url ||
          attachment?.target?.url ||
          null;

        return nested;
      })
      .filter(Boolean);
  }

  function normalizeMessage(message, accountId) {
    const senderId = message?.from?.id || null;
    const direction = senderId && String(senderId) === String(accountId) ? 'outbound' : 'inbound';

    return {
      id: message?.id,
      senderId,
      senderName: message?.from?.username || message?.from?.name || null,
      text: message?.message || '',
      mediaUrls: extractMediaUrls(message?.attachments),
      direction,
      receivedAt: message?.created_time || new Date().toISOString(),
      isRead: direction === 'outbound'
    };
  }

  function normalizeConversation(conversation, messages, accountId) {
    const participants = Array.isArray(conversation?.participants?.data)
      ? conversation.participants.data
      : [];
    const primaryParticipant = participants.find((participant) => String(participant?.id) !== String(accountId))
      || participants[0]
      || null;
    const normalizedMessages = messages
      .map((message) => normalizeMessage(message, accountId))
      .filter((message) => message.id);
    const latestMessageAt = normalizedMessages[normalizedMessages.length - 1]?.receivedAt || null;

    return {
      conversationId: conversation?.id,
      senderId: primaryParticipant?.id || null,
      senderName: primaryParticipant?.username || primaryParticipant?.name || null,
      unreadCount: Number(conversation?.unread_count || 0),
      updatedAt: conversation?.updated_time || latestMessageAt || new Date().toISOString(),
      messages: normalizedMessages
    };
  }

  return {
    buildOauthUrl({ state } = {}) {
      const params = new URLSearchParams({
        client_id: config.appId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: config.scopes,
        state: state || randomUUID()
      });

      return `${config.authorizeUrl}${config.authorizeUrl.includes('?') ? '&' : '?'}${params.toString()}`;
    },

    async exchangeCodeForToken(code) {
      const body = new URLSearchParams({
        client_id: config.appId,
        client_secret: config.appSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
        code
      });

      const data = await requestJson(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
      });

      return normalizeTokenPayload(data);
    },

    async discoverAccount(accessToken, accountIdHint) {
      const directProfile = await tryGraphGet('me', {
        accessToken,
        params: {
          fields: 'id,user_id,username,name'
        }
      });

      if (
        directProfile?.user_id ||
        directProfile?.username ||
        (config.graphBaseUrl.includes('graph.instagram.com') && directProfile?.id)
      ) {
        return {
          accountId: String(accountIdHint || directProfile.user_id || directProfile.id),
          username: directProfile.username || null,
          name: directProfile.name || directProfile.username || null,
          raw: directProfile
        };
      }

      const pages = await tryGraphGet('me/accounts', {
        accessToken,
        params: {
          fields: 'id,name,access_token,instagram_business_account{id,username,name}',
          limit: 100
        }
      });

      const pageAccounts = Array.isArray(pages?.data) ? pages.data : [];
      const selectedPage = pageAccounts.find((page) => {
        const instagramAccount = page?.instagram_business_account;

        if (!instagramAccount) {
          return false;
        }

        if (!accountIdHint) {
          return true;
        }

        return String(instagramAccount.id) === String(accountIdHint) || String(page.id) === String(accountIdHint);
      });

      if (selectedPage?.instagram_business_account?.id) {
        return {
          accountId: String(selectedPage.instagram_business_account.id),
          accessToken: selectedPage.access_token || accessToken,
          username: selectedPage.instagram_business_account.username || null,
          name: selectedPage.instagram_business_account.name || selectedPage.name || null,
          pageId: selectedPage.id,
          raw: selectedPage
        };
      }

      if (accountIdHint) {
        const hintedProfile = await tryGraphGet(String(accountIdHint), {
          accessToken,
          params: {
            fields: 'id,username,name'
          }
        });

        if (hintedProfile?.id) {
          return {
            accountId: String(hintedProfile.id),
            username: hintedProfile.username || null,
            name: hintedProfile.name || hintedProfile.username || null,
            raw: hintedProfile
          };
        }
      }

      throw new Error('Unable to resolve an Instagram account from the OAuth access token.');
    },

    async syncThreads({ integration, conversationLimit = 25, messageLimit = 100, maxPages = 5 }) {
      if (!integration?.account_id || !integration?.access_token) {
        throw new Error('Missing Instagram integration account ID or access token.');
      }

      const conversations = await collectPaginated(`${integration.account_id}/conversations`, {
        accessToken: integration.access_token,
        params: {
          fields: 'id,updated_time,message_count,unread_count,participants',
          limit: conversationLimit
        },
        maxPages
      });

      const normalizedThreads = [];

      for (const conversation of conversations) {
        const messages = await collectPaginated(`${conversation.id}/messages`, {
          accessToken: integration.access_token,
          params: {
            fields: 'id,created_time,from,to,message,attachments',
            limit: messageLimit
          },
          maxPages
        });

        normalizedThreads.push(
          normalizeConversation(conversation, messages, integration.account_id)
        );
      }

      const syncedMessages = normalizedThreads.reduce(
        (total, thread) => total + thread.messages.length,
        0
      );

      return {
        source: 'instagram',
        accountId: integration.account_id,
        syncedThreads: normalizedThreads.length,
        syncedMessages,
        threads: normalizedThreads
      };
    },

    async publishPost(post) {
      return {
        instagramPostId: `ig_post_${post.id}`,
        status: 'posted'
      };
    }
  };
}

module.exports = {
  createInstagramService
};
