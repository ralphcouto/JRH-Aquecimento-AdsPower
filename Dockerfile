FROM node:22-slim
ENV NODE_ENV=production WARMUP_DATA_DIR=/data TZ=America/Sao_Paulo
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY tools ./tools
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 4747
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:4747/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
