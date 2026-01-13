FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 4200

# Para que se vea desde fuera del contenedor
CMD ["npm", "start", "--", "--host", "0.0.0.0", "--port", "4200"]
