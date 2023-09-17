import { ModelTag } from '../model/tags';
import { CoreModule } from '../parser/types';
import { jsco_assert } from '../utils/assert';
import { Resolver } from './types';

export const resolveCoreModule: Resolver<CoreModule> = (rctx, rargs) => {
    const coreModule = rargs.element;
    jsco_assert(coreModule && coreModule.tag == ModelTag.CoreModule, () => `Wrong element type '${coreModule?.tag}'`);
    return {
        callerElement: rargs.callerElement,
        element: coreModule,
        binder: async (bctx, bargs) => {
            const binderResult = {
                result: await coreModule.module!
            };
            return binderResult;
        }
    };
};