// this is a model written by hand, so that we can test the parser and resolver early on
// it should match ./hello.wat (delta mistakes)

import { BindingContext, ResolverContext } from '../src/resolver/types';
import { ModelTag } from '../src/model/tags';
import { js, wasm } from './hello-component';
import { TCabiRealloc, WasmPointer } from '../src/resolver/binding/types';
import { jsco_assert } from '../src/utils/assert';
import {
    aliasCoreExportFunc0, aliasCoreExportFunc1, aliasCoreExportFunc3,
    aliasCoreExportMemory0, aliasCoreExportTable0, aliasExport0,
    aliasExportType1, aliasExportType3, canonicalFuncLift1, canonicalFuncLower2,
    componentExport0, componentImport0, componentInstance1, componentTypeComponent0,
    componentTypeFunc2, componentTypeInstance0,
    coreInstance0, coreInstance1, coreInstance2, coreInstance3, coreInstance4,
    coreModule0, coreModule1, coreModule2
} from './hello';
import { PrimitiveValType } from '../src/model/types';
import { createBindingContext, createResolverContext } from '../src/resolver/context';
import { WITModel } from '../src/parser';
import { createLifting, createLowering } from '../src/resolver/binding';

export const expectedContext: Partial<ResolverContext> = {
    usesNumberForInt64: false,
    indexes: {
        componentExports: [componentExport0],
        componentImports: [componentImport0],
        componentFunctions: [aliasExport0, canonicalFuncLift1],
        componentInstances: [componentTypeInstance0, componentInstance1],
        componentTypes: [componentTypeComponent0, aliasExportType1, componentTypeFunc2, aliasExportType3],
        componentTypeResource: [],

        coreModules: [coreModule0, coreModule1, coreModule2],
        coreInstances: [coreInstance0, coreInstance1, coreInstance2, coreInstance3, coreInstance4],
        coreFunctions: [aliasCoreExportFunc0, aliasCoreExportFunc1, canonicalFuncLower2, aliasCoreExportFunc3],
        coreMemories: [aliasCoreExportMemory0],
        coreTables: [aliasCoreExportTable0],
        coreGlobals: [],
        componentSections: [componentTypeComponent0],
    },
};

export async function resolveJCO(sections: WITModel, imports: any) {
    const rctx: ResolverContext = createResolverContext(sections, {});
    const ctx: BindingContext = createBindingContext(rctx, imports);
    const wasmInstantiate = WebAssembly.instantiate;

    const componentImports = (imports ? imports : {}) as {
        'hello:city/city': js.Imports,
    };

    const { sendMessage } = componentImports['hello:city/city'];
    const stringToJs = createLowering(rctx, {
        tag: ModelTag.ComponentValTypePrimitive,
        value: PrimitiveValType.String,
    });

    const stringFromJs = createLifting(rctx, {
        tag: ModelTag.ComponentValTypePrimitive,
        value: PrimitiveValType.String,
    });

    const numberToUint32 = createLifting(rctx, {
        tag: ModelTag.ComponentValTypePrimitive,
        value: PrimitiveValType.U32,
    });

    const bigIntToInt64 = createLifting(rctx, {
        tag: ModelTag.ComponentValTypePrimitive,
        value: PrimitiveValType.S64,
    });

    function sendMessageFromAbi(ptr: WasmPointer, len: WasmPointer) {
        const ptr0 = ptr;
        const len0 = len;
        const result0 = stringToJs(ctx, ptr0, len0);
        sendMessage(result0 as any);
    }

    const module0: WebAssembly.Module = await rctx.indexes.coreModules[0].module!;
    const module1: WebAssembly.Module = await rctx.indexes.coreModules[1].module!;
    const module2: WebAssembly.Module = await rctx.indexes.coreModules[2].module!;

    const instance1 = await wasmInstantiate(module1);
    const exports1 = instance1.exports as wasm.module1Exports;

    const fn0 = exports1['0'];
    //console.log('fn0', fn0.length);

    const imports0: wasm.module0Imports = {
        'hello:city/city': {
            'send-message': (...args) => {
                const rr = fn0(...args);
                //console.log('send-message', args, rr);
                return rr;
            },
        },
    };
    const instance0 = await wasmInstantiate(module0, imports0);
    const exports0 = instance0.exports as wasm.module0Exports;

    const memory0 = exports0.memory as WebAssembly.Memory;
    ctx.initializeMemory(memory0);
    const cabi_realloc: TCabiRealloc = exports0.cabi_realloc;
    ctx.initializeRealloc(cabi_realloc);

    const imports2: wasm.module2Imports = {
        '': {
            $imports: exports1.$imports,
            '0': sendMessageFromAbi,
        },
    };

    const instance2 = await wasmInstantiate(module2, imports2);

    function runToAbi(info: js.CityInfo) {
        const args = [
            ...stringFromJs(ctx, info.name),
            numberToUint32(ctx, info.headCount),
            bigIntToInt64(ctx, info.budget),
        ];
        exports0['hello:city/greeter#run'].apply(null, args as any);
    }

    const greeter0_1_0: js.Exports = {
        run: runToAbi,
    };

    return {
        exports: {
            'hello:city/greeter': greeter0_1_0,
        }
    };
}