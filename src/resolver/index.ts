import { TaggedElement } from '../model/tags';
import { parse } from '../parser';
import { ParserOptions } from '../parser/types';
import { isDebug } from '../utils/assert';
import { JsImports, WasmComponentInstance, WasmComponent, JsInterfaceCollection } from './api-types';
import { resolveComponentExport } from './component-exports';
import { createBindingContext, createResolverContext } from './context';
import { resolveCoreInstance } from './core-instance';
import { ComponentFactoryInput, ComponentFactoryOptions, ResolverContext, ResolverRes } from './types';

export async function instantiateComponent<TJSExports>(
    modelOrComponentOrUrl: ComponentFactoryInput,
    imports?: JsImports,
    options?: ComponentFactoryOptions & ParserOptions,
): Promise<WasmComponentInstance<TJSExports>> {
    let input = modelOrComponentOrUrl as any;
    if (typeof input !== 'object' || (Array.isArray(input) && input.length != 0 && typeof input[0] !== 'object')) {
        input = await parse(input, options ?? {});
    }
    const component = await createComponent<TJSExports>(input, options);
    return component.instantiate(imports);
}

export async function createComponent<TJSExports>(modelOrComponentOrUrl: ComponentFactoryInput, options?: ComponentFactoryOptions & ParserOptions): Promise<WasmComponent<TJSExports>> {
    let input = modelOrComponentOrUrl as any;
    if (typeof input !== 'object' || (Array.isArray(input) && input.length != 0 && typeof input[0] !== 'object')) {
        input = await parse(input, options ?? {});
    }

    const rctx: ResolverContext = createResolverContext(input, options ?? {});

    for (const coreModule of rctx.indexes.coreModules) {
        await coreModule.module;
    }
    const coreInstanceResolutions: ResolverRes<TaggedElement, WebAssembly.Imports, WebAssembly.Instance>[] = [];
    for (const coreInstance of rctx.indexes.coreInstances) {
        const resolution = resolveCoreInstance(rctx, { element: coreInstance, callerElement: undefined });
        coreInstanceResolutions.push(resolution);
    }
    /*const componentImportResolutions: ResolverRes<TaggedElement, JsInterfaceCollection, JsInterfaceCollection>[] = [];
    for (const componentExport of rctx.indexes.componentImports) {
        const resolution = resolveComponentImport(rctx, { element: componentExport, callerElement: undefined });
        componentImportResolutions.push(resolution);
    }*/
    const componentExportResolutions: ResolverRes<TaggedElement, JsInterfaceCollection, JsInterfaceCollection>[] = [];
    for (const componentExport of rctx.indexes.componentExports) {
        const resolution = resolveComponentExport(rctx, { element: componentExport, callerElement: undefined });
        componentExportResolutions.push(resolution);
    }

    async function instantiate(componentImports?: JsImports) {
        componentImports = componentImports ?? {};
        const ctx = createBindingContext(rctx, componentImports);

        const exports = {};
        /*const imports = {};
        for (const componentImportResolution of componentImportResolutions) {
            const args = {
                arguments: componentImports
            };
            if (isDebug) (args as any)['debugStack'] = [];
            const componentExportResult = await componentImportResolution.binder(ctx, args);
            Object.assign(imports, componentExportResult.result);
        }*/
        for (const componentExportResolution of componentExportResolutions) {
            const args = {
                arguments: componentImports
            };
            if (isDebug) (args as any)['debugStack'] = [];
            const componentExportResult = await componentExportResolution.binder(ctx, args);
            Object.assign(exports, componentExportResult.result);
        }

        // this is magic, because some core instances are not exported, but they are still needed
        // I think this is about $imports
        for (const instanceResolution of coreInstanceResolutions) {
            const args = {
                arguments: componentImports
            };
            if (isDebug) (args as any)['debugStack'] = [];
            await instanceResolution.binder(ctx, args);
        }

        return {
            exports,
            abort: ctx.abort,
        } as any as WasmComponentInstance<TJSExports>;
    }
    const component: WasmComponent<TJSExports> = {
        resolverContext: rctx,
        instantiate,
    };
    return component;
}