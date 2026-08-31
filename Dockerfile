FROM busybox:stable

WORKDIR /www

# Serve apex-design.html as the site's index page.
COPY apex-design.html /www/index.html

EXPOSE 3000

CMD ["busybox", "httpd", "-f", "-v", "-p", "3000", "-h", "/www"]
