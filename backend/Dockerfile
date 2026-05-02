FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Install tsx globally for dev or use the local one via npm scripts
RUN npm install -g tsx typescript

EXPOSE 8000

CMD ["npm", "run", "dev"]
