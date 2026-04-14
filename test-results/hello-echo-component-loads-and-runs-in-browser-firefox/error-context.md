# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hello.spec.ts >> echo component loads and runs in browser
- Location: tests\browser\hello.spec.ts:5:1

# Error details

```
Error: Browser error: WebAssembly[PROMISING] is not a function
Stack: resolveCanonicalFunctionLift/<.binder<@http://localhost:3210/dist/index.js:7405:48
async*withDebugTrace/<@http://localhost:3210/dist/index.js:52:16
resolveComponentInstanceFromExports/<.binder<@http://localhost:3210/dist/index.js:7242:58
withDebugTrace/<@http://localhost:3210/dist/index.js:52:16
resolveComponentExport/<.binder<@http://localhost:3210/dist/index.js:7533:69
withDebugTrace/<@http://localhost:3210/dist/index.js:52:16
executePlan/<@http://localhost:3210/dist/index.js:1412:44
executePlan@http://localhost:3210/dist/index.js:1405:33
async*instantiate@http://localhost:3210/dist/index.js:7659:34
@http://localhost:3210/:15:46
UnderlyingSource.pull*toWasmResponse@http://localhost:3210/dist/index.js:3740:16
parseModule/whileReading<@http://localhost:3210/dist/index.js:3709:44
parseModule@http://localhost:3210/dist/index.js:3708:30
parseSection/sections<@http://localhost:3210/dist/index.js:3903:28
parseSection@http://localhost:3210/dist/index.js:3917:7
async*parseWIT@http://localhost:3210/dist/index.js:3860:36
async*parse@http://localhost:3210/dist/index.js:3842:28
async*createComponent@http://localhost:3210/dist/index.js:7575:23
@http://localhost:3210/:14:37

```