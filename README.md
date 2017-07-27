NodeJS Study
============

## Run study cases
```
npm install
npm run test:watch
```

## Study Notes

### `timer_unref.ts`
- If timer has unref'd, node execution is not waiting until timer callback is called.

### `process_nextTick.test.ts`
- Shows how `process.nextTick()` works

### `vm-Script.test.ts`
- vm module can make binary buffer of script and use it as cache.
