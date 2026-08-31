# Static site deployment for Railway.
#
# Serves the single static HTML file with busybox httpd. The Python FastAPI
# backend requires DATABASE_URL and JWT_SECRET, which aren't configured for
# this environment, so the app crashed on boot looking for a database. This
# reverts to a minimal static deploy to stop the crash loop.
FROM busybox:stable

WORKDIR /www
COPY apex-design.html /www/index.html

EXPOSE 8080

CMD ["busybox", "httpd", "-f", "-v", "-p", "8080", "-h", "/www"]
