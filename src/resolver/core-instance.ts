import { BindingContext } from '../binding/types';
import { ModelTag } from '../model/tags';
import { cacheFactory } from './context';
import { ResolverContext, ImplCoreInstance, JsImports } from './types';

export function prepareCoreInstance(rctx: ResolverContext, coreInstanceIndex: number): Promise<ImplCoreInstance> {
    return cacheFactory<ImplCoreInstance>(rctx.implCoreInstance, coreInstanceIndex, async () => {

        function createCoreInstance(module: WebAssembly.Module, ctx: BindingContext, imports: JsImports): Promise<WebAssembly.Instance> {
            console.log('createCoreInstance', imports);
            return rctx.wasmInstantiate(module, imports);
        }

        const section = rctx.indexes.coreInstances[coreInstanceIndex];
        switch (section.tag) {
            case ModelTag.CoreInstanceInstantiate: {
                console.log('prepareCoreInstance', section.tag);

                const moduleSection = rctx.indexes.coreModules[section.module_index];
                // TODO make lazy compilation from moduleSection.data
                const module = await moduleSection.module!;

                return (ctx, imports) => createCoreInstance(module, ctx, imports);
            }
            case ModelTag.CoreInstanceFromExports:
            default:
                throw new Error(`${(section as any).tag} not implemented`);
        }
    });
}

