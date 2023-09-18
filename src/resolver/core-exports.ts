import { ComponentAliasCoreInstanceExport } from '../model/aliases';
import { debugStack } from '../utils/assert';
import { resolveCoreInstance } from './core-instance';
import { Resolver, BinderRes } from './types';

type ExportResult = Function | WebAssembly.Memory | WebAssembly.Table

export const resolveComponentAliasCoreInstanceExport: Resolver<ComponentAliasCoreInstanceExport> = (rctx, rargs) => {
    const componentAliasCoreInstanceExport = rargs.element;
    const coreInstanceIndex = componentAliasCoreInstanceExport.instance_index;
    const coreInstance = rctx.indexes.coreInstances[coreInstanceIndex];
    const coreModuleResolution = resolveCoreInstance(rctx, { element: coreInstance, callerElement: componentAliasCoreInstanceExport });

    return {
        callerElement: rargs.callerElement,
        element: componentAliasCoreInstanceExport,
        binder: async (bctx, bargs): Promise<BinderRes> => {
            const args = {
                missing: rargs.element.tag,
                callerArgs: bargs,
            };
            debugStack(bargs, args, rargs.element.tag + ':' + rargs.element.selfSortIndex);

            const moduleResult = await coreModuleResolution.binder(bctx, args);
            const result = moduleResult.result[componentAliasCoreInstanceExport.name] as ExportResult;
            const binderResult = {
                result
            };
            return binderResult;
        }
    };
};
