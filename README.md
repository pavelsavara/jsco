# jsco - Browser polyfill for running WASM components

## Usage
```js
import { instantiateComponent } from '@pavelsavara/jsco';
const instance = await instantiateComponent('./hello/wasm/hello.wasm', {
    'hello:city/city': { sendMessage: console.log }
});
const run = instance.exports['hello:city/greeter'].run;
run({ name: 'Kladno', headCount: 100000, budget: 0n});
// prints 'Welcome to Kladno!' to the console
```

See [./usage.mjs](./usage.mjs) for commented sample

## Goals
- [ ] create browser polyfill for running WASM components, see [TODO.md](./TODO.md)
- [x] streaming parser of binary WIT
- [x] streaming compilation of WASM module during .wasm file download
- [x] in-the-browser creation of instances and necessary JavaScript interop
- [x] small download size, fast enough (current prototype is 35 KB)

## How
- parser: read binary WIT to produce model of the component, it's sub components, modules and types
- compile modules via Browser API [`WebAssembly.compileStreaming`](https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/compileStreaming)
- resolver: resolve dependencies, create instances, bind it together.
- JS binding: for component's imports and exports
- just JS (no rust dependency), TypeScript, RollupJS

## Scope
- hello world demo [wit](hello/wit/hello.wit) [wat](hello/wat/hello.wat)
- this is just small attempt in limited time. It may grow into something larger ...
- binding for `string` and `i32`, `record`. Only necessary resolver.

## Why
- as a hackathon week project: https://hackbox.microsoft.com/hackathons/hackathon2023/project/32678
- to learn more about WASM component model
- to provide host which could do the binding in the browser
- JCO is great, really. But it is too large to use in the browser as dynamic host. (Download size matters to browser folks)
- because independent implementation will help the WASM/WIT/WASI to make progress
- browsers currently don't implement built-in WASM component model host

## Contribute
- install [rust](https://www.rust-lang.org/tools/install)
- install [nodejs + npm](https://nodejs.org/en/download)
- `npm install`
- `npm run setup:rust`
- `npm run build`
- `npm run build:hello && npm run build:hello-wat && npm run build:hello-js`
- `npm run test:jco`
- `npm run test:win` or `npm run test:unix`
- see "scripts" in package.json
- use eslint plugin to VS code, with format on save