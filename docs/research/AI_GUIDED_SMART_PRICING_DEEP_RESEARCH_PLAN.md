# AI-Guided Smart Pricing: Deep Research and Implementation Plan

## 1. Executive summary

RipX should build **AI-Guided Smart Pricing** as a controlled, profit-first pricing intelligence system for Shopify merchants.

The correct model is **not** blind dynamic repricing. The safest and strongest approach is:

1. Use store data to identify pricing opportunities.
2. Use deterministic pricing math to create candidate price bands.
3. Use an AI API to explain, rank, and structure recommendations.
4. Run controlled price experiments through RipX.
5. Learn from outcomes and propose the next test round.
6. Apply winners only with guardrails and merchant approval.

The AI should be a **pricing copilot and recommendation layer**, not the final authority that writes prices directly.

## 2. Research findings

### 2.1 Market direction

Modern Shopify pricing tools are converging on four ideas:

- **Profit per visitor** is more important than conversion rate alone.
- Price decisions should be tested on real shoppers, not guessed from dashboards.
- Merchants want AI to recommend **what to test**, not take uncontrolled action.
- Guardrails, approval flows, and audit history are mandatory for trust.

Relevant market signals:

- **Shopify Smart Pricing** recommends markups/markdowns from store data and offers A/B price testing for selected merchants.
- **Intelligems** positions around profit per visitor, price tests, discounts, shipping, and multi-currency pricing.
- **Curvature AI** markets AI recommendations for which products/collections and which prices to test.
- **ABConvert** also emphasizes profit, AOV, margin, and price testing across Shopify.

Conclusion: RipX should not compete as a manual A/B test tool only. The stronger positioning is:

> AI recommends the next best pricing experiment, RipX runs it safely, and merchants apply winners with confidence.

### 2.2 Best-practice pricing methodology

The strongest implementation is a staged learning loop:

1. **Opportunity scoring**: find products where price optimization is worth testing.
2. **Candidate band generation**: propose safe prices around the current price.
3. **Controlled experiment**: run A/B/n test with stable assignment.
4. **Profit analysis**: evaluate profit per visitor, RPV, AOV, conversion, and guardrails.
5. **Next-round optimization**: if the winner is clear, propose a narrower next band.
6. **Winner rollout**: update Shopify price only after approval.

Example:

| Round   | Candidate prices | Outcome          |
| ------- | ---------------- | ---------------- |
| 1       | $100, $95, $105  | $95 wins         |
| 2       | $95, $92, $90    | $92 wins         |
| 3       | $92, $91, $93    | $92 remains best |
| Rollout | Apply $92        | Stop or monitor  |

This is better than testing 5%, 10%, and 15% blindly because each round uses real results to narrow the search.

## 3. What role should the AI API play?

### 3.1 What AI should do

Use AI for:

- Turning raw metrics into understandable recommendations.
- Ranking opportunities when there are many products.
- Explaining why a test is recommended.
- Producing structured test proposals in JSON.
- Helping merchants ask questions like:
  - “Which products should I optimize first?”
  - “Why are you recommending a 5% increase?”
  - “What is the risk of testing this product?”
  - “What should the next price test be after this winner?”

### 3.2 What AI should not do

AI should not:

- Directly write catalog prices.
- Bypass guardrails.
- Invent data not in the metrics payload.
- Choose prices outside configured limits.
- Make legal, tax, or compliance promises.
- Optimize only for conversion rate.

### 3.3 Recommended AI provider

Use **OpenAI first** because RipX already has:

- `openai` dependency.
- `OPENAI_API_KEY`.
- Existing support AI integration.
- Existing RAG / support knowledge base patterns.

For new work, prefer OpenAI **Responses API with Structured Outputs** if the SDK version supports it. If we keep the current Chat Completions integration initially, use strict JSON schema validation in our backend and retry/fallback logic.

Recommended env vars:

```env
OPENAI_API_KEY=...
SMART_PRICING_AI_ENABLED=true
SMART_PRICING_AI_MODEL=gpt-5.5
SMART_PRICING_AI_FALLBACK_MODEL=gpt-4o-mini
SMART_PRICING_AI_MAX_PRODUCTS=50
SMART_PRICING_AI_MAX_TOKENS=2500
SMART_PRICING_AI_DRY_RUN=true
```

Provider abstraction should be built from day one:

```text
priceAiProvider
  ├── openAiPricingProvider
  ├── mockPricingProvider
  └── rulesOnlyPricingProvider
```

This keeps the product usable if AI quota is missing or the API is down.

## 4. Recommended system architecture

