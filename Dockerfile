FROM node:20.18.0-slim

WORKDIR /usr/src/app/omg-payment-microservice

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 5050

CMD ["npm", "run", "start"]