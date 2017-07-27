import * as vm from 'vm';
import {Script} from 'vm';

describe('vm', () => {
    let script: Script;
    let buffer: Buffer;

    beforeEach(() => {
        script = new vm.Script('count++;', {
            produceCachedData: true
        });
        buffer = Buffer.from((script as any).cachedData as Buffer);
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

});