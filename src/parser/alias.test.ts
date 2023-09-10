import { expectModelToEqualWat } from "./jest-utils";

describe("export", () => {

    test("parse alias", async () => {
        await expectModelToEqualWat("(alias export 0 \"city-info\" (type (;3;)))", {
            /*aliases: [
                {
                    tag: "section-alias",
                }
            ]*/
        });
    });
});