```text
Shopify orders + RipX events
        ↓
Pricing data layer
        ↓
SKU metrics + feature store
        ↓
Deterministic opportunity engine
        ↓
AI recommendation layer
        ↓
Guardrail / policy engine
        ↓
RipX price test creation
        ↓
Experiment analytics
        ↓
Next-round recommendation
        ↓
Approval-gated rollout
```

### 4.1 Data layer

Data sources:

- Shopify orders
- Order line items
- Product variants
- Current catalog prices
- COGS or margin config
- Inventory, if enabled later
- RipX test assignments
- RipX events and conversions
- Existing test results

Important Shopify scope note:

- `read_orders` gives access to recent order history.
- Older than 60 days requires Shopify approval for `read_all_orders`.
- MVP can start with 60-day data plus new webhooks.

### 4.2 Metrics layer

Create a SKU-level daily metrics table.

Suggested table:

```sql
smart_pricing_sku_daily_metrics
  id
  shop_domain
  product_id
  variant_id
  sku
  title
  date
  current_price
  compare_at_price
  units_sold
  gross_revenue
  discounts
  net_revenue
  estimated_cogs
  estimated_profit
  visitors
  conversions
  conversion_rate
  revenue_per_visitor
  profit_per_visitor
  average_order_value
  created_at
  updated_at
```

Create a summary projection:

```sql
smart_pricing_sku_opportunities
  shop_domain
  product_id
  variant_id
  baseline_price
  baseline_profit_per_visitor
  baseline_conversion_rate
  baseline_units_sold
  estimated_margin_percent
  opportunity_score
  risk_level
  confidence_level
  recommended_action
  last_recommended_at
```

### 4.3 Deterministic opportunity scoring

Before AI is called, calculate a deterministic score.

Example:

```text
opportunity_score =
  traffic_score
  × margin_score
  × revenue_score
  × uncertainty_score
  × safety_score
```

Signals:

- High product traffic
- Stable order volume
- Healthy margin
- High revenue contribution
- No recent pricing change
- Not currently under promo
- Not a subscription/bundle edge case
- Enough data to test safely

The AI should receive this score and supporting metrics, not raw unlimited order data.

### 4.4 Candidate price band generator

Use rules first:

```text
If margin is high and conversion stable:
  test current, +3%, +5%

If conversion is weak but margin is high:
  test current, -5%, -8%

If inventory is slow-moving:
  test current, -5%, -10%

If product is fast-moving and stock is healthy:
  test current, +5%, +8%
```

All prices must pass:

- Minimum margin floor
- Maximum discount
- Maximum increase
- Price rounding
- MAP / brand policy, if configured
- Stock / inventory rules, if configured

### 4.5 AI recommendation layer

The AI receives a compact, redacted, structured payload:

```json
{
  "shop_context": {
    "currency": "USD",
    "primary_goal": "profit_per_visitor",
    "guardrails": {
      "min_margin_percent": 35,
      "max_price_change_percent": 15,
      "max_active_ai_tests": 5
    }
  },
  "candidates": [
    {
      "product_id": "gid://shopify/Product/1",
      "variant_id": "gid://shopify/ProductVariant/1",
      "title": "Core Hoodie / Medium",
      "current_price": 100,
      "estimated_margin_percent": 58,
      "units_sold_30d": 240,
      "profit_per_visitor": 2.18,
      "conversion_rate": 0.034,
      "opportunity_score": 87,
      "candidate_prices": [95, 100, 105]
    }
  ]
}
```

The AI returns strict JSON:

```json
{
  "recommendations": [
    {
      "rank": 1,
      "product_id": "gid://shopify/Product/1",
      "variant_id": "gid://shopify/ProductVariant/1",
      "recommended_test_name": "AI Smart Price Test - Core Hoodie",
      "objective": "profit_per_visitor",
      "price_arms": [
        { "label": "Control", "price": 100, "allocation": 40 },
        { "label": "Test A", "price": 95, "allocation": 30 },
        { "label": "Test B", "price": 105, "allocation": 30 }
      ],
      "confidence": "medium",
      "risk_level": "low",
      "reasoning_summary": "Strong sales volume and high margin make this SKU safe for a controlled price sensitivity test.",
      "expected_learning": "Determine whether margin gain from a higher price beats possible conversion loss.",
      "required_guardrails": [
        "Do not go below 35% margin",
        "Pause if conversion drops more than 20% without PPV improvement"
      ]
    }
  ]
}
```

Backend must validate:

- All product IDs exist in candidate input.
- All price arms exist in candidate generated set or pass deterministic policy.
- Allocation totals equal 100.
- Price values pass guardrails.
- No extra schema fields are accepted.

## 5. Actual AI API implementation

### 5.1 OpenAI Responses API flow

Recommended high-level request:

