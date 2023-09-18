import { ModelTag, TaggedElement } from '../model/tags';
import { jsco_assert } from '../utils/assert';
import { Resolver, BinderRes } from './types';

type ModelElement = {} & TaggedElement
type TempRes = {}

export const resolveTemp: Resolver<ModelElement> = (rctx, rargs) => {
    const tempElem = rargs.element;
    jsco_assert(tempElem && tempElem.tag == ModelTag.ModelElement, () => `Wrong element type '${tempElem?.tag}'`);
    return {
        callerElement: rargs.callerElement,
        element: tempElem,
        binder: async (bctx, bargs): Promise<BinderRes> => {
            const binderResult = {
                missingRes: rargs.element.tag,
                result: {
                    missingResRes: rargs.element.tag,
                } as TempRes
            };
            return binderResult;
        }
    };
};
