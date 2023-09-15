import { JsImports, ComponentFactoryInput, ComponentFactoryOptions, ResolverContext, WasmComponentInstance, WasmComponent } from './types';
import { WITModel, parse } from '../parser';
import { ParserOptions } from '../parser/types';
import { createBindingContext, createResolverContext } from './context';
import { prepareComponentExports } from './component-exports';
import { prepareComponentImports } from './component-imports';

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

export async function createComponent<TJSExports>(model: WITModel, options?: ComponentFactoryOptions): Promise<WasmComponent<TJSExports>> {
    const resolverContext: ResolverContext = createResolverContext(model, options ?? {});
    //const exportsFactory = await prepareComponentExports(resolverContext, resolverContext.indexes.componentExports);
    const importsFactory = await prepareComponentImports(resolverContext, resolverContext.indexes.componentImports);
    async function instantiate(args?: JsImports) {
        args = args ?? {};
        const ctx = createBindingContext(resolverContext, args);
        const imports = await importsFactory(ctx, args);
        //const exports = await exportsFactory(ctx, args);
        return {
            imports,
            //exports,
            abort: ctx.abort,
        } as any as WasmComponentInstance<TJSExports>;
    }
    const component: WasmComponent<TJSExports> = {
        resolverContext,
        instantiate,
    };
    return component;
}
