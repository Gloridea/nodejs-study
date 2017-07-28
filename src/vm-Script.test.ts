import * as vm from 'vm';
import {fork} from 'child_process';
import {join} from 'path';
import {EventEmitter} from 'events';
import {sleep} from './utils/sleep';

describe('vm', () => {
    let buffer: Buffer;

    beforeEach(() => {
        buffer = codeToBuffer('count++;');
    });

    it('returns buffer', () => {
        // Given
        const sandbox = {count: 0};
        const context = vm.createContext(sandbox);

        // When
        const bufScript = new vm.Script("12345678", {cachedData: buffer});
        bufScript.runInContext(context);

        // Then
        expect(sandbox.count).toBe(1);
    });

    it('does not use cache if script length is not same', () => {
        // Given
        const sandbox = {count: 0};
        const bufScript = new vm.Script("count += 10", {cachedData: buffer});

        // When
        const context = vm.createContext(sandbox);
        bufScript.runInContext(context);

        // Then
        expect(sandbox.count).toBe(10);
    });

    it('compares pure execution performance', () => {
        const expected = {count: 39999800000, strlen: 2253754};
        let count = 0;
        let str = '';

        function fn() {
            let innercnt = 0;
            let innerstr = '';
            for (let i = 0; i < 200000; i++) {
                innercnt = innercnt + i * 2;
                innerstr += innercnt + ",";
            }
            count = innercnt;
            str = innerstr;
        }

        const code = `
            ${fn.toString()}
            fn();
        `;

        const script1 = new vm.Script(code);
        const sandbox1 = {count: 0, str: ''};
        const context1 = vm.createContext(sandbox1);

        const scriptBuf = codeToBuffer(code);
        const script2 = new vm.Script(code, {cachedData: scriptBuf});
        const sandbox2 = {count: 0, str: ''};
        const context2 = vm.createContext(sandbox2);

        console.time('normal execution');
        fn();
        console.timeEnd('normal execution');
        expect({count, strlen: str.length}).toEqual(expected);

        count = 0;
        str = '';
        console.time('eval execution');
        eval(code);
        console.timeEnd('eval execution');
        expect({count, strlen: str.length}).toEqual(expected);

        console.time('vm execution');
        script1.runInContext(context1);
        // script1.runInThisContext();
        console.timeEnd('vm execution');
        // console.log('count=%d, strlen=%d', count, str.length);
        expect({count: sandbox1.count, strlen: sandbox1.str.length}).toEqual(expected);

        console.time('vm-buffer execution');
        script2.runInContext(context2);
        console.timeEnd('vm-buffer execution');
        expect({count: sandbox2.count, strlen: sandbox2.str.length}).toEqual(expected);
    });

    it('compares inter-vm access cost', async function () {
        const LOOP_COUNT = 20000;
        // ipc
        let count = 0;
        const cp = fork(join(__dirname, 'vm-Script-childprocess.js'));
        function ipcCallback(resolve: Function): void {
            cp.on('message', (pong) => {
                if (pong <= LOOP_COUNT) {
                    count = pong;
                    cp.send(count);
                } else {
                    resolve();
                }
            });
        }

        // vm
        let ee = new EventEmitter();

        function vmCallback(resolve: Function): void {
            ee.on('pong', pong => {
                if (pong <= LOOP_COUNT) {
                    count = pong;
                    // in case of direct emit, maximum call stack is exceeded
                    process.nextTick(() => ee.emit('ping', count));
                } else {
                    resolve();
                }
            });
        }

        const code = `
            ee.on('ping', count => ee.emit('pong', count + 1));
        `;
        const buffer = codeToBuffer(code);
        const script = new vm.Script(code, {cachedData: buffer});
        const sandbox = {ee};
        const context = vm.createContext(sandbox);
        script.runInContext(context);

        await sleep(300); // wait until warmup child process

        // run tests - ipc
        console.time('ipc communication');
        const p1 = new Promise(ipcCallback);
        cp.send(count);
        await p1;
        console.timeEnd('ipc communication');
        expect(count).toBe(LOOP_COUNT);
        cp.kill();

        // run tests - vm
        count = 0;
        console.time('inter-vm communication');
        const p2 = new Promise(vmCallback);
        ee.emit('ping', count);
        await p2;
        console.timeEnd('inter-vm communication');
        expect(count).toBe(LOOP_COUNT);
    });
});

function codeToBuffer(code: string): Buffer {
    const script = new vm.Script(code, {
        produceCachedData: true
    });
    return Buffer.from((script as any).cachedData as Buffer);
}