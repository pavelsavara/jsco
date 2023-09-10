import { js } from "./hello";
import { createComponent } from "./index";

test("parse method compiles modules", async () => {
    let actualMessage: string = undefined as any;
    const imports: js.NamedImports = {
        "hello:city/city": {
            sendMessage: (message: string) => {
                actualMessage = message;
            }
        }
    };
    const component = await createComponent<js.NamedExports>("./hello/wasm/hello.wasm", imports);

    component["hello:city/greeter"].run({
        name: "Prague"
    });

    expect(actualMessage).toBe("Hello Prague from rust!");

});