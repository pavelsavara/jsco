import * as jco from '@bytecodealliance/jco';
import { WITModel, parse } from '.';
import { ModelTag } from '../model/tags';

export function expectModelToEqual(actualModel: WITModel, expectedModel: WITModel) {
    const noModules = actualModel.map((section) => {
        if (section.tag === ModelTag.CoreModule) {
            delete section.module;
        }
        return section;
    });
    expect(noModules).toEqual(expectedModel);
}

export function jcoCompileWat(wat: string): Promise<Uint8Array> {
    return jco.parse(wat);
}

export async function expectModelToEqualWat(watSections: string, expectedModel: WITModel) {
    const wasmBuffer = await jcoCompileWat(`(component ${watSections})`);
    expectModelToEqualWasm(wasmBuffer, expectedModel);
}

export async function expectModelToEqualWasm(wasmBuffer: Uint8Array, expectedModel: WITModel) {
    const model = await parse(wasmBuffer);
    expectModelToEqual(model, expectedModel);
}