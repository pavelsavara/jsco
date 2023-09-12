import * as jco from '@bytecodealliance/jco';
import { WITModel, parse } from '.';
// import { jest } from "@jest/globals";

export function expectModelToEqual(actualModel: WITModel, expectedModel: Partial<WITModel>) {
    delete (actualModel as any).modules; // don't care about modules in this test
    delete (actualModel as any).other; // don't care about other in this test
    expectedModel.componentExports = expectedModel.componentExports || [];
    expectedModel.componentImports = expectedModel.componentImports || [];
    expectedModel.aliases = expectedModel.aliases || [];
    expectedModel.instances = expectedModel.instances || [];
    expectedModel.cannon = expectedModel.cannon || [];
    expectedModel.type = expectedModel.type || [];
    expectedModel.tag = expectedModel.tag || 'model';
    expect(actualModel).toEqual(expectedModel);
}

export function jcoCompileWat(wat: string): Promise<Uint8Array> {
    return jco.parse(wat);
}

export async function expectModelToEqualWat(watSections: string, expectedModel: Partial<WITModel>) {
    const wasmBuffer = await jcoCompileWat(`(component ${watSections})`);
    expectModelToEqualWasm(wasmBuffer, expectedModel);
}

export async function expectModelToEqualWasm(wasmBuffer: Uint8Array, expectedModel: Partial<WITModel>) {
    const model = await parse(wasmBuffer);
    expectModelToEqual(model, expectedModel);
}