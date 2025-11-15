const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8081 });

let lastPosition = null;

wss.on('connection', ws => {
  console.log('A client connected!');
  if (lastPosition) ws.send(JSON.stringify({type:"pov-update", pos:lastPosition}));

  ws.on('message', msg => {
    console.log('Message from client:', msg);   // <--- THIS LINE!
    try {
      const js = JSON.parse(msg);
      if (js.type === "pov-update") {
        lastPosition = js.pos;
        wss.clients.forEach(cli => cli.send(JSON.stringify({type:"pov-update", pos:js.pos})));
      }
    } catch (e) {}
  });
});

console.log("WebSocket server listening on ws://0.0.0.0:8081");
