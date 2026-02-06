const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080/client-stream');

ws.on('open', function open() {
    console.log('connected');
    ws.send(JSON.stringify({ type: 'setup', settings: {} }));
});

ws.on('message', function message(data) {
    console.log('received: %s', data);
    ws.close();
});

ws.on('error', console.error);
