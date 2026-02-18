/**
 * Archive Processor
 *
 * Auto-archives completed/stopped tests after configurable days
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');
const { archiveQueue } = require('./queue');

const ARCHIVE_DAYS = parseInt(process.env.RIPX_ARCHIVE_DAYS_AFTER, 10) || 90;

async function archiveOldTests() {
  try {
    const sql = `
      UPDATE tests
      SET status = 'archived', updated_at = NOW()
      WHERE status IN ('stopped', 'completed')
        AND stopped_at < NOW() - INTERVAL '1 day' * $1
      RETURNING id, shop_domain, name
    `;
    const result = await query(sql, [ARCHIVE_DAYS]);
    const count = result.rowCount || 0;
    if (count > 0) {
      logger.info('Archived old tests', { count, archived: result.rows.map(r => r.id) });
    }
    return count;
  } catch (err) {
    logger.error('Archive job failed', { error: err.message });
    return 0;
  }
}

if (archiveQueue) {
  archiveQueue.process(async () => archiveOldTests());
  // Schedule daily archive
  archiveQueue.add({}, { repeat: { cron: '0 3 * * *' } }); // 3am daily
}

module.exports = { archiveOldTests };
