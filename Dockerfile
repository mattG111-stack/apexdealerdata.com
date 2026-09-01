# Frontend as its own service.
#
# Deploy this as a SECOND Railway service from the same repo, with Root
# Directory set to `frontend`. Set NEXT_PUBLIC_API_BASE to the backend's public
# URL — it is baked in at build time, so changing it later needs a rebuild.
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts || npm install

COPY . .

# Next inlines NEXT_PUBLIC_* at build time, so it must be present here and not
# only at runtime.
ARG NEXT_PUBLIC_API_BASE=""
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE

RUN npm run build

EXPOSE 3000
CMD npm run start -- --port ${PORT:-3000} --hostname 0.0.0.0
