import { JsImports, ComponentFactoryInput, ComponentFactoryOptions, ComponentFactory, ResolverContext, JsExports, WasmComponent } from './types';
import { WITModel, parse } from '../parser';
import { ParserOptions } from '../parser/types';
import { bindingContextFactory, produceResolverContext } from './context';
import { prepareComponentExports } from './component-exports';

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
    const factories = prepareComponentExports(rctx);
    return (imports?: JsImports): WasmComponent<TJSExports> => {
        const ctx = bindingContextFactory(rctx, imports ?? {});
        const exports: JsExports<TJSExports> = {} as any;
        for (const factory of factories) {
            const ifc = factory(ctx);
            Object.assign(exports, ifc);
        }
        return {
            exports,
            abort: ctx.abort,
        };
    };
}
