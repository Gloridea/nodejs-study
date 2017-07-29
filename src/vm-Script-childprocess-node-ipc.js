const ipc = require('node-ipc');

ipc.config.id = 'world';
ipc.config.silent = true;
ipc.serve(() => {
    ipc.server.on('ping', (count, socket) => {
        ipc.server.emit(socket, 'pong', count + 1);
    })
});
ipc.server.start();