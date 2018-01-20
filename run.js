const vm = require('vm');
const fs = require('fs');
const {join} = require('path');
const cp = require('child_process');

const runnerPath = join(__dirname, 'snapshot-runner.js');

const code = fs.readFileSync(join(__dirname, 'main-code.js'), 'utf8');

console.log('code.length', code.length);
const script = new vm.Script(code, {produceCachedData: true});
fs.writeFileSync(join(__dirname, 'code.buffer'), script.cachedData);
console.log('code.buffer has been writtn');

const electronPath = join(__dirname, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const output = cp.execFileSync(electronPath, [runnerPath]);
console.log('output', output.toString());
