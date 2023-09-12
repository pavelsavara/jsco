import { createLifting, createLowering } from '../binding';
import { js, abi } from '../../hello/ts';
import { JsImports, ComponentFactoryInput, ComponentFactoryOptions, JsExports, JsInterfaceCollection, ComponentFactory, WITModelByType } from './types';
import { WITModel, parse } from '../parser';
import { WasmPointer, WasmSize, BindingContext, Tcabi_realloc } from '../binding/types';
import { PrimitiveValType } from '../model/types';
import { ParserOptions } from '../parser/types';
import { ModelTag } from '../model/tags';

export async function createComponent<TJSExports extends JsInterfaceCollection>(
    modelOrComponentOrUrl: ComponentFactoryInput,
    imports?: JsImports,
    options?: ComponentFactoryOptions & ParserOptions
) {
    let input = modelOrComponentOrUrl as any;
    if (typeof input !== 'object' || input.tag !== 'model') {
        input = await parse(input, options ?? {});
    }
    return createComponentFactory<TJSExports>(input)(imports, options);
}

// to learn how it works, this is code generated by JCO, slowly being replaced by JSCO
export function createComponentFactory<TJSExports extends JsInterfaceCollection>(model: WITModel): ComponentFactory<TJSExports> {
    const witModel: WITModelByType = produceModel(model);
    return async (imports?: JsImports, options?: ComponentFactoryOptions): Promise<JsExports<TJSExports>> => {
        const wasmInstantiate = options?.wasmInstantiate ?? WebAssembly.instantiate;
        function getView(pointer?: number, len?: number) {
            return new DataView(memory0.buffer, pointer, len);
        }

        function getViewU8(pointer?: number, len?: number) {
            return new Uint8Array(memory0.buffer, pointer, len);
        }
        options = options ?? {};

        const ctx: BindingContext = {
            useNumberForInt64: (options.useNumberForInt64 === false) ? false : true,
            utf8Decoder: new TextDecoder(),
            utf8Encoder: new TextEncoder(),
            getView,
            getViewU8,
            getMemory: () => {
                return memory0;
            },
            realloc(oldPtr, oldSize, align, newSize) {
                return cabi_realloc(oldPtr, oldSize, align, newSize);
            },
            alloc: (newSize: WasmSize, align: WasmSize) => {
                return cabi_realloc(0 as any, 0 as any, align, newSize);
            },
            readI32: (ptr: WasmPointer) => {
                return getView().getInt32(ptr);
            },
            writeI32: (ptr: WasmPointer, value: number) => {
                return getView().setInt32(ptr, value);
            }
        };

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

        const module0: WebAssembly.Module = await witModel.modules[0].module!;
        const module1: WebAssembly.Module = await witModel.modules[1].module!;
        const module2: WebAssembly.Module = await witModel.modules[2].module!;

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

        return {
            greeter: greeter0_1_0,
            'hello:city/greeter': greeter0_1_0
        } as any;
    };
}

export function produceModel(sections: WITModel): WITModelByType {
    const model: WITModelByType = {
        componentExports: [],
        componentImports: [],
        instances: [],
        modules: [],
        other: [],
        type: [],
        aliases: [],
        cannon: [],
        component: [],
    };

    for (const section of sections) {
        // TODO: process all sections into model
        switch (section.tag) {
            case 'ComponentModule':
                model.modules.push(section);
                break;
            case 'ComponentExport':
                model.componentExports.push(section);
                break;
            case 'ComponentImport':
                model.componentImports.push(section);
                break;
            case 'ComponentAliasOuter':
            case 'ComponentAliasCoreInstanceExport':
            case 'ComponentAliasInstanceExport':
                model.aliases.push(section);
                break;
            case 'InstanceFromExports':
            case 'InstanceInstantiate':
                model.instances.push(section);
                break;
            case 'ComponentTypeFunc':
            case 'ComponentTypeComponent':
            case 'ComponentTypeDefined':
            case 'ComponentTypeInstance':
            case 'ComponentTypeResource':
                model.type.push(section);
                break;
            case 'CanonicalFunctionLower':
            case 'CanonicalFunctionLift':
            case 'CanonicalFunctionResourceDrop':
            case 'CanonicalFunctionResourceNew':
            case 'CanonicalFunctionResourceRep':
                model.cannon.push(section);
                break;
            case 'SkippedSection':
            case 'CustomSection':
                model.other.push(section);
                break;
            default:
                throw new Error(`unexpected section tag: ${(section as any).tag}`);
        }
    }

    return model;
}