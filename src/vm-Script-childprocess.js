process.on('message', (count) => {
    process.send(count + 1);
});