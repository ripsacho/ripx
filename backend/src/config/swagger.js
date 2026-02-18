/**
 * OpenAPI / Swagger configuration
 */

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'RipX API',
      version: '1.0.0',
      description: 'AB Testing Platform API - Shopify and standalone sites',
    },
    servers: [
      { url: process.env.APP_URL || 'http://localhost:3000', description: 'API Server' },
    ],
    components: {
      securitySchemes: {
        shopParam: { type: 'apiKey', in: 'query', name: 'shop', description: 'Shopify shop domain' },
        apiKey: { type: 'apiKey', in: 'header', name: 'X-RipX-API-Key', description: 'Standalone API key' },
      },
    },
  },
  apis: [require('path').join(__dirname, '../routes/*.js')],
};

module.exports = swaggerJsdoc(options);
