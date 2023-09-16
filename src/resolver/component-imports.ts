import { ComponentImport } from '../model/imports';
import { ModelTag } from '../model/tags';
import { isDebug, jsco_assert } from '../utils/assert';
import { Resolver } from './types';

export const resolveComponentImport: Resolver<ComponentImport, any, any> = (rctx, rargs) => {
    const componentImport = rargs.element;
    jsco_assert(componentImport && componentImport.tag == ModelTag.ComponentImport, () => `Wrong element type '${componentImport?.tag}'`);

    switch (componentImport.ty.tag) {
        case ModelTag.ComponentTypeRefFunc:
        case ModelTag.ComponentTypeRefType:
        case ModelTag.ComponentTypeRefComponent: {
            // TODO types
            break;
        }
        default:
            throw new Error(`${componentImport.ty.tag} not implemented`);

    }

    return {
        callerElement: rargs.callerElement,
        element: componentImport,
        binder: async (bctx, bargs) => {
            const binderResult = {
                missingRes: rargs.element.tag,
                result: {
                    missingResRes: rargs.element.tag,
                } as any
            };
            if (isDebug) (binderResult as any)['bargs'] = bargs;
            return binderResult;
        }
    };
};