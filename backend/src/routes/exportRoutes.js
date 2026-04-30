/**
 * Export Routes
 *
 * API endpoints for exporting test results. Mounted under /api/analytics/, so:
 * - GET /api/analytics/tests/:id/export?format=csv|json&start_date=&end_date=
 * - BigQuery export is triggered via jobs (see bigQueryExport.js) or admin aggregation.
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/asyncHandler');
const validators = require('../utils/validators');
const exportService = require('../services/exportService');
const { exportToBigQuery } = require('../jobs/bigQueryExport');
const {
  getExportSchemaManifest,
  validateExportSchemaManifest,
} = require('../services/warehouseExportSchemaService');

const validateTestId = (req, res, next) => {
  const id = req.params?.id;
  if (!id || !validators.isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid test ID format' });
  }
  next();
};

/**
 * GET /api/analytics/tests/:id/export
 * Export test analytics
 */
router.get(
  '/tests/:id/export',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { format = 'csv', start_date, end_date } = req.query;
    const shopDomain = req.shopDomain;
    const dateRange = start_date || end_date ? { start_date, end_date } : null;

    if (format === 'csv') {
      const csv = await exportService.exportToCSV(id, shopDomain, dateRange);
      const { getTestById } = require('../models/test');
      const test = await getTestById(id, shopDomain);
      const filename = exportService.generateFilename(id, test?.name || 'test', 'csv');
      const safeFilename = String(filename).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.send(csv);
    } else if (format === 'json') {
      const json = await exportService.exportToJSON(id, shopDomain, dateRange);
      const { getTestById } = require('../models/test');
      const test = await getTestById(id, shopDomain);
      const filename = exportService.generateFilename(id, test?.name || 'test', 'json');
      const safeFilename = String(filename).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.json(json);
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid format. Use "csv" or "json"',
      });
    }
  })
);

/**
 * POST /api/analytics/bigquery/export
 * Trigger BigQuery export (events, optionally tests).
 * Query: full=true to also export tests snapshot.
 */
router.post(
  '/bigquery/export',
  asyncHandler(async (req, res, next) => {
    try {
      const { full } = req.query;
      const shopDomain = req.shopDomain;
      const result = await exportToBigQuery({ full: full === 'true', shopDomain });
      if (result.skipped) {
        return res.status(503).json({
          success: false,
          error: result.reason || 'BigQuery export not configured',
        });
      }
      res.json({
        success: true,
        exported: result.exported,
        tables: result.tables,
        lastExportAt: result.lastExportAt,
        schemaValidation: result.schemaValidation || null,
      });
    } catch (error) {
      const msg = String(error?.message || '');
      const isNotFound =
        msg.includes('Not found') ||
        msg.includes('not found') ||
        error?.code === 404 ||
        error?.errors?.[0]?.reason === 'notFound';
      if (isNotFound) {
        return res.status(404).json({
          success: false,
          error:
            'BigQuery table or dataset not found. Create tables using backend/docs/bigquery_schema.sql',
        });
      }
      next(error);
    }
  })
);

/**
 * GET /api/analytics/export/schema
 * Warehouse schema manifest for analyst workflows and BigQuery validation.
 */
router.get(
  '/export/schema',
  asyncHandler((_req, res) => {
    const manifest = getExportSchemaManifest();
    return res.json({
      success: true,
      manifest,
      validation: validateExportSchemaManifest(manifest),
    });
  })
);

module.exports = router;
