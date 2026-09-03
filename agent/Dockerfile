FROM node:22-slim
WORKDIR /app
COPY agent/package*.json agent/
RUN cd agent && npm ci --omit=dev
COPY agent ./agent
WORKDIR /app/agent
CMD ["node", "src/main.js", "start"]