```js
const response = await openai.responses.create({
  model: process.env.SMART_PRICING_AI_MODEL || 'gpt-5.5',
  input: [
    {
      role: 'system',
      content:
        'You are a pricing intelligence copilot. Recommend controlled price experiments only from provided candidate data. Never invent products, prices, or metrics.',
    },
    {
      role: 'user',
      content: JSON.stringify(pricingContext),
    },
  ],
  text: {
    format: {
      type: 'json_schema',
      name: 'smart_pricing_recommendations',
      strict: true,
      schema: smartPricingRecommendationSchema,
    },
  },
});
```

If the current `openai` package does not support `responses.create`, either:

1. Upgrade the `openai` npm package, or
2. Start with `chat.completions.create` and backend JSON schema validation.

### 5.2 Function/tool calling option

For a more agent-like flow, use tools:

- `get_sku_metrics`
- `get_guardrails`
- `get_recent_price_tests`
- `propose_price_test`

Important rule:

> AI can call `propose_price_test`, but cannot call `create_test` or `apply_price`.

Actions requiring writes must go through a backend approval flow.

### 5.3 Cost control

AI should not be called per visitor.

Call AI only for:

- Nightly recommendations
- Merchant-triggered “generate plan”
- End-of-test next-round analysis
- Assistant Q&A

Do not call AI during storefront assignment or checkout.

Suggested caching:

- Cache recommendation output per shop for 12–24 hours.
- Recompute only if new order data, guardrails, or product prices changed.
- Store prompt hash, response ID, model, token usage, and schema version.

## 6. Algorithm plan

### 6.1 MVP algorithm: rules + AI explanation

Phase 1 should not start with complex ML. Use:

- Opportunity scoring
- Price band rules
- Guardrail validation
- AI ranking and explanation

This is easiest to ship, explain, and trust.

### 6.2 Phase 2: Bayesian learning

After tests run, store per-SKU learning:

```text
price_arm → visitors, conversions, orders, revenue, profit
```

Estimate:

- Probability each arm is best
- Expected profit lift
- Expected loss if wrong
- Credible interval

Decision rule example:

```text
Recommend winner if:
  P(arm profit_per_visitor > control) >= 90%
  AND expected_loss <= configured threshold
  AND guardrails are healthy
```

### 6.3 Phase 3: Thompson sampling / bandit mode

Use bandits only after enough data.

For each price arm:

```text
sample expected_profit_per_visitor from posterior
serve arm with highest sample
```

Safety rules:

- Fixed exploration period first.
- Minimum sample before dynamic allocation.
- Never allocate 100% until decision criteria are met.
- Keep control holdout.
- Auto-pause arms breaching guardrails.

### 6.4 Phase 4: contextual pricing

Later, add segments:

- Country / market
- New vs returning visitor
- Traffic source
- Device type
- Customer tags
- Inventory state

Do not start here. Segment-level pricing needs more data and stronger legal/compliance review.

## 7. User experience

### 7.1 New primary entry point

Add a main navigation item:

```text
Smart Pricing
```

Default screen:

- Top opportunities
- AI recommended tests
- Expected learning
- Risk level
- “Review plan” button

### 7.2 Review plan flow

Merchant sees:

- Product
- Current price
- Candidate price arms
- Goal: profit per visitor
- Expected learning
- Guardrails
- Estimated duration / sample size
- Checkout readiness status

Actions:

- Approve and launch
- Edit as manual test
- Dismiss
- Ask AI why

### 7.3 End-of-test flow

At completion:

- Show winner
- Show profit per visitor lift
- Show confidence / expected loss
- Show next recommended action

Actions:

- Apply winning price
- Run next AI test around winner
- Keep current price
- Export result

## 8. API and service design

### 8.1 Backend services

```text
backend/src/services/smartPricing/
  smartPricingDataSyncService.js
  smartPricingMetricsService.js
  smartPricingOpportunityService.js
  smartPricingBandService.js
  smartPricingAiService.js
  smartPricingGuardrailService.js
  smartPricingExperimentService.js
  smartPricingLearningService.js
  smartPricingAuditService.js
```

### 8.2 Routes

```text
GET  /api/smart-pricing/opportunities
POST /api/smart-pricing/recommendations/generate
GET  /api/smart-pricing/recommendations
POST /api/smart-pricing/recommendations/:id/approve
POST /api/smart-pricing/recommendations/:id/create-test
POST /api/smart-pricing/tests/:id/next-round
POST /api/smart-pricing/tests/:id/apply-winner
GET  /api/smart-pricing/audit
```

### 8.3 Jobs

```text
smartPricingOrderBackfillJob
smartPricingDailyMetricsJob
smartPricingRecommendationJob
smartPricingGuardrailMonitorJob
smartPricingNextRoundJob
```

