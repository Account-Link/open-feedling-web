FROM denoland/deno:alpine

WORKDIR /app
COPY deno.json ./
COPY server/ ./server/

RUN deno cache server/main.ts

ENV DATA_DIR=/data
ENV PORT=3000
EXPOSE 3000
VOLUME ["/data"]

CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "server/main.ts"]
