import { createComponent } from './@pavelsavara/jsco/index.js';

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
const cityInput = document.querySelector('#city');
const headCountInput = document.querySelector('#headCount');
const budgetInput = document.querySelector('#budget');
const messages = document.querySelector('#messages');

document.querySelector('#say-hi').addEventListener('click', onClick)
function onClick(){
    const name = cityInput.value;
    const headCount = parseInt(headCountInput.value);
    const budget = BigInt(budgetInput.value);
    greeter.run({
        name,
        headCount,
        budget,
    });
}

let dropDots = true;
function sendMessage(message) {
    console.log(message);
    
    if(dropDots){
        messages.innerText = '';
        dropDots = false;
    }

    const div = document.createElement('div');
    div.innerText = message;
    messages.appendChild(div);
}
