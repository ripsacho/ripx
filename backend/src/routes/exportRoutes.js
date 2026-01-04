/**
 * Export Routes
 *
 * API endpoints for exporting test results
 */

const express = require('express');
const router = express.Router();
const exportService = require('../services/exportService');

/**
 * GET /api/analytics/tests/:id/export
 * Export test analytics
 */
router.get('/tests/:id/export', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { format = 'csv' } = req.query;
    const shopDomain = req.shopDomain;

    if (format === 'csv') {
      const csv = await exportService.exportToCSV(id, shopDomain);
      const { getTestById } = require('../models/test');
      const test = await getTestById(id, shopDomain);
      const filename = exportService.generateFilename(id, test?.name || 'test', 'csv');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } else if (format === 'json') {
      const json = await exportService.exportToJSON(id, shopDomain);
      const { getTestById } = require('../models/test');
      const test = await getTestById(id, shopDomain);
      const filename = exportService.generateFilename(id, test?.name || 'test', 'json');

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json(json);
    } else {
      res.status(400).json({
        error: 'Invalid format. Use "csv" or "json"'
      });
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;

