/**
 * Shopify Service
 *
 * Handles all Shopify API interactions:
 * - Product modifications
 * - Price updates
 * - Theme modifications
 * - Order tracking
 * - Webhook processing
 */

// Import Node.js runtime adapter for Shopify API
require('@shopify/shopify-api/adapters/node');
const { shopifyApi, ApiVersion } = require('@shopify/shopify-api');
const logger = require('../utils/logger');

class ShopifyService {
  constructor() {
    // Initialize Shopify API client
    // This would be configured with your API credentials
    this.api = shopifyApi({
      apiKey: process.env.SHOPIFY_API_KEY,
      apiSecretKey: process.env.SHOPIFY_API_SECRET,
      scopes: process.env.SHOPIFY_SCOPES?.split(',') || [],
      hostName: process.env.APP_URL?.replace(/https?:\/\//, '') || 'localhost:3000',
      apiVersion: ApiVersion.July23,
      isEmbeddedApp: true,
    });
  }

  /**
   * Get Shopify session for a shop
   *
   * @param {string} shopDomain - Shop domain
   * @param {string} accessToken - Access token
   * @returns {Object} Shopify session
   */
  getSession(shopDomain, accessToken) {
    return {
      shop: shopDomain,
      accessToken: accessToken,
      state: 'active',
    };
  }

  /**
   * Update product price
   *
   * @param {string} shopDomain - Shop domain
   * @param {string} accessToken - Access token
   * @param {string} productId - Product ID
   * @param {string} variantId - Variant ID
   * @param {number} price - New price
   * @returns {Promise<Object>} Updated product
   */
  async updateProductPrice(shopDomain, accessToken, productId, variantId, price) {
    const session = this.getSession(shopDomain, accessToken);
    const client = new this.api.clients.Graphql({ session });

    const mutation = `
      mutation productVariantUpdate($input: ProductVariantInput!) {
        productVariantUpdate(input: $input) {
          productVariant {
            id
            price
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        id: variantId,
        price: price.toString(),
      },
    };

    try {
      const response = await client.request(mutation, { variables });

      if (response.data.productVariantUpdate.userErrors.length > 0) {
        throw new Error(response.data.productVariantUpdate.userErrors[0].message);
      }

      return response.data.productVariantUpdate.productVariant;
    } catch (error) {
      logger.error('Error updating product price', { error: error.message, productId });
      throw error;
    }
  }

  /**
   * Get product information
   *
   * @param {string} shopDomain - Shop domain
   * @param {string} accessToken - Access token
   * @param {string} productId - Product ID
   * @returns {Promise<Object>} Product data
   */
  async getProduct(shopDomain, accessToken, productId) {
    const session = this.getSession(shopDomain, accessToken);
    const client = new this.api.clients.Graphql({ session });

    const query = `
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
          handle
          variants(first: 10) {
            edges {
              node {
                id
                title
                price
                sku
              }
            }
          }
        }
      }
    `;

    try {
      const response = await client.request(query, {
        variables: { id: productId },
      });
      return response.data.product;
    } catch (error) {
      logger.error('Error fetching product', { error: error.message, productId });
      throw error;
    }
  }

  /**
   * List products for store resource selector (targeting)
   *
   * @param {string} shopDomain - Shop domain
   * @param {string} accessToken - Access token
   * @param {string} [searchQuery] - Optional search query
   * @param {number} [first] - Max items (default 100)
   * @returns {Promise<Array<{id: string, title: string, handle: string}>>}
   */
  async listProducts(shopDomain, accessToken, searchQuery = '', first = 100) {
    const session = this.getSession(shopDomain, accessToken);
    const client = new this.api.clients.Graphql({ session });
    const query = `
      query listProducts($first: Int!, $query: String) {
        products(first: $first, query: $query) {
          edges {
            node {
              id
              title
              handle
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;
    try {
      const response = await client.request(query, {
        variables: { first, query: searchQuery || null },
      });
      const edges = response.data?.products?.edges || [];
      const list = edges.map(e => ({
        id: e.node.id,
        title: e.node.title || '(Untitled)',
        handle: e.node.handle || '',
      }));
      list.sort((a, b) =>
        (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
      );
      return list;
    } catch (error) {
      logger.error('Error listing products', { error: error.message, shopDomain });
      throw error;
    }
  }

  /**
   * List collections for store resource selector (targeting)
   *
   * @param {string} shopDomain - Shop domain
   * @param {string} accessToken - Access token
   * @param {string} [searchQuery] - Optional search query
   * @param {number} [first] - Max items (default 100)
   * @returns {Promise<Array<{id: string, title: string, handle: string}>>}
   */
  async listCollections(shopDomain, accessToken, searchQuery = '', first = 100) {
    const session = this.getSession(shopDomain, accessToken);
    const client = new this.api.clients.Graphql({ session });
    const query = `
      query listCollections($first: Int!, $query: String) {
        collections(first: $first, query: $query) {
          edges {
            node {
              id
              title
              handle
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;
    try {
      const response = await client.request(query, {
        variables: { first, query: searchQuery || null },
      });
      const edges = response.data?.collections?.edges || [];
      const list = edges.map(e => ({
        id: e.node.id,
        title: e.node.title || '(Untitled)',
        handle: e.node.handle || '',
      }));
      list.sort((a, b) =>
        (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
      );
      return list;
    } catch (error) {
      logger.error('Error listing collections', { error: error.message, shopDomain });
      throw error;
    }
  }

  /**
   * List Online Store pages for store resource selector (targeting)
   *
   * @param {string} shopDomain - Shop domain
   * @param {string} accessToken - Access token
   * @param {string} [searchQuery] - Optional search query
   * @param {number} [first] - Max items (default 100)
   * @returns {Promise<Array<{id: string, title: string, handle: string}>>}
   */
  async listPages(shopDomain, accessToken, searchQuery = '', first = 100) {
    const session = this.getSession(shopDomain, accessToken);
    const client = new this.api.clients.Graphql({ session });
    const query = `
      query listPages($first: Int!, $query: String) {
        pages(first: $first, query: $query) {
          edges {
            node {
              id
              title
              handle
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;
    try {
      const response = await client.request(query, {
        variables: { first, query: searchQuery || null },
      });
      const edges = response.data?.pages?.edges || [];
      const list = edges.map(e => ({
        id: e.node.id,
        title: e.node.title || '(Untitled)',
        handle: e.node.handle || '',
      }));
      list.sort((a, b) =>
        (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
      );
      return list;
    } catch (error) {
      logger.error('Error listing pages', { error: error.message, shopDomain });
      throw error;
    }
  }

  /**
   * Track order event (for conversion tracking)
   *
   * @param {Object} order - Order data from webhook
   * @returns {Promise<void>}
   */
  async trackOrder(order) {
    // This would integrate with your analytics tracking
    // Store order data for conversion analysis
    logger.debug('Tracking order', { orderId: order?.id });

    // You would save this to your database for analytics
    // await saveOrderEvent(order);
  }

  /**
   * Apply theme modifications
   *
   * @param {string} shopDomain - Shop domain
   * @param {string} accessToken - Access token
   * @param {string} themeId - Theme ID
   * @param {Object} modifications - Theme modifications
   * @returns {Promise<Object>} Result
   */
  async applyThemeModifications(shopDomain, accessToken, themeId, modifications) {
    // This would use Shopify Theme API to modify theme files
    // Implementation depends on your specific use case
    logger.debug('Applying theme modifications', { themeId, modifications });
    return { success: true };
  }

  /**
   * Create app proxy route for storefront integration
   *
   * @param {string} shopDomain - Shop domain
   * @param {string} accessToken - Access token
   * @param {string} proxyPath - Proxy path
   * @returns {Promise<Object>} Proxy configuration
   */
  async createAppProxy(shopDomain, accessToken, proxyPath) {
    const session = this.getSession(shopDomain, accessToken);
    const client = new this.api.clients.Graphql({ session });

    const mutation = `
      mutation appProxyCreate($input: AppProxyInput!) {
        appProxyCreate(input: $input) {
          appProxy {
            id
            subPath
            subPathPrefix
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        subPath: proxyPath,
        subPathPrefix: 'apps',
        proxyUrl: `${process.env.APP_URL}/api/proxy/script.js`,
      },
    };

    try {
      const response = await client.request(mutation, { variables });
      return response.data.appProxyCreate.appProxy;
    } catch (error) {
      logger.error('Error creating app proxy', { error: error.message, shopDomain });
      throw error;
    }
  }
}

module.exports = new ShopifyService();
