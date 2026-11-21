FROM node:22-bookworm-slim AS build
WORKDIR /srv/docchat
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
ARG VITE_API_URL
RUN test -n "$VITE_API_URL" && VITE_API_URL="$VITE_API_URL" npm run build

FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /srv/docchat/dist/ /usr/share/nginx/html/
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD ["wget","-q","-O","/dev/null","http://127.0.0.1:8080/index.html"]
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
