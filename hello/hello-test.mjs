import { instantiate } from "./target/js-jco/hello.js"

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
let _fs;
async function fetchCompile(url) {
    let self = import.meta.url.substring("file://".length);
    if (self.indexOf(":") === 2) {
        self = self.substring(1);
    }
    const u2 = self.substring(0, self.lastIndexOf("/"))+"/target/js-jco/"+url;
    if (isNode) {
        _fs = _fs || await import('fs/promises');
        return WebAssembly.compile(await _fs.readFile(u2));
    }
    return fetch(u2).then(WebAssembly.compileStreaming);
}

const expectdMessage="Welcome in Prague, we invite you for a drink!";
let actualMessage;
const imports = {
    'hello:city/city': {
        sendMessage: (message) => {
            actualMessage = message;
            console.log(message);
        }
    }
}
const component = await instantiate(fetchCompile, imports, WebAssembly.instantiate);
const exports = component['greeter'];
exports.run({
    name: "Prague",
    headCount: 1000000,
    budget: BigInt(200000000)
});

if (actualMessage !== expectdMessage) {
    throw new Error(`sendMessage: expected "${expectdMessage}" actual "${actualMessage}"`);
}