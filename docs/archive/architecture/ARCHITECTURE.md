# Architecture Overview

This document explains the architecture and design decisions of the AB Testing Tool.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Shopify Storefront                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Storefront Script (storefront-script.js)          │   │
│  │  - Gets variant assignment                          │   │
│  │  - Applies test variations                         │   │
│  │  - Tracks conversion events                         │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────────┘
                          │
                          │ HTTP/HTTPS
                          │
┌─────────────────────────▼─────────────────────────────────────┐
│                    Backend API Server                         │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  Express.js Application                              │     │
│  │  ┌──────────────┐  ┌──────────────┐                  │     │
│  │  │   Routes     │  │  Middleware  │                  │     │
│  │  └──────┬───────┘  └──────┬───────┘                  │     │
│  │         │                 │                          │     │
│  │  ┌──────▼─────────────────▼───────┐                  │     │
│  │  │      Services Layer            │                  │     │
│  │  │  - AB Test Engine              │                  │     │
│  │  │  - Traffic Allocator           │                  │     │
│  │  │  - Analytics Service           │                  │     │
│  │  │  - Shopify Service             │                  │     │
│  │  └──────┬─────────────────┬───────┘                  │     │
│  │         │                 │                          │     │
│  │  ┌──────▼─────────────────▼───────┐                  │     │
│  │  │      Models Layer              │                  │     │
│  │  │  - Test Model                  │                  │     │
│  │  │  - Assignment Model            │                  │     │
│  │  │  - Analytics Model             │                  │     │
│  │  └──────┬─────────────────┬───────┘                  │     │
│  └─────────┼─────────────────┼──────────────────────────┘     │
│            │                 │                                │
┌─────────────▼─────────────────▼──────────────────────────────┐
│                    Database Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │    Tests     │  │ Assignments  │  │   Events     │        │
│  │   Table      │  │    Table     │  │    Table     │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└──────────────────────────────────────────────────────────────┘
                          │
                          │
┌─────────────────────────▼─────────────────────────────────────┐
│              Shopify Admin (React Frontend)                   │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  React + Shopify Polaris                             │     │
│  │  - Dashboard Component                               │     │
│  │  - Test Creator Component                            │     │
│  │  - Test Detail Component                             │     │
│  │  - Analytics Component                               │     │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. AB Test Engine (`backend/src/services/abTestEngine.js`)

**Purpose**: Core logic for managing AB tests

**Key Functions**:

- `getVariant(testId, userId, shopDomain)`: Assigns or retrieves user's variant
- `selectVariant(variants, userId)`: Uses consistent hashing to select variant
- `validateTest(testConfig)`: Validates test configuration
- `startTest()` / `stopTest()`: Manages test lifecycle

**How It Works**:

1. When a user visits, the engine checks if they have an existing assignment
2. If not, it uses consistent hashing (MD5 of userId) to assign a variant
3. The assignment is saved to ensure consistency across sessions
4. Variant selection respects traffic allocation percentages

### 2. Traffic Allocator (`backend/src/services/trafficAllocator.js`)

**Purpose**: Distributes traffic evenly across variants

**Key Features**:

- Consistent hashing ensures same user always sees same variant
- Supports custom allocation percentages (e.g., 50/50, 80/20)
- Validates that allocations sum to 100%

**Algorithm**:

```javascript
hash = MD5(userId)
random = (hash % 10000) / 10000  // 0-1 range
cumulative = 0
for each variant:
    cumulative += variant.allocation / 100
    if random < cumulative:
        return variant
```

### 3. Analytics Service (`backend/src/services/analytics.js`)

**Purpose**: Calculates test results and statistical significance

**Key Functions**:

- `calculateConversionRate()`: Basic conversion rate calculation
- `calculateSignificance()`: Z-test for statistical significance
- `calculateRevenueImpact()`: Revenue difference analysis
- `getTestAnalytics()`: Comprehensive analytics report

**Statistical Methods**:

- Uses Z-test (two-proportion test) for significance
- Calculates p-values and confidence intervals
- Determines winner based on significance threshold (p < 0.05)
- Calculates lift percentage

### 4. Shopify Service (`backend/src/services/shopifyService.js`)

**Purpose**: Integrates with Shopify APIs

**Key Functions**:

- `updateProductPrice()`: Modifies product prices via GraphQL
- `getProduct()`: Fetches product information
- `trackOrder()`: Processes order webhooks
- `applyThemeModifications()`: Applies theme changes

**API Integration**:

- Uses Shopify GraphQL Admin API
- Handles OAuth authentication
- Manages API rate limits
- Processes webhooks for real-time updates

## Data Flow

### Creating a Test

```
1. Merchant fills form in React frontend
2. Frontend sends POST /api/tests
3. Backend validates test configuration
4. Test saved to database (status: 'draft')
5. Response returned to frontend
```

### Starting a Test

```
1. Merchant clicks "Start Test"
2. Frontend sends POST /api/tests/:id/start
3. Backend updates test status to 'running'
4. Test is now active and accepting traffic
```

### User Visits Storefront

