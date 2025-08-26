FROM apify/actor-node-playwright:20
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . ./
CMD ["node", "main.js"]
