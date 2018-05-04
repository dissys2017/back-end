# Backend for Chats Project
This repository provides the backend engine for the chat application. The protocol is based on `socket.io` and `websockets`. The server exposes its service on port 5555. This backend server requires the `Chats DB` database server to be up and running before starting this backend server.

## Run without Docker

1. Install dependencies with:
```
npm install
```

2. Run the server with
```
npm start
```

## Run with Docker

1. Build Docker image with:
```
sudo docker build -t ds/node .
```

2. Run Docker image with:
```
sudo docker run -p 5555:5555 --rm --link chats-db:chats-db ds/node
```
Do not forget to first run the chats-db docker container.
