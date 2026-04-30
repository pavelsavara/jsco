// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { ComponentAliasCoreInstanceExport } from '../parser/model/aliases';
import { withDebugTrace } from '../utils/assert';
import { resolveCoreInstance } from './core-instance';
import { getCoreInstance } from './indices';
import { Resolver, BinderRes, BinderArgs } from './types';

type ExportResult = Function | WebAssembly.Memory | WebAssembly.Table

export const resolveComponentAliasCoreInstanceExport: Resolver<ComponentAliasCoreInstanceExport> = (rctx, rargs) => {
    const componentAliasCoreInstanceExport = rargs.element;
    const coreInstance = getCoreInstance(rctx, componentAliasCoreInstanceExport.instance_index);
    const coreModuleResolution = resolveCoreInstance(rctx, { element: coreInstance, callerElement: componentAliasCoreInstanceExport });

    return {
        callerElement: rargs.callerElement,
        element: componentAliasCoreInstanceExport,
        binder: withDebugTrace(async (mctx, bargs): Promise<BinderRes> => {
            const args: BinderArgs = {
                callerArgs: bargs,
                debugStack: bargs.debugStack,
            };

            const moduleResult = await coreModuleResolution.binder(mctx, args);
            const result = (moduleResult.result as Record<string, ExportResult>)[componentAliasCoreInstanceExport.name];
            const binderResult = {
                result
            };
            return binderResult;
        }, rargs.element.tag + ':' + rargs.element.selfSortIndex)
    };
};
