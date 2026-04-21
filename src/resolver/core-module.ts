// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { ModelTag } from '../parser/model/tags';
import { CoreModule } from '../parser/types';
import { jsco_assert } from '../utils/assert';
import { Resolver } from './types';

export const resolveCoreModule: Resolver<CoreModule> = (rctx, rargs) => {
    const coreModule = rargs.element;
    jsco_assert(coreModule && coreModule.tag == ModelTag.CoreModule, () => `Wrong element type '${coreModule?.tag}'`);
    return {
        callerElement: rargs.callerElement,
        element: coreModule,
        binder: async (_mctx, _bargs) => {
            const binderResult = {
                result: await coreModule.module!
            };
            return binderResult;
        }
    };
};