/**
 * API Documentation Routes
 * Serves OpenAPI spec and Swagger UI
 */

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../config/swagger');

const router = express.Router();

/**
 * @openapi
 * /api-docs:
 *   get:
 *     summary: Swagger UI
 *     tags: [Docs]
 */
router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(swaggerSpec, { explorer: true }));

/**
 * @openapi
 * /api-docs/json:
 *   get:
 *     summary: OpenAPI JSON spec
 *     tags: [Docs]
 */
router.get('/json', (req, res) => {
  res.json(swaggerSpec);
});

module.exports = router;
