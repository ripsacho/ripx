# Deployment Guide

Complete guide for deploying the AB Testing Tool to production.

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Setup](#environment-setup)
3. [Database Setup](#database-setup)
4. [Deployment Options](#deployment-options)
5. [Post-Deployment](#post-deployment)
6. [Monitoring](#monitoring)
7. [Scaling](#scaling)

## Pre-Deployment Checklist

- [ ] All tests passing
- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] SSL certificates obtained
- [ ] Domain configured
- [ ] Shopify app configured with production URLs
- [ ] Webhooks configured
- [ ] Monitoring set up
- [ ] Backup strategy in place

## Environment Setup

### Production Environment Variables

Create `.env.production`:

```env
# Shopify App Configuration
SHOPIFY_API_KEY=your_production_api_key
SHOPIFY_API_SECRET=your_production_api_secret
SHOPIFY_SCOPES=read_products,write_products,read_orders,write_orders,read_themes,write_themes
APP_URL=https://your-app-domain.com
SHOPIFY_APP_URL=https://your-app-domain.com

# Database
DATABASE_URL=postgresql://user:password@db-host:5432/shopify_ab_testing

# Redis
REDIS_URL=redis://redis-host:6379

# Security
JWT_SECRET=your_very_secure_random_secret_here
NODE_ENV=production

# Analytics
ANALYTICS_ENABLED=true
MIN_SAMPLE_SIZE=100
CONFIDENCE_LEVEL=0.95

# Logging
LOG_LEVEL=info
```

### Generate Secure Secrets

```bash
# Generate JWT secret
openssl rand -base64 32

# Generate database password
openssl rand -base64 24
```

## Database Setup

### Option 1: Managed Database (Recommended)

#### Heroku Postgres

```bash
# Create database
heroku addons:create heroku-postgresql:standard-0

# Get connection string
heroku config:get DATABASE_URL
```

#### AWS RDS

1. Create RDS PostgreSQL instance
2. Configure security groups
3. Get connection string
4. Update DATABASE_URL

#### DigitalOcean Managed Database

1. Create database cluster
2. Configure firewall rules
3. Get connection string
4. Update DATABASE_URL

### Option 2: Self-Hosted Database

```bash
# On your server
sudo apt-get update
sudo apt-get install postgresql-14

# Create database
sudo -u postgres createdb shopify_ab_testing
sudo -u postgres createuser shopify_ab_user

# Set password
sudo -u postgres psql
ALTER USER shopify_ab_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE shopify_ab_testing TO shopify_ab_user;
```

### Run Migrations

```bash
# Set production DATABASE_URL
export DATABASE_URL=postgresql://...

# Run migrations
npm run migrate
```

## Deployment Options

### Option 1: Heroku (Easiest)

#### Setup

```bash
# Install Heroku CLI
brew install heroku/brew/heroku  # macOS
# Or download from https://devcenter.heroku.com/articles/heroku-cli

# Login
heroku login

# Create app
heroku create your-ab-testing-app

# Add PostgreSQL
heroku addons:create heroku-postgresql:standard-0

# Add Redis (optional)
heroku addons:create heroku-redis:mini

# Set environment variables
heroku config:set SHOPIFY_API_KEY=your_key
heroku config:set SHOPIFY_API_SECRET=your_secret
heroku config:set APP_URL=https://your-ab-testing-app.herokuapp.com
# ... set all other variables

# Deploy
git push heroku main

# Run migrations
heroku run npm run migrate
```

#### Procfile

Create `Procfile`:

```
web: node backend/src/app.js
```

### Option 2: AWS (EC2 + RDS)

#### Setup EC2 Instance

```bash
# Launch EC2 instance (Ubuntu 22.04)
# Security group: Allow ports 22, 80, 443, 3000

# SSH into instance
ssh -i your-key.pem ubuntu@your-ec2-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Clone repository
git clone your-repo-url
cd your-repo

# Install dependencies
npm install --production

# Set environment variables
nano .env
# Add all production variables

# Start with PM2
pm2 start backend/src/app.js --name ab-testing
pm2 save
pm2 startup
```

#### Setup Nginx Reverse Proxy

```bash
# Install Nginx
sudo apt-get install nginx

# Configure
sudo nano /etc/nginx/sites-available/ab-testing

# Add configuration:
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Enable site
sudo ln -s /etc/nginx/sites-available/ab-testing /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### Setup SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo certbot renew --dry-run
```

### Option 3: Docker Deployment

#### Build and Run

```bash
# Build image
docker build -t ab-testing-app .

# Run with docker-compose
docker-compose up -d

# Or run manually
docker run -d \
  --name ab-testing \
  -p 3000:3000 \
  --env-file .env.production \
  ab-testing-app
```

#### Docker Compose Production

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  backend:
    build: .
    ports:
      - '3000:3000'
    env_file:
      - .env.production
    depends_on:
      - postgres
      - redis
    restart: always

  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: shopify_ab_testing
      POSTGRES_USER: shopify_ab_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: always

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: always

volumes:
  postgres_data:
  redis_data:
```

```bash
# Start
docker-compose -f docker-compose.prod.yml up -d

# Run migrations
docker-compose -f docker-compose.prod.yml exec backend npm run migrate
```

### Option 4: DigitalOcean App Platform

1. **Create App:**
   - Go to DigitalOcean App Platform
   - Create new app
   - Connect GitHub repository

2. **Configure:**
   - Set build command: `npm install`
   - Set run command: `node backend/src/app.js`
   - Add environment variables
   - Add PostgreSQL database
   - Add Redis (optional)

3. **Deploy:**
   - Click "Deploy"
   - App will build and deploy automatically

## Post-Deployment

### 1. Update Shopify App URLs

1. Go to Shopify Partner Dashboard
2. Open your app
3. Update URLs:
   - App URL: `https://your-domain.com`
   - Allowed redirection URLs: `https://your-domain.com/auth/callback`

### 2. Configure Webhooks

1. In Shopify Partner Dashboard → Webhooks
2. Create webhooks:
   - **Order creation**: `https://your-domain.com/api/webhooks/orders/create`
   - **Product update**: `https://your-domain.com/api/webhooks/products/update`
   - **App uninstalled**: `https://your-domain.com/api/webhooks/app/uninstalled`

### 3. Test Deployment

```bash
# Health check
curl https://your-domain.com/health

# Should return:
# {"status":"ok","timestamp":"..."}
```

### 4. Run Database Migrations

```bash
# On server or via Heroku
npm run migrate

# Or via Docker
docker-compose exec backend npm run migrate
```

## Monitoring

### Application Monitoring

#### PM2 Monitoring

```bash
# Monitor with PM2
pm2 monit

# View logs
pm2 logs ab-testing

# Status
pm2 status
```

#### Health Checks

```bash
# Set up health check endpoint
# Already available at /health

# Monitor with uptime service
# Use services like:
# - UptimeRobot
# - Pingdom
# - StatusCake
```

### Database Monitoring

```bash
# Check database connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Monitor query performance
psql $DATABASE_URL -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
```

### Logging

#### Application Logs

- Use centralized logging service (Loggly, Papertrail, etc.)
- Or use file-based logging with log rotation

#### Error Tracking

- Set up Sentry or similar
- Configure error notifications

## Scaling

### Horizontal Scaling

#### Load Balancer Setup

1. Set up load balancer (AWS ALB, DigitalOcean LB, etc.)
2. Configure health checks
3. Add multiple backend instances
4. Use sticky sessions if needed

#### Database Scaling

1. Set up read replicas
2. Use connection pooling
3. Implement caching layer

### Performance Optimization

1. **Enable Redis Caching:**

   ```javascript
   // Cache test configurations
   // Cache analytics results
   ```

2. **CDN for Static Assets:**
   - Use CloudFlare or similar
   - Serve static files from CDN

3. **Database Optimization:**
   - Add indexes for frequently queried columns
   - Use database connection pooling
   - Implement query caching

## Backup Strategy

### Database Backups

#### Automated Backups

```bash
# Set up daily backups
# Heroku: Automatic with Postgres addon
# AWS RDS: Enable automated backups
# Self-hosted: Use pg_dump cron job
```

#### Manual Backup

```bash
# Backup database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Restore
psql $DATABASE_URL < backup_20240101.sql
```

### Application Backups

- Use version control (Git)
- Tag releases
- Keep deployment history

## Security Checklist

- [ ] HTTPS enabled (SSL certificate)
- [ ] Environment variables secured
- [ ] Database credentials rotated
- [ ] API keys secured
- [ ] Rate limiting enabled
- [ ] CORS configured correctly
- [ ] Input validation enabled
- [ ] SQL injection protection
- [ ] XSS protection
- [ ] Regular security updates

## Troubleshooting

### Common Issues

#### Application Won't Start

```bash
# Check logs
pm2 logs
# or
docker logs ab-testing

# Check environment variables
env | grep SHOPIFY

# Check database connection
psql $DATABASE_URL -c "SELECT 1;"
```

#### Database Connection Errors

```bash
# Verify database is running
pg_isready -h db-host

# Check connection string
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT version();"
```

#### High Memory Usage

```bash
# Monitor memory
pm2 monit

# Restart if needed
pm2 restart ab-testing

# Or scale horizontally
```

## Support

For deployment issues:

1. Check application logs
2. Verify environment variables
3. Test database connectivity
4. Review monitoring dashboards
5. Check Shopify app configuration

---

**Congratulations!** Your AB testing tool is now deployed to production! 🚀
