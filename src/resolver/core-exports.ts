import { ComponentAliasCoreInstanceExport } from '../model/aliases';
import { debugStack, isDebug } from '../utils/assert';
import { resolveCoreInstance } from './core-instance';
import { Resolver, BinderRes } from './types';

type ExportResult = Function | WebAssembly.Memory | WebAssembly.Table

export const resolveComponentAliasCoreInstanceExport: Resolver<ComponentAliasCoreInstanceExport, any, ExportResult> = (rctx, rargs) => {
    const componentAliasCoreInstanceExport = rargs.element;
    const coreInstanceIndex = componentAliasCoreInstanceExport.instance_index;
    const coreInstance = rctx.indexes.coreInstances[coreInstanceIndex];
    const coreModuleResolution = resolveCoreInstance(rctx, { element: coreInstance, callerElement: componentAliasCoreInstanceExport });

    return {
        callerElement: rargs.callerElement,
        element: componentAliasCoreInstanceExport,
        binder: async (bctx, bargs): Promise<BinderRes<ExportResult>> => {
            const args = {
                arguments: { missingArgEx: rargs.element.tag } as any as WebAssembly.Imports,
                callerArgs: bargs,
            };
            debugStack(bargs, args, rargs.element.tag + ':' + rargs.element.selfSortIndex);

            const moduleResult = await coreModuleResolution.binder(bctx, args);
            const result = moduleResult.result.exports[componentAliasCoreInstanceExport.name] as ExportResult;
            const binderResult = {
                result
            };
            if (isDebug) (binderResult as any)['bargs'] = bargs;
            if (isDebug) (binderResult as any)['moduleResult'] = moduleResult;
            if (isDebug) (binderResult as any)['fromExportName'] = componentAliasCoreInstanceExport.name;
            if (isDebug) (binderResult as any)['fromCoreInstanceIndex'] = coreInstanceIndex;
            return binderResult;
        }
    };
};
