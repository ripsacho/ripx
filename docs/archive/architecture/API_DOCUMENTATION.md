# API Documentation

Complete API reference for the AB Testing Tool.

## Base URL

- **Development:** `http://localhost:3000/api`
- **Production:** `https://your-app-url.com/api`

## Authentication

Most endpoints require Shopify authentication. Include shop domain in query parameter:

```
?shop=your-store.myshopify.com
```

## Endpoints

### Tests

#### Create Test

```http
POST /api/tests
Content-Type: application/json

{
  "name": "Product Price Test",
  "type": "price",
  "target_type": "product",
  "target_id": "123456789",
  "variants": [
    {
      "name": "Control",
      "allocation": 50,
      "config": {
        "price": 29.99
      }
    },
    {
      "name": "Variant A",
      "allocation": 50,
      "config": {
        "price": 24.99
      }
    }
  ],
  "goal": {
    "type": "conversion",
    "metric": "revenue"
  },
  "targeting": {
    "enabled": false
  }
}
```

**Response:**

```json
{
  "success": true,
  "test": {
    "id": "uuid",
    "name": "Product Price Test",
    "type": "price",
    "status": "draft",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

#### Get All Tests

```http
GET /api/tests?shop=your-store.myshopify.com&status=running
```

**Response:**

```json
{
  "success": true,
  "tests": [...],
  "count": 5
}
```

#### Get Test by ID

```http
GET /api/tests/:id?shop=your-store.myshopify.com
```

#### Update Test

```http
PUT /api/tests/:id?shop=your-store.myshopify.com
Content-Type: application/json

{
  "name": "Updated Test Name",
  "variants": [...]
}
```

#### Delete Test

```http
DELETE /api/tests/:id?shop=your-store.myshopify.com
```

#### Start Test

```http
POST /api/tests/:id/start?shop=your-store.myshopify.com
```

#### Stop Test

```http
POST /api/tests/:id/stop?shop=your-store.myshopify.com
```

### Analytics

#### Get Test Analytics

```http
GET /api/analytics/tests/:id?shop=your-store.myshopify.com
```

**Response:**

```json
{
  "success": true,
  "analytics": {
    "testId": "uuid",
    "variants": [
      {
        "id": "variant-id",
        "name": "Control",
        "visitors": 1000,
        "conversions": 50,
        "conversionRate": 5.0,
        "revenue": 1499.5,
        "avgOrderValue": 29.99
      }
    ],
    "significance": {
      "significant": true,
      "pValue": 0.02,
      "confidence": 98,
      "winner": "variant-id",
      "lift": 50
    },
    "revenueImpact": {
      "controlRevenue": 1499.5,
      "testRevenue": 1874.25,
      "impact": 374.75,
      "impactPercent": 25.0
    }
  }
}
```

#### Export Analytics

```http
GET /api/analytics/tests/:id/export?shop=your-store.myshopify.com&format=csv
GET /api/analytics/tests/:id/export?shop=your-store.myshopify.com&format=json
```

Returns file download.

### Promo Links

#### Create Promo Link

```http
POST /api/promo-links?shop=your-store.myshopify.com
Content-Type: application/json

{
  "test_id": "uuid",
  "variant_id": "variant-id",
  "name": "Black Friday Promo",
  "discount_type": "percentage",
  "discount_value": 20,
  "target_type": "cart",
  "target_id": null,
  "expires_at": "2024-12-31T23:59:59Z",
  "max_uses": 100
}
```

**Response:**

```json
{
  "success": true,
  "promoLink": {
    "id": "uuid",
    "token": "abc123...",
    "url": "https://your-app.com/promo/abc123?shop=...",
    "uses_count": 0
  }
}
```

#### Get Promo Links for Test

```http
GET /api/promo-links/test/:testId?shop=your-store.myshopify.com
```

#### Validate Promo Link

```http
GET /api/promo-links/validate/:token?shop=your-store.myshopify.com
```

### Tracking

#### Get User Variant

```http
GET /api/track/variant?test_id=uuid&user_id=user123&shop_domain=your-store.myshopify.com
```

**Response:**

```json
{
  "success": true,
  "variant": {
    "variantId": "variant-id",
    "variantName": "Variant A",
    "isNewAssignment": false
  }
}
```

#### Track Conversion

```http
POST /api/track
Content-Type: application/json

{
  "test_id": "uuid",
  "user_id": "user123",
  "shop_domain": "your-store.myshopify.com",
  "event_type": "conversion",
  "event_value": 29.99,
  "metadata": {
    "order_id": "123456"
  }
}
```

### Webhooks

#### Order Created

```http
POST /api/webhooks/orders/create
X-Shopify-Shop-Domain: your-store.myshopify.com
X-Shopify-Hmac-Sha256: hmac_signature
Content-Type: application/json

