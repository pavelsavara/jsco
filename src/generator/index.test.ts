import { generateTypeScript } from "./index";
//import { jest } from "@jest/globals";

describe("typescript generator test", () => {
    test("generator is not implemented", async () => {
        expect(async () => await generateTypeScript({} as any)).rejects.toThrowError("Not implemented");
    });
});