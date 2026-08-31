FROM busybox:stable

WORKDIR /www

# Serve apex-design.html as the site's index page.
COPY apex-design.html /www/index.html

EXPOSE 8080

CMD ["busybox", "httpd", "-f", "-v", "-p", "8080", "-h", "/www"]
