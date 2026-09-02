FROM node:22-alpine

RUN apk add --no-cache docker-cli git

WORKDIR /app
COPY package.json server.mjs github-clone-auth.mjs ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.mjs"]
