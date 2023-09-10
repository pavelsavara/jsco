import { parse } from "./index";
import { expectModelToEqual } from "./jest-utils";

describe("parser test", () => {
    test("parse method compiles modules", async () => {
        // build it with `npm run build:hello`
        const model = await parse("./hello/wasm/hello.wasm");

        expect(model.tag).toBe("model");
        expect(model.modules.length).toBe(3);
        expect(model.modules[0].module).toBeInstanceOf(Promise);
        expect(model.modules[1].module).toBeInstanceOf(Promise);
        expect(model.modules[2].module).toBeInstanceOf(Promise);

        const modules = await Promise.all(model.modules.map(async (m) => m.module));
        expect(modules[0]).toBeInstanceOf(WebAssembly.Module);
        expect(modules[1]).toBeInstanceOf(WebAssembly.Module);
        expect(modules[1]).toBeInstanceOf(WebAssembly.Module);
    });

    test("parse method produces model", async () => {
        // build it with `npm run build:hello`
        const model = await parse("./hello/wasm/hello.wasm");

        // TODO: make more/all sections to match `../../hello/wat/hello.wat` file
        expectModelToEqual(model, {
            componentExports: [
                {
                    tag: "section-export",
                    name: {
                        tag: "name-regid",
                        name: "hello:city/greeter@0.1.0"
                    },
                    sortidx: 5,
                    kind: "func"
                }
            ],
        });
    });

    test("to fail on invalid header", async () => {
        const wasm = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
        expect(async () => await parse(wasm)).rejects.toThrowError("unexpected magic or version.");
    });

});

