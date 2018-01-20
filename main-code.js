const fs = require('fs');
const {join} = require('path');
//const {app, BrowserWindow} = electron;
const isRunning = require('is-running');

const text = fs.readFileSync(join(__dirname, 'code.txt'), 'utf8');
console.log('text', text);
console.log('isRunning(99)', isRunning(99));

openBrowser();