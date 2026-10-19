import cron from 'node-cron';
import { logger } from '../utils/logger';
import { recordProbabilitySnapshots } from '../services/MarketService';

let isRunning = false;

export function startProbabilitySnapshotCron(): void {
  if (process.env.PROBABILITY_SNAPSHOT_CRON_DISABLED === 'true') {
    logger.info('Probability snapshot cron job is disabled via PROBABILITY_SNAPSHOT_CRON_DISABLED');
    return;
  }

  cron.schedule('* * * * *', async () => {
    if (isRunning) {
      logger.warn('probabilitySnapshotJob: previous run still in progress, skipping');
      return;
    }

    isRunning = true;
    try {
      const recorded = await recordProbabilitySnapshots();
      logger.debug({ recorded }, 'probabilitySnapshotJob: completed');
    } catch (err) {
      logger.error({ err }, 'probabilitySnapshotJob: failed');
    } finally {
      isRunning = false;
    }
  });

  logger.info('Probability snapshot cron job scheduled (every 60 seconds)');
}
