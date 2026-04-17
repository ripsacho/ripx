# Dockerfile for AB Testing App Backend
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# (--omit=dev replaces deprecated --only=production)
RUN npm ci --omit=dev

# Copy application code
COPY backend/ ./backend/

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http=require('http');let done=false;const finish=(code)=>{if(done)return;done=true;clearTimeout(failTimer);process.exit(code);};const failTimer=setTimeout(()=>finish(1),2800);const req=http.get('http://localhost:3000/health',(res)=>{res.resume();finish(res.statusCode===200?0:1);});req.on('error',()=>finish(1));req.setTimeout(2500,()=>{req.destroy();finish(1);});"

# Start application
CMD ["node", "backend/src/app.js"]