## 9. Guardrails

Guardrails should be deterministic and enforced before AI output is accepted.

Required v1 guardrails:

- Minimum margin percent
- Maximum price decrease
- Maximum price increase
- Maximum active AI-managed tests
- Minimum visitors before winner decision
- Minimum runtime days
- Auto-pause on severe conversion drop
- Auto-pause on profit per visitor collapse
- No AI tests during blackout windows
- No automatic catalog write without approval

Advanced guardrails:

- Inventory-aware constraints
- MAP / brand price floor
- Category-specific limits
- Country-specific rules
- Budget-at-risk limits
- Customer fairness review for personalized pricing

## 10. Audit and compliance

Every recommendation must be logged.

Audit record should include:

- Shop domain
- Actor
- Source: AI / rules / user
- Model name
- Prompt schema version
- Input metric snapshot
- AI output
- Guardrail decisions
- Final action
- Approval user
- Shopify write result, if any

Use append-only semantics for pricing decisions. Do not overwrite the original recommendation; create a new event for every change.

## 11. Privacy and security

Send only compact business metrics to AI:

- Product title
- Product ID / variant ID
- Sales aggregates
- Margin aggregates
- Candidate prices
- Guardrails

Do not send:

- Customer emails
- Customer names
- Addresses
- Full order payloads
- Payment data
- Raw event logs

Redact product titles if a merchant requires strict privacy mode.

## 12. Rollout plan

### Phase 0: Research-to-build foundation (2–3 weeks)

Build:

- DB migrations for SKU metrics and recommendations
- Shopify order backfill for 60 days
- Daily aggregation job
- Read-only opportunities endpoint
- Smart Pricing dashboard skeleton

Outcome:

> Merchant can see “Top products to optimize.”

### Phase 1: AI recommendation MVP (4–6 weeks)

Build:

- Candidate price band generator
- OpenAI structured recommendation service
- Guardrail validation
- Recommendation review UI
- One-click create RipX price test
- AI reasoning summary

Outcome:

> Merchant can approve an AI-recommended price test.

### Phase 2: Learning loop (6–10 weeks)

Build:

- Test result ingestion into SKU learning model
- Next-round recommendations
- Bayesian profit readout
- Price Copilot Q&A
- Audit views

Outcome:

> AI can recommend the next test after a winner.

### Phase 3: Controlled automation (10–16 weeks)

Build:

- Auto-generate next-round test with approval
- Optional bandit allocation
- Approval-gated winner apply
- Portfolio-level Smart Pricing view
- Kill switch and budget-at-risk monitor

Outcome:

> Merchant can run continuous smart pricing safely.

## 13. MVP success criteria

MVP is successful if:

- Time to first AI price test is under 5 minutes.
- At least 70% of new price tests start from Smart Pricing.
- Pilot stores can launch tests without manual variant setup.
- Recommendations pass guardrails 95%+ of the time.
- AI output is always parseable and schema-valid.
- No catalog price is changed without approval.
- Pilot tests show measurable profit per visitor learning.

## 14. Main risks and mitigations

| Risk                                     | Mitigation                                                      |
| ---------------------------------------- | --------------------------------------------------------------- |
| AI recommends unsafe price               | Deterministic guardrail layer blocks it                         |
| AI hallucination                         | Strict JSON schema + candidate-only validation                  |
| Too little data                          | Show low-confidence state; use wider priors or do not recommend |
| Price changes hurt brand trust           | Limit magnitude and cadence; approval required                  |
| Shopify order history limited            | Start with 60 days; request `read_all_orders` later             |
| AI cost grows                            | Cache recommendations; nightly batch; no per-visitor AI         |
| Legal concerns with personalized pricing | Start SKU-level, not customer-level                             |
| Checkout mismatch                        | Reuse RipX checkout diagnostics before launch                   |

## 15. Recommended final product positioning

Suggested name:

> ELX Smart Pricing

Suggested tagline:

> AI-guided price optimization for Shopify, powered by controlled experiments.

Short client-facing explanation:

> The system analyzes store data, recommends high-value price tests, runs them safely through RipX, learns from real customer behavior, and guides merchants toward the most profitable price over multiple test rounds.

## 16. Final recommendation

Proceed with **AI-Guided Smart Pricing** using a hybrid model:

- Deterministic backend for pricing math and guardrails.
- OpenAI API for structured recommendations and merchant-facing reasoning.
- RipX test engine for execution.
- Profit per visitor as the primary metric.
- Human approval for all catalog-changing actions in v1.
- Continuous optimization through sequential test rounds, then optional bandits later.

This creates a strong product wedge:

> RipX becomes not just an A/B testing tool, but an AI-guided profit optimization system for Shopify merchants.
