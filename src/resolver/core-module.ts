import { ModelTag } from '../model/tags';
import { CoreModule } from '../parser/types';
import { jsco_assert } from '../utils/assert';
import { Resolver, BinderRes } from './types';

export const resolveCoreModule: Resolver<CoreModule> = (rctx, rargs) => {
    const coreModule = rargs.element;
    jsco_assert(coreModule && coreModule.tag == ModelTag.CoreModule, () => `Wrong element type '${coreModule?.tag}'`);
    const coreInstanceIndex = rargs.callerElement.selfSortIndex!;
    return {
        callerElement: rargs.callerElement,
        element: coreModule,
        binder: async (bctx, bargs): Promise<BinderRes> => {
            let binderResult = bctx.coreInstances[coreInstanceIndex];
            if (binderResult) {
                // TODO, do I need to validate that all calls got the same args ?
                return binderResult;
            }
            const module = await coreModule.module!;

            const instance = await rctx.wasmInstantiate(module, bargs.imports!);
            //console.log('rctx.wasmInstantiate ' + coreInstanceIndex, Object.keys(instance.exports));

            const exports = instance.exports;
            binderResult = {
                result: instance
            };
            bctx.coreInstances[coreInstanceIndex] = binderResult;

            // TODO maybe there are WIT instructions telling that explicitly ?
            const memory = exports['memory'] as WebAssembly.Memory;
            if (memory) {
                bctx.initializeMemory(memory);
            }
            const cabi_realloc = exports['cabi_realloc'] as any;
            if (cabi_realloc) {
                bctx.initializeRealloc(cabi_realloc);
            }
            return binderResult;
        }
    };
};