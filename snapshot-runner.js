const {join} = require('path');
const fs = require('fs');
const vm = require('vm');
const {app, BrowserWindow} = require('electron');

const code = fs.readFileSync(join(__dirname, 'main-code.js'));
const buffer = fs.readFileSync(join(__dirname, 'code.buffer'));
const script = new vm.Script(toDummyCode(code), {cachedData: buffer});
console.log('script.cachedDataRejected', script.cachedDataRejected);

function openBrowser() {
    return new Promise(resolve => {
        app.on('ready', () => {
            var win = new BrowserWindow();
            win.loadURL('https://m.naver.com');
            resolve(win);
        });
    });
}

const electron = {
    get app() {
        return app;
    },

    get BrowserWindow() {
        return BrowserWindow;
    }
};

function toDummyCode(code, replacer = ' ') {
    const buffer = Buffer.alloc(code.length, replacer);
    return buffer.toString();
}

const context = vm.createContext({require, console, __dirname, openBrowser, electron});
script.runInContext(context); // Test runInThisContext