```
1. Storefront script loads (storefront-script.js)
2. Script gets userId from cookie (or generates new)
3. Script calls GET /api/track/variant?test_id=X&user_id=Y
4. Backend AB Test Engine:
   a. Checks for existing assignment
   b. If none, selects variant using consistent hashing
   c. Saves assignment to database
   d. Returns variant information
5. Script applies variant (e.g., updates price)
6. User sees variant A or B
```

### Conversion Tracking

```
1. User completes purchase
2. Order confirmation page loads
3. Storefront script calls POST /api/track
4. Backend:
   a. Gets user's variant assignment
   b. Saves conversion event to database
   c. Updates analytics
5. Analytics dashboard shows updated results
```

### Viewing Analytics

```
1. Merchant views analytics dashboard
2. Frontend calls GET /api/analytics/tests/:id
3. Backend Analytics Service:
   a. Queries events and assignments
   b. Calculates conversion rates per variant
   c. Computes statistical significance
   d. Calculates revenue impact
4. Results displayed in charts and tables
```

## Database Schema

### Tests Table

Stores test configurations:

- `id`: Unique test identifier
- `shop_domain`: Shopify shop domain
- `name`, `type`, `status`: Test metadata
- `goal`: JSON object with goal configuration
- `variants`: JSON array of variant configurations

### Test Assignments Table

Tracks which variant each user sees:

- `test_id`: Reference to test
- `user_id`: User identifier (from cookie)
- `variant_id`: Assigned variant
- `assigned_at`: Timestamp

### Events Table

Stores conversion and interaction events:

- `test_id`: Reference to test
- `variant_id`: Variant that triggered event
- `user_id`: User who triggered event
- `event_type`: Type of event ('conversion', 'view', etc.)
- `event_value`: Monetary value (for conversions)
- `metadata`: Additional event data (JSON)

## Security Considerations

1. **Authentication**: Shopify OAuth 2.0
2. **Authorization**: Shop-specific data isolation
3. **Input Validation**: All inputs validated and sanitized
4. **Rate Limiting**: API endpoints rate-limited
5. **HTTPS**: All communications encrypted
6. **CORS**: Configured for specific origins
7. **SQL Injection**: Parameterized queries
8. **XSS Protection**: React escapes by default

## Scalability

### Current Design

- Single server architecture
- PostgreSQL database
- Cookie-based user tracking
- In-memory session management

### Scaling Strategies

1. **Horizontal Scaling**:
   - Load balancer for multiple API servers
   - Shared Redis for session storage
   - Database read replicas

2. **Caching**:
   - Redis cache for test configurations
   - CDN for static assets
   - Database query caching

3. **Database Optimization**:
   - Indexes on frequently queried columns
   - Partitioning for events table
   - Archival of old test data

4. **Async Processing**:
   - Queue system for analytics calculations
   - Background jobs for data aggregation
   - Webhook processing queue

## Performance Optimizations

1. **Database Indexes**: On test_id, user_id, shop_domain
2. **Connection Pooling**: PostgreSQL connection pool
3. **Lazy Loading**: Frontend components loaded on demand
4. **API Batching**: Batch variant assignments when possible
5. **CDN**: Static assets served from CDN

## Monitoring & Observability

### Recommended Metrics

- API response times
- Database query performance
- Error rates
- Test creation/start/stop events
- Conversion tracking success rate
- Active tests count

### Logging

- Structured logging (JSON format)
- Log levels: ERROR, WARN, INFO, DEBUG
- Request/response logging
- Error stack traces

## Future Enhancements

1. **Multi-variate Testing**: Support for more than 2 variants
2. **Advanced Targeting**: Geographic, device, customer segment
3. **Real-time Analytics**: WebSocket updates
4. **A/B/C Testing**: Support for multiple variants
5. **Auto-optimization**: Automatically select winning variant
6. **Machine Learning**: Predictive analytics
7. **Mobile App**: Native mobile app for merchants
8. **API Webhooks**: Notify external systems of test results

## Technology Choices

### Backend

- **Node.js + Express**: Fast, JavaScript ecosystem
- **PostgreSQL**: Reliable, ACID-compliant database
- **Redis**: Fast session storage (optional)

### Frontend

- **React**: Component-based UI
- **Shopify Polaris**: Consistent Shopify design
- **Vite**: Fast build tool
- **Recharts**: Data visualization

### Why These Choices?

- **JavaScript everywhere**: Single language for full stack
- **Shopify ecosystem**: Polaris ensures native feel
- **Performance**: Fast development and runtime
- **Community**: Large ecosystem and support

## Testing Strategy

### Unit Tests

- Service functions (AB engine, analytics)
- Utility functions
- Model methods

### Integration Tests

- API endpoints
- Database operations
- Shopify API integration

### E2E Tests

- Test creation flow
- Variant assignment
- Conversion tracking
- Analytics display

## Deployment Architecture

### Development

- Local PostgreSQL
- Local Redis (optional)
- Development servers

### Staging

- Heroku/AWS staging environment
- Staging database
- Test Shopify store

### Production

- Load-balanced servers
- Managed PostgreSQL (AWS RDS, Heroku Postgres)
- Redis cluster
- CDN for static assets
- Monitoring and alerting

---

This architecture provides a solid foundation for a scalable AB testing platform. The modular design allows for easy extension and customization based on specific needs.