{
  "id": 123456,
  "email": "customer@example.com",
  "total_price": "29.99",
  "line_items": [...]
}
```

#### Product Updated

```http
POST /api/webhooks/products/update
X-Shopify-Shop-Domain: your-store.myshopify.com
X-Shopify-Hmac-Sha256: hmac_signature
```

#### App Uninstalled

```http
POST /api/webhooks/app/uninstalled
X-Shopify-Shop-Domain: your-store.myshopify.com
X-Shopify-Hmac-Sha256: hmac_signature
```

### Shopify Integration

#### Get Product

```http
GET /api/shopify/products/:id?shop=your-store.myshopify.com
```

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "status": 400,
  "details": {
    "field": "Additional error details"
  }
}
```

### Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `500` - Internal Server Error

## Rate Limiting

- **Default:** 100 requests per 15 minutes per IP
- **Webhooks:** No rate limiting (HMAC verified)

## Test Types

### Price Test

```json
{
  "type": "price",
  "target_type": "product",
  "target_id": "product-id",
  "variants": [
    {
      "config": {
        "price": 29.99
      }
    }
  ]
}
```

### Content Test

```json
{
  "type": "content",
  "target_type": "page",
  "target_id": "page-id",
  "variants": [
    {
      "config": {
        "headline": "New Headline",
        "description": "New Description"
      }
    }
  ]
}
```

### Shipping Test

```json
{
  "type": "shipping",
  "variants": [
    {
      "config": {
        "shipping_rate": 5.99,
        "free_shipping_threshold": 50
      }
    }
  ]
}
```

### Offer Test

```json
{
  "type": "offer",
  "variants": [
    {
      "config": {
        "discount_type": "percentage",
        "discount_value": 10
      }
    }
  ]
}
```

### Combination Test

```json
{
  "type": "combination",
  "variables": [
    {
      "type": "price",
      "variants": [29.99, 24.99]
    },
    {
      "type": "shipping",
      "variants": [5.99, 0]
    }
  ],
  "combinations": [
    {
      "price": 29.99,
      "shipping": 5.99,
      "allocation": 25
    },
    {
      "price": 29.99,
      "shipping": 0,
      "allocation": 25
    },
    {
      "price": 24.99,
      "shipping": 5.99,
      "allocation": 25
    },
    {
      "price": 24.99,
      "shipping": 0,
      "allocation": 25
    }
  ]
}
```

## Targeting Configuration

```json
{
  "targeting": {
    "enabled": true,
    "geographic": {
      "enabled": true,
      "countries": ["US", "CA"],
      "excludeCountries": []
    },
    "device": {
      "enabled": true,
      "types": ["desktop", "mobile"]
    },
    "customerSegment": {
      "enabled": true,
      "customerType": "new",
      "tags": ["vip"],
      "totalSpent": {
        "min": 0,
        "max": 1000
      }
    },
    "timeBased": {
      "enabled": true,
      "timeOfDay": {
        "start": 9,
        "end": 17
      },
      "daysOfWeek": [1, 2, 3, 4, 5]
    }
  }
}
```

## Custom Metrics

```json
{
  "goal": {
    "type": "custom",
    "metrics": [
      {
        "name": "Profit",
        "type": "profit",
        "cogs": {
          "enabled": true,
          "type": "percentage",
          "value": 30
        }
      },
      {
        "name": "Custom Event",
        "type": "custom_event",
        "eventName": "newsletter_signup",
        "aggregation": "count"
      },
      {
        "name": "Custom Formula",
        "type": "custom_formula",
        "formula": "revenue * 0.3 - cogs"
      }
    ]
  }
}
```

## Examples

### Complete Price Test Example

```bash
# 1. Create test
curl -X POST http://localhost:3000/api/tests?shop=your-store.myshopify.com \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Summer Sale Price Test",
    "type": "price",
    "target_type": "product",
    "target_id": "123456789",
    "variants": [
      {
        "name": "Control",
        "allocation": 50,
        "config": {"price": 29.99}
      },
      {
        "name": "Sale Price",
        "allocation": 50,
        "config": {"price": 24.99}
      }
    ],
    "goal": {
      "type": "conversion",
      "metric": "revenue"
    }
  }'

# 2. Start test
curl -X POST http://localhost:3000/api/tests/{test-id}/start?shop=your-store.myshopify.com

# 3. Get analytics
curl http://localhost:3000/api/analytics/tests/{test-id}?shop=your-store.myshopify.com

# 4. Export results
curl http://localhost:3000/api/analytics/tests/{test-id}/export?shop=your-store.myshopify.com&format=csv \
  -o results.csv
```

## Webhook Verification

Webhooks are verified using HMAC SHA256. Verify signature:

```javascript
const crypto = require('crypto');

function verifyWebhook(data, hmacHeader) {
  const hmac = crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET);
  const hash = hmac.update(data, 'utf8').digest('base64');
  return hash === hmacHeader;
}
```

## Best Practices

1. **Always include shop domain** in query parameters
2. **Handle errors gracefully** - Check status codes
3. **Use webhooks** for real-time conversion tracking
4. **Validate test configurations** before creating
5. **Monitor rate limits** - Implement retry logic
6. **Cache test configurations** for performance
7. **Log all API calls** for debugging

## Support

For issues or questions:

- Check the main README.md
- Review DETAILED_SETUP_GUIDE.md
- Check server logs for detailed error messages
