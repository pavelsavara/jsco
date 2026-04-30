// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { ModelTag } from '../parser/model/tags';
import { CoreModule } from '../parser/types';
import { jsco_assert } from '../utils/assert';
import { BinderRes, Resolver } from './types';

export const resolveCoreModule: Resolver<CoreModule> = (rctx, rargs) => {
    const coreModule = rargs.element;
    jsco_assert(coreModule && coreModule.tag == ModelTag.CoreModule, () => `Wrong element type '${coreModule?.tag}'`);
    return {
        callerElement: rargs.callerElement,
        element: coreModule,
        binder: async (_mctx, _bargs): Promise<BinderRes> => {
            const binderResult = {
                result: await coreModule.module!
            };
            return binderResult;
        }
    };
};