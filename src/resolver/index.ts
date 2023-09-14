import { JsImports, ComponentFactoryInput, ComponentFactoryOptions, ResolverContext, JsExports, WasmComponentInstance, WasmComponent } from './types';
import { WITModel, parse } from '../parser';
import { ParserOptions } from '../parser/types';
import { bindingContextFactory, produceResolverContext } from './context';
import { prepareComponentExports } from './component-exports';

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
    const resolverContext: ResolverContext = produceResolverContext(model, options ?? {});
    const factories = await prepareComponentExports(resolverContext);
    async function instantiate(imports?: JsImports): Promise<WasmComponentInstance<TJSExports>> {
        const ctx = bindingContextFactory(resolverContext, imports ?? {});
        const exports: JsExports<TJSExports> = {} as any;
        for (const factory of factories) {
            const ifc = await factory(ctx);
            Object.assign(exports, ifc);
        }
        return {
            exports,
            abort: ctx.abort,
        };
    }
    const component: WasmComponent<TJSExports> = {
        resolverContext,
        instantiate,
    };
    return component;
}
