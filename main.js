import { createComponent } from './@pavelsavara/jsco/index.js';

function sendMessage(message) {
    console.log(message);
}

async function createGreeter(sendMessage) {
    // this is url of your component
    // `hello.wasm` sample was built using `npm run build:hello`
    // the implementation is in `./hello/src/lib.rs` 
    const componentUrl='./hello/wasm/hello.wasm';

    // this is the component instance, see also `instantiateComponent`
    const component = await createComponent(componentUrl);

    // these are the imports that the component expects
    const imports = {
        'hello:city/city': {
            sendMessage
        }
    };

    // it has the following API `./hello/wit/hello.wit`
    const instance = await component.instantiate(imports);

    // exported namespaces contain the functions
    const exports = instance.exports;
    return exports['hello:city/greeter']
}

const greeter = await createGreeter(sendMessage);

function runGreeter(cityInfo){
    greeter.run(cityInfo);
}

export function onClick(){
    console.log('onClick');
    /*runGreeter({
        name: 'Prague',
        headCount: 100,
        budget: 0n,
    });*/
}