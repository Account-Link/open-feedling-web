FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-fund --no-audit
COPY playwright.config.ts e2e.spec.ts ./

# Wait for server, then run the spec.
CMD ["sh", "-c", "until curl -sf http://localhost:3000/api/health >/dev/null; do echo 'waiting for server...'; sleep 1; done && npx playwright test"]
