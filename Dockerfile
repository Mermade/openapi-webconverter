from node:12.16-stretch

RUN mkdir /app
ADD . /app

WORKDIR /app

RUN npm install

EXPOSE 3001

CMD node index.js
