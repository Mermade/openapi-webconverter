FROM node:lts-alpine

RUN mkdir /app
ADD . /app

WORKDIR /app

RUN npm install

EXPOSE 3001

CMD [ "npm", "run", "start" ]
