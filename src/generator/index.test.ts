import { generateTypeScript } from "./index";
//import { jest } from "@jest/globals";

describe("typescript generator test", () => {
    test("generator is not implemented", async () => {
        try{
            await generateTypeScript({} as any);
        }catch (e) {
            expect(e).toBeInstanceOf(Error);
        }
    });
});