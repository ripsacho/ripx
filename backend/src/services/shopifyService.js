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
   * Direct Admin GraphQL helper for routes that need a newer API version than the SDK enum bundle ships with.
   * This is used for discount/function management because community reports indicate
   * `discountAutomaticAppCreate` had issues on Admin API versions before 2025-04.
   */
  async requestAdminGraphql(shopDomain, accessToken, query, variables = {}, opts = {}) {
    const apiVersion = String(opts.apiVersion || '2025-04').trim();
    const endpoint = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      logger.error('Admin GraphQL request failed', {
        shopDomain,
        apiVersion,
        status: response.status,
        errors: payload?.errors || null,
      });
      throw new Error(
        payload?.errors?.[0]?.message ||
          `Shopify Admin GraphQL failed (${response.status}) for ${shopDomain}`
      );
    }
    if (payload?.errors?.length) {
      throw new Error(payload.errors[0]?.message || 'Shopify Admin GraphQL returned errors');
    }
    return payload;
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
   * List products for store resource selector (targeting).
   *
   * @param {string} [after] - GraphQL cursor for pagination
   * @returns {Promise<{ list: Array<{id: string, title: string, handle: string, imageUrl: string|null}>, pageInfo: { hasNextPage: boolean, endCursor: string|null } }>}
   */
  async listProducts(shopDomain, accessToken, searchQuery = '', first = 100, after = null) {
    const session = this.getSession(shopDomain, accessToken);
    const client = new this.api.clients.Graphql({ session });
    const query = `
      query listProducts($first: Int!, $query: String, $after: String) {
        products(first: $first, query: $query, after: $after) {
          edges {
            node {
              id
              title
              handle
              featuredImage {
                url
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;
    try {
      const capped = Math.min(Math.max(1, first), 100);
      const response = await client.request(query, {
        variables: {
          first: capped,
          query: searchQuery || null,
          after: after || null,
        },
      });
      const edges = response.data?.products?.edges || [];
      const pageInfo = response.data?.products?.pageInfo || {
        hasNextPage: false,
        endCursor: null,
      };
      const list = edges.map(e => ({
        id: e.node.id,
        title: e.node.title || '(Untitled)',
        handle: e.node.handle || '',
        imageUrl: e.node.featuredImage?.url || null,
      }));
      if (!after) {
        list.sort((a, b) =>
          (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
        );
      }
      return {
        list,
        pageInfo: {
          hasNextPage: !!pageInfo.hasNextPage,
          endCursor: pageInfo.endCursor || null,
        },
      };
    } catch (error) {
      logger.error('Error listing products', { error: error.message, shopDomain });
      throw error;
    }
  }

  /**
   * List products with their variants for native price mapping UX.
   *
   * @param {string} shopDomain - Shop domain
   * @param {string} accessToken - Access token
   * @param {string} [searchQuery] - Optional search query
   * @param {number} [first] - Max products
   * @param {number} [variantsFirst] - Max variants per product
   * @returns {Promise<Array<{id: string, title: string, handle: string, variants: Array<{id: string, title: string, displayName: string, sku: string, price: string, compareAtPrice: string|null}>}>>}
   */
  async listProductsWithVariants(
    shopDomain,
    accessToken,
    searchQuery = '',
    first = 24,
    variantsFirst = 25
  ) {
    const session = this.getSession(shopDomain, accessToken);
    const client = new this.api.clients.Graphql({ session });
    const query = `
      query listProductsWithVariants($first: Int!, $query: String, $variantsFirst: Int!) {
        products(first: $first, query: $query) {
          edges {
            node {
              id
              title
              handle
              variants(first: $variantsFirst) {
                edges {
                  node {
                    id
                    title
                    displayName
                    sku
                    price
                    compareAtPrice
                  }
                }
              }
            }
          }
        }
      }
    `;
    try {
      const response = await client.request(query, {
        variables: {
          first,
          query: searchQuery || null,
          variantsFirst,
        },
      });
      const edges = response.data?.products?.edges || [];
      const list = edges.map(e => ({
        id: e.node.id,
        title: e.node.title || '(Untitled)',
        handle: e.node.handle || '',
        variants: (e.node.variants?.edges || [])
          .map(ve => ({
            id: ve.node.id,
            title: ve.node.title || 'Default Title',
            displayName: ve.node.displayName || ve.node.title || 'Untitled variant',
            sku: ve.node.sku || '',
            price:
              ve.node.price !== null && ve.node.price !== undefined ? String(ve.node.price) : '',
            compareAtPrice:
              ve.node.compareAtPrice !== null && ve.node.compareAtPrice !== undefined
                ? String(ve.node.compareAtPrice)
                : null,
          }))
          .sort((a, b) =>
            (a.displayName || '').localeCompare(b.displayName || '', undefined, {
              sensitivity: 'base',
            })
          ),
      }));
      list.sort((a, b) =>
        (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
      );
      return list;
    } catch (error) {
      logger.error('Error listing products with variants', {
        error: error.message,
        shopDomain,
      });
      throw error;
    }
  }

  /**
   * Get one product with its variants for scoped native variant mapping.
   *
   * @param {string} shopDomain
   * @param {string} accessToken
   * @param {string} productId
   * @param {number} [variantsFirst]
   * @returns {Promise<{id: string, title: string, handle: string, variants: Array}>}
   */
  async getProductWithVariants(shopDomain, accessToken, productId, variantsFirst = 50) {
    const session = this.getSession(shopDomain, accessToken);
    const client = new this.api.clients.Graphql({ session });
    const query = `
      query getProductWithVariants($id: ID!, $variantsFirst: Int!) {
        product(id: $id) {
          id
          title
          handle
          variants(first: $variantsFirst) {
            edges {
              node {
                id
                title
                displayName
                sku
                price
                compareAtPrice
              }
            }
          }
        }
      }
    `;
    try {
      const response = await client.request(query, {
        variables: { id: productId, variantsFirst },
      });
      const node = response.data?.product;
      if (!node) {
        return null;
      }
      return {
        id: node.id,
        title: node.title || '(Untitled)',
        handle: node.handle || '',
        variants: (node.variants?.edges || [])
          .map(ve => ({
            id: ve.node.id,
            title: ve.node.title || 'Default Title',
            displayName: ve.node.displayName || ve.node.title || 'Untitled variant',
            sku: ve.node.sku || '',
            price:
              ve.node.price !== null && ve.node.price !== undefined ? String(ve.node.price) : '',
            compareAtPrice:
              ve.node.compareAtPrice !== null && ve.node.compareAtPrice !== undefined
                ? String(ve.node.compareAtPrice)
                : null,
          }))
          .sort((a, b) =>
            (a.displayName || '').localeCompare(b.displayName || '', undefined, {
              sensitivity: 'base',
            })
          ),
      };
    } catch (error) {
      logger.error('Error fetching product with variants', {
        error: error.message,
        productId,
        shopDomain,
      });
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
   * @param {string|null} [after] - GraphQL cursor for pagination
   * @returns {Promise<{ list: Array<{id: string, title: string, handle: string}>, pageInfo: { hasNextPage: boolean, endCursor: string|null } }>}
   */
  async listCollections(shopDomain, accessToken, searchQuery = '', first = 100, after = null) {
    const session = this.getSession(shopDomain, accessToken);
    const client = new this.api.clients.Graphql({ session });
    const query = `
      query listCollections($first: Int!, $query: String, $after: String) {
        collections(first: $first, query: $query, after: $after) {
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
      const capped = Math.min(Math.max(1, first), 100);
      const response = await client.request(query, {
        variables: {
          first: capped,
          query: searchQuery || null,
          after: after || null,
        },
      });
      const edges = response.data?.collections?.edges || [];
      const pageInfo = response.data?.collections?.pageInfo || {
        hasNextPage: false,
        endCursor: null,
      };
      const list = edges.map(e => ({
        id: e.node.id,
        title: e.node.title || '(Untitled)',
        handle: e.node.handle || '',
      }));
      if (!after) {
        list.sort((a, b) =>
          (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
        );
      }
      return {
        list,
        pageInfo: {
          hasNextPage: !!pageInfo.hasNextPage,
          endCursor: pageInfo.endCursor || null,
        },
      };
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
   * @param {string|null} [after] - GraphQL cursor for pagination
   * @returns {Promise<{ list: Array<{id: string, title: string, handle: string}>, pageInfo: { hasNextPage: boolean, endCursor: string|null } }>}
   */
  async listPages(shopDomain, accessToken, searchQuery = '', first = 100, after = null) {
    const session = this.getSession(shopDomain, accessToken);
    const client = new this.api.clients.Graphql({ session });
    const query = `
      query listPages($first: Int!, $query: String, $after: String) {
        pages(first: $first, query: $query, after: $after) {
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
      const capped = Math.min(Math.max(1, first), 100);
      const response = await client.request(query, {
        variables: {
          first: capped,
          query: searchQuery || null,
          after: after || null,
        },
      });
      const edges = response.data?.pages?.edges || [];
      const pageInfo = response.data?.pages?.pageInfo || {
        hasNextPage: false,
        endCursor: null,
      };
      const list = edges.map(e => ({
        id: e.node.id,
        title: e.node.title || '(Untitled)',
        handle: e.node.handle || '',
      }));
      if (!after) {
        list.sort((a, b) =>
          (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
        );
      }
      return {
        list,
        pageInfo: {
          hasNextPage: !!pageInfo.hasNextPage,
          endCursor: pageInfo.endCursor || null,
        },
      };
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
        proxyUrl: `${process.env.APP_URL}/api/proxy`,
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
