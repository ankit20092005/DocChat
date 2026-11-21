FROM node:22-bookworm-slim AS dependencies
WORKDIR /srv/docchat
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=5000
WORKDIR /srv/docchat
COPY --from=dependencies /srv/docchat/node_modules ./node_modules
COPY package.json ./
COPY src ./src
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD ["node","-e","fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "src/index.js"]
