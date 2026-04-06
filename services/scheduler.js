const { getLatestIntegration, syncIntegrationToDb } = require('./dmSync');

function createScheduler() {
  let dmTimer = null;

  return {
    start() {
      const intervalMinutes = Number(process.env.DM_SYNC_INTERVAL_MINUTES || 5);
      dmTimer = setInterval(async () => {
        try {
          const integration = getLatestIntegration();

          if (!integration) {
            return;
          }

          await syncIntegrationToDb({ integration });
        } catch (error) {
          console.error('Scheduled DM sync failed:', error);
        }
      }, intervalMinutes * 60 * 1000);
    },

    stop() {
      if (dmTimer) {
        clearInterval(dmTimer);
        dmTimer = null;
      }
    }
  };
}

module.exports = {
  createScheduler
};
