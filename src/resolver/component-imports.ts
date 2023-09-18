import { ComponentImport } from '../model/imports';
import { ModelTag } from '../model/tags';
import { jsco_assert } from '../utils/assert';
import { lookupComponentInstance } from './component-instances';
import { Resolver } from './types';

export const resolveComponentImport: Resolver<ComponentImport> = (rctx, rargs) => {
    const componentImport = rargs.element;
    jsco_assert(componentImport && componentImport.tag == ModelTag.ComponentImport, () => `Wrong element type '${componentImport?.tag}'`);

    switch (componentImport.ty.tag) {
        case ModelTag.ComponentTypeRefComponent: {
            return {
                callerElement: rargs.callerElement,
                element: componentImport,
                binder: async (bctx, bargs) => {
                    // TODO this instance index is probably wrong!
                    const binderResult = lookupComponentInstance(bctx, componentImport.selfSortIndex!);
                    const imprt = bargs.imports[componentImport.name.name];
                    Object.assign(binderResult.result.imports, imprt);
                    return binderResult;
                }
            };
        }
        case ModelTag.ComponentTypeRefFunc:
        case ModelTag.ComponentTypeRefType:
        default:
            throw new Error(`${componentImport.ty.tag} not implemented`);

    }
};