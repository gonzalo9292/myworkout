FROM node:20-alpine

WORKDIR /app

# Instala deps
COPY package*.json ./
RUN npm ci

# Copia el código
COPY . .

# Puerto del Core API
EXPOSE 3000

# Desarrollo (ts-node). Si prefieres producción luego lo cambiamos.
CMD ["npm", "run", "dev"]
