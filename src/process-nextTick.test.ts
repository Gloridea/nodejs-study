describe('process.nextTick()', () => {
    it('compares each async call methods', async () => {
        // Given
        const log: string[] = [];

        // setTimeout 0
        function setTimeoutCaller() {
            log.push('1-setTimeout');
            setTimeout(() => {
                log.push('2-setTimeout');
            }, 0);
        }

        // process.nextTick
        function nextTickCaller() {
            log.push('1-nextTick');
            process.nextTick(() => {
                log.push('2-nextTick');
            });
        }

        // setImmediate
        function immediateCaller() {
            log.push('1-immediate');
            setImmediate(() => {
                log.push('2-immediate');
            });
        }

        // When
        setTimeout(immediateCaller, 100);
        setTimeout(setTimeoutCaller, 100);
        setTimeout(nextTickCaller, 100);
        await sleep(200);

        // Then
        expect(log.slice(0, 4)).toEqual([
            '1-immediate', '1-setTimeout', '1-nextTick',
            '2-nextTick'
            //, '2-setTimeout', '2-immediate' // it comes in random order
        ]);
    });

    async function sleep(time: number): Promise<void> {
        return new Promise<void>(resolve => {
            setTimeout(resolve, time);
        });
    }
});