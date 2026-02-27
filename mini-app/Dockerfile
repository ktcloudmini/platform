FROM node:18-alpine

WORKDIR /usr/src/app

RUN npm install express prom-client

COPY app.js .

EXPOSE 8080

CMD ["node", "app.js"]