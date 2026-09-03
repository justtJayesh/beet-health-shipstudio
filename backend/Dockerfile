FROM node:22-slim
WORKDIR /app
COPY backend/package*.json backend/
RUN cd backend && npm ci --omit=dev
COPY foods.json ./foods.json
COPY backend ./backend
WORKDIR /app/backend
EXPOSE 3001
CMD ["node", "src/server.js"]
