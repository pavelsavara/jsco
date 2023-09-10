import { expectModelToEqualWat } from "./jest-utils";

describe("export", () => {

    test("parse export", async () => {
        await expectModelToEqualWat("(alias export 0 \"city-info\" (type (;3;)))", {

        });
    });
});

