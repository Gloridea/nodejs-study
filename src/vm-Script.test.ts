import * as vm from 'vm';
import {ChildProcess, fork, spawn} from 'child_process';
import {join} from 'path';
import {EventEmitter} from 'events';
import {sleep} from './utils/sleep';
import * as ipc from 'node-ipc';
import * as assert from 'assert';
import {cp, rm} from 'shelljs';

ipc.config.silent = true;

describe('vm', () => {
    let buffer: Buffer;

    beforeEach(() => {
        buffer = codeToBuffer('count++;');
    });

    it('creates cached code buffer', () => {
        // Given
        const sandbox = {count: 0};
        const context = vm.createContext(sandbox);

        // When
        const bufScript = new vm.Script(toDummyCode('count++;'), {cachedData: buffer});
        bufScript.runInContext(context);

        // Then
        expect(sandbox.count).toBe(1);
    });

    it('uses cachedData if code length is the same even if code contents is not equal', () => {
        // Given
        const buffer = codeToBuffer('countA++;');
        const sandbox = {countA: 0};
        const context = vm.createContext(sandbox);

        // When
        const bufScript = new vm.Script('countA--;', {cachedData: buffer});
        bufScript.runInContext(context);

        // Then
        expect(sandbox.countA).toBe(1);
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

    it(`doesn't use cachedData if same script had been created from the same source before`, () => {
        // Given
        const buffer = codeToBuffer('countB++;');
        const sandbox = {countB: 0};
        const context = vm.createContext(sandbox);
        codeToBuffer('countB--;');

        // When
        const bufScript = new vm.Script("countB--;", {cachedData: buffer});
        bufScript.runInContext(context);

        // Then
        expect(sandbox.countB).toBe(-1);
    });

    /**
     * in NodeJS 8.2.1
     * ---------------
     * - normal execution: 94.038ms
     * - eval execution: 73.604ms
     * - vm execution: 96.497ms
     * - vm-buffer execution: 87.508ms
     */
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

    /**
     * in NodeJS 8.2.1
     * ---------------
     * - ipc communication: 795.485ms
     * - inter-vm communication: 18.288ms
     * - node-ipc communication: 1714.186ms
     */
    it('compares inter-vm access cost', async function () {
        let cp: ChildProcess | null = null;
        let nicp: ChildProcess | null = null;

        try {
            const LOOP_COUNT = 20000;
            // ipc
            let count = 0;
            cp = fork(join(__dirname, 'vm-Script-childprocess.js'));
            const ipcCallback = function ipcCallback(cp: ChildProcess, resolve: Function): void {
                cp.on('message', (pong) => {
                    if (pong <= LOOP_COUNT) {
                        count = pong;
                        cp.send(count);
                    } else {
                        resolve();
                    }
                });
            }.bind(null, cp);

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

            // node-ipc
            nicp = spawn('node', [join(__dirname, 'vm-Script-childprocess-node-ipc.js')]);
            await new Promise(resolve => ipc.connectTo('world', resolve));

            function nodeIpcCallback(resolve: Function): void {
                ipc.of.world.on('pong', (pong: number) => {
                    if (pong <= LOOP_COUNT) {
                        count = pong;
                        ipc.of.world.emit('ping', count);
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

            // run tests - vm
            count = 0;
            console.time('inter-vm communication');
            const p2 = new Promise(vmCallback);
            ee.emit('ping', count);
            await p2;
            console.timeEnd('inter-vm communication');
            expect(count).toBe(LOOP_COUNT);

            // run tests - node-ipc
            count = 0;
            console.time('node-ipc communication');
            const p3 = new Promise(nodeIpcCallback);
            ipc.of.world.emit('ping', count);
            await p3;
            console.timeEnd('node-ipc communication');
            expect(count).toBe(LOOP_COUNT);
        } finally {
            cp && cp.kill('SIGTERM');
            ipc.disconnect('world');
            nicp && nicp.kill('SIGTERM');
        }
    });

    it('shares all global variables in current context', () => {
        // Given
        const code = `process.env.TEST = 'TEST';`;
        const buffer = codeToBuffer(code);
        const script = new vm.Script(code, {cachedData: buffer});

        // When
        script.runInThisContext();

        // Then
        expect(process.env.TEST).toBe('TEST');
    });

    /**
     * in NodeJS 8.2.1
     * ---------------
     * - runInContext: 145.475ms
     * - runInThisContext: 20.952ms
     */
    it('compares performance runInNewContext vs runInThisContext', () => {
        const code = `
        for (let i = 0; i < 1000000; i++) {
            global.count += i * 2;
        }
        `;
        buffer = codeToBuffer(code);
        const script = new vm.Script(code, {cachedData: buffer});
        const sandbox = {global: {count: 0}, console};
        const context = vm.createContext(sandbox);

        console.time('runInContext');
        script.runInContext(context);
        console.timeEnd('runInContext');

        (global as any).count = 0;
        console.time('runInThisContext');
        script.runInThisContext();
        console.timeEnd('runInThisContext');
        delete (global as any).count;
    });

    it(`doesn't include dependency files`, () => {
        // Given
        let isErrorThrown = false;
        cp(join(__dirname, 'vm-Script-dependency.js'), join(__dirname, 'vm-Script-dependency-copy.js'));
        const code = `
            let dep = require('./vm-Script-dependency-copy');
            dep.increment();
        `;
        const buffer = codeToBuffer(code);
        const script = new vm.Script(code, {cachedData: buffer});
        const context = vm.createContext({require});
        rm(join(__dirname, 'vm-Script-dependency-copy.js'));

        // When
        try {
            script.runInNewContext(context);
        } catch (e) {
            isErrorThrown = true;
        }

        // Then
        expect(isErrorThrown).toBe(true);
    });

    it.skip('TODO: should inspect cpu features of snapshot');
});

function codeToBuffer(code: string): Buffer {
    const script = new vm.Script(code, {
        produceCachedData: true
    });
    return Buffer.from((script as any).cachedData as Buffer);
}

function toDummyCode(code: string, replacer = ' '): string {
    const dummyCode = code.replace(/./g, replacer);
    console.log('Buffer.from(dummyCode).length', Buffer.from(dummyCode).length, dummyCode.length);
    assert.equal(Buffer.from(dummyCode).length, Buffer.from(code).length);
    console.log('  [%s](%d)\n=>[%s](%d)', code, code.length, dummyCode, dummyCode.length);
    return dummyCode;
}

function formatBuffer(buffer: Buffer): string {
    return buffer.toString('hex')
        .replace(/(.{56})/g, '$1\n')
        .replace(/(\w{2})/g, '$1 ');
}
formatBuffer; // NOTE: to prevent tslint warning