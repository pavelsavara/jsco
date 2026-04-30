// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { WITModel, parse } from '.';
import { ModelTag } from './model/tags';

export function expectModelToEqual(actualModel: WITModel, expectedModel: WITModel): void {
    const noModules = actualModel.map((section) => {
        if (section.tag === ModelTag.CoreModule) {
            delete section.module;
        }
        return section;
    });
    expect(noModules).toEqual(expectedModel);
}

export async function jcoCompileWat(wat: string): Promise<Uint8Array> {
    const jco = await import('@bytecodealliance/jco');
    return jco.parse(wat);
}

export async function expectModelToEqualWat(watSections: string, expectedModel: WITModel): Promise<void> {
    const wasmBuffer = await jcoCompileWat(`(component ${watSections})`);
    expectModelToEqualWasm(wasmBuffer, expectedModel);
}

export async function expectModelToEqualWasm(wasmBuffer: Uint8Array, expectedModel: WITModel): Promise<void> {
    const model = await parse(wasmBuffer);
    expectModelToEqual(model, expectedModel);
}