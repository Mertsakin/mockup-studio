# The capture service (server.mjs). Build from this folder:
#   docker build -t mockup-capture services/capture
# The base image carries Chromium and its system libraries for this Playwright version; keep the two versions equal.
FROM mcr.microsoft.com/playwright:v1.64.0-noble
WORKDIR /app
ENV NODE_ENV=production PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY *.mjs ./
# the image's unprivileged user (Chromium's sandbox works without root)
USER pwuser
EXPOSE 8080
CMD ["node", "server.mjs"]
