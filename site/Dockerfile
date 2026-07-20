# Static public site for evra-ai.com — no build step, just nginx serving files.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html privacy.html terms.html styles.css /usr/share/nginx/html/

RUN printf 'User-agent: *\nAllow: /\n' > /usr/share/nginx/html/robots.txt

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --retries=3 --start-period=5s \
  CMD wget -q --spider http://localhost/ || exit 1
