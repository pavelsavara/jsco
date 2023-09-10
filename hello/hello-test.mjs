import { instantiate } from "./target/js-jco/hello.js"

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
let _fs;
async function fetchCompile(url) {
    // C:\Dev\jsco\hello\target\js-jco\hello.js
    const self = import.meta.url.substring("file:///".length);
    const u2 = self.substring(0, self.lastIndexOf("/"))+"/target/js-jco/"+url;
    if (isNode) {
        _fs = _fs || await import('fs/promises');
        return WebAssembly.compile(await _fs.readFile(u2));
    }
    return fetch(u2).then(WebAssembly.compileStreaming);
}

let sendMessageHit;
const imports = {
    'hello:city/city': {
        sendMessage: (message) => {
            sendMessageHit = message;
            console.log(message);
        }
    }
}
const component = await instantiate(fetchCompile, imports, WebAssembly.instantiate);
const exports = component['greeter'];
exports.run({
    name: "Prague"
});

if (sendMessageHit !== "Hello Prague from rust!") {
    throw new Error("sendMessageHit is " + sendMessageHit);
}