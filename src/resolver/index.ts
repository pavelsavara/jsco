import { JsImports, ComponentFactoryInput, ComponentFactoryOptions, ComponentFactory, ResolverContext, JsExports, WasmComponent } from './types';
import { WITModel, parse } from '../parser';
import { ParserOptions } from '../parser/types';
import { produceResolverContext } from './context';

export async function createComponent<TJSExports>(
    modelOrComponentOrUrl: ComponentFactoryInput,
    imports?: JsImports,
    options?: ComponentFactoryOptions & ParserOptions,
): Promise<WasmComponent<TJSExports>> {
    let input = modelOrComponentOrUrl as any;
    if (typeof input !== 'object' || (Array.isArray(input) && input.length != 0 && typeof input[0] !== 'object')) {
        input = await parse(input, options ?? {});
    }
    const componentFactory: ComponentFactory<TJSExports> = await createComponentFactory<TJSExports>(input, options);
    const componentInstance: WasmComponent<TJSExports> = componentFactory(imports);
    return componentInstance;
}

export function createComponentFactory<TJSExports>(model: WITModel, options?: ComponentFactoryOptions): ComponentFactory<TJSExports> {
    const rctx: ResolverContext = produceResolverContext(model, options ?? {});
    rctx.prepareComponentExports();
    return (imports?: JsImports): WasmComponent<TJSExports> => {
        const ctx = rctx.bindingContextFactory(imports ?? {});
        const exports: JsExports<TJSExports> = {} as any;
        for (const factory of rctx.componentExportFactories) {
            const ifc = factory(ctx);
            Object.assign(exports, ifc);
        }
        return {
            exports,
            abort: ctx.abort,
        };
    };
}

/*
    return async (imports?: JsImports, options?: ComponentFactoryOptions): Promise<JsExports<TJSExports>> => {
        const wasmInstantiate = options?.wasmInstantiate ?? WebAssembly.instantiate;



        const componentImports = (imports ? imports : {}) as {
            'hello:city/city': js.Imports,
        };

        const { sendMessage } = componentImports['hello:city/city'];
        const stringToJs = createLowering({
            tag: ModelTag.ComponentValTypePrimitive,
            value: PrimitiveValType.String,
        });

        const stringFromJs = createLifting({
            tag: ModelTag.ComponentValTypePrimitive,
            value: PrimitiveValType.String,
        });

        const numberToUint32 = createLifting({
            tag: ModelTag.ComponentValTypePrimitive,
            value: PrimitiveValType.U32,
        });

        const bigIntToInt64 = createLifting({
            tag: ModelTag.ComponentValTypePrimitive,
            value: PrimitiveValType.S64,
        });

        function sendMessageFromAbi(ptr: WasmPointer, len: WasmPointer) {
            const ptr0 = ptr;
            const len0 = len;
            const result0 = stringToJs(ctx, ptr0, len0);
            sendMessage(result0 as any);
        }

        function runToAbi(info: js.CityInfo) {
            const args = [
                ...stringFromJs(ctx, info.name),
                numberToUint32(ctx, info.headCount),
                bigIntToInt64(ctx, info.budget),
            ];
            exports0['hello:city/greeter#run'].apply(null, args as any);
        }

        const module0: WebAssembly.Module = await rctx.modules[0].module!;
        const module1: WebAssembly.Module = await rctx.modules[1].module!;
        const module2: WebAssembly.Module = await rctx.modules[2].module!;

        const exports1 = (await wasmInstantiate(module1)).exports as abi.module1Exports;

        const imports0: abi.module0Imports = {
            'hello:city/city': {
                'send-message': exports1['0'],
            },
        };
        const exports0 = (await wasmInstantiate(module0, imports0)).exports as abi.module0Exports;

        const cabi_realloc: Tcabi_realloc = exports0.cabi_realloc;
        const memory0 = exports0.memory as WebAssembly.Memory;

        const imports2: abi.module2Imports = {
            '': {
                $imports: exports1.$imports,
                '0': sendMessageFromAbi,
            },
        };

        await wasmInstantiate(module2, imports2);

        const greeter0_1_0: js.Exports = {
            run: runToAbi,
        };
        return factory;
    };
*/


