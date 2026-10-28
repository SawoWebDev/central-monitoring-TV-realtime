# Frontend image, in two stages:
#   1. "build": use Node to turn the React code into plain HTML/CSS/JS files (npm run build -> dist/)
#   2. final:   a small Nginx web server that serves those files and forwards /api to the backend
# Only stage 2 ends up in the image, so Node and the source code are not shipped.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
