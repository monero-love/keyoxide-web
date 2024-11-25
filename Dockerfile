FROM node:20-alpine AS builder

WORKDIR /app
COPY . .

RUN npm ci
RUN npm run build:server
RUN npm run build:static

###

FROM node:20-alpine

ARG CI_COMMIT_SHA
ARG CI_COMMIT_BRANCH

ENV COMMIT_SHA=$CI_COMMIT_SHA
ENV COMMIT_BRANCH=$CI_COMMIT_BRANCH

WORKDIR /app
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/content /app/content
COPY --from=builder /app/views /app/views
COPY --from=builder /app/static /app/static

EXPOSE 3000

CMD ["node", "./dist/"]
