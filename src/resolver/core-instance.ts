import { BindingContext } from '../binding/types';
import { ModelTag } from '../model/tags';
import { cacheFactory } from './context';
import { ResolverContext, ImplCoreInstance, JsImports } from './types';

export async function prepareCoreInstance(rctx: ResolverContext, coreInstanceIndex: number): Promise<ImplCoreInstance> {
    function createCoreInstance(module: WebAssembly.Module, ctx: BindingContext, imports: JsImports): Promise<WebAssembly.Instance> {
        console.log('createCoreInstance' + module);
        return rctx.wasmInstantiate(module, imports);
    }

    let factory: ImplCoreInstance;
    const section = rctx.indexes.coreInstances[coreInstanceIndex];
    switch (section.tag) {
        case ModelTag.CoreInstanceInstantiate: {
            console.log('prepareCoreInstance', section.tag);

            const moduleSection = rctx.indexes.coreModules[section.module_index];
            const module = await moduleSection.module!;

            factory = cacheFactory<ImplCoreInstance>(rctx.implCoreInstance, coreInstanceIndex, () => async (ctx, imports) => {
                return createCoreInstance(module, ctx, imports);
            });
            break;
        }
        case ModelTag.CoreInstanceFromExports:
        default:
            throw new Error(`${(section as any).tag} not implemented`);
    }
    return factory;
}

