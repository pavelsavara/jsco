// this is a model written by hand, so that we can test the parser and resolver early on
// it should match ./hello.wat (delta mistakes)

import { ResolverContext } from '../src/resolver/types';
import { ModelTag } from '../src/model/tags';
import { createLifting, createLowering } from '../src/binding';
import { js, wasm } from './hello-component';
import { BindingContext, Tcabi_realloc, WasmPointer } from '../src/binding/types';
import { jsco_assert } from '../src/utils/assert';
import { aliasCoreExportFunc0, aliasCoreExportFunc1, aliasCoreExportFunc3, aliasCoreExportMemory0, aliasCoreExportTable0, aliasExport0, aliasExportType1, aliasExportType3, canonicalFuncLift1, canonicalFuncLower2, componentExport0, componentImport0, componentInstance1, componentTypeComponent0, componentTypeFunc2, componentTypeInstance0, coreInstance0, coreInstance1, coreInstance2, coreInstance3, coreInstance4 } from './hello';
import { PrimitiveValType } from '../src/model/types';

export const expectedContext: Partial<ResolverContext> = {
    usesNumberForInt64: false,
    modules: [], other: [],

    componentExports: [componentExport0],
    componentImports: [componentImport0],
    componentFunctions: [aliasExport0, canonicalFuncLift1],
    componentInstances: [componentTypeInstance0, componentInstance1],
    componentTypes: [componentTypeComponent0, aliasExportType1, componentTypeFunc2, aliasExportType3],
    componentTypeResource: [],

    coreInstances: [coreInstance0, coreInstance1, coreInstance2, coreInstance3, coreInstance4],
    coreFunctions: [aliasCoreExportFunc0, aliasCoreExportFunc1, canonicalFuncLower2, aliasCoreExportFunc3],
    coreMemories: [aliasCoreExportMemory0],
    coreTables: [aliasCoreExportTable0],
    coreGlobals: [],

    implComponentInstance: [],
    implComponentTypes: [],
    implComponentTypeFunc: [],
    implComponentTypeResource: [],
    implCoreInstance: [],

};


export function resolveTree() {
    const model: ResolverContext = expectedContext as ResolverContext;
    jsco_assert(componentExport0 === model.componentExports[0], 'aww, snap! 1');
    {
        jsco_assert(componentInstance1 === model.componentInstances[componentExport0.index], 'aww, snap! 1.1');
        {
            const runArgIndex = componentInstance1.args[0].index;// import-func-run
            {
                jsco_assert(canonicalFuncLift1 === model.componentFunctions[runArgIndex], 'aww, snap! 1.1.1');
                {
                    jsco_assert(aliasCoreExportFunc3 === model.coreFunctions[canonicalFuncLift1.core_func_index], 'aww, snap! 1.1.1.1');
                    {
                        jsco_assert(aliasCoreExportFunc3 === model.coreInstances[aliasCoreExportFunc3.instance_index], 'aww, snap! 1.1.1.1');

                    }

                    jsco_assert(componentTypeFunc2 === model.componentTypes[canonicalFuncLift1.type_index], 'aww, snap! 1.1.1.1.2');
                }
            }

            const cityInfoIndex = componentInstance1.args[1].index;// import-type-city-info
            {
                jsco_assert(aliasExportType3 === model.componentTypes[cityInfoIndex], 'aww, snap! 1.1.2');
            }
            const cityInfo0Index = componentInstance1.args[2].index;// import-type-city-info0
            {
                jsco_assert(aliasExportType1 === model.componentTypes[cityInfo0Index], 'aww, snap! 1.1.3');
            }


            jsco_assert(componentTypeComponent0 === model.componentTypes[componentInstance1.component_index], 'aww, snap! 1.2');

        }
    }
}

export async function resolveJCO(imports: any) {
    const rctx: ResolverContext = undefined as any;
    const ctx: BindingContext = undefined as any;
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

    const module0: WebAssembly.Module = await rctx.modules[0].module!;
    const module1: WebAssembly.Module = await rctx.modules[1].module!;
    const module2: WebAssembly.Module = await rctx.modules[2].module!;

    const exports1 = (await wasmInstantiate(module1)).exports as wasm.module1Exports;

    const imports0: wasm.module0Imports = {
        'hello:city/city': {
            'send-message': exports1['0'],
        },
    };
    const exports0 = (await wasmInstantiate(module0, imports0)).exports as wasm.module0Exports;

    const cabi_realloc: Tcabi_realloc = exports0.cabi_realloc;
    const memory0 = exports0.memory as WebAssembly.Memory;
    ctx.initialize(memory0, cabi_realloc);

    const imports2: wasm.module2Imports = {
        '': {
            $imports: exports1.$imports,
            '0': sendMessageFromAbi,
        },
    };

    await wasmInstantiate(module2, imports2);

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

    return greeter0_1_0;
}