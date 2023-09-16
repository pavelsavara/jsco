import { ModelTag, TaggedElement } from '../model/tags';
import { isDebug, jsco_assert } from '../utils/assert';
import { Resolver, BinderRes, ResolverContext, ResolverRes, ResolverArgs } from './types';

type ModelElement = {} & TaggedElement
type TempArgs = {}
type TempRes = {}

export const resolveTemp: Resolver<ModelElement, TempArgs, TempRes> = (rctx, rargs) => {
    const tempElem = rargs.element;
    jsco_assert(tempElem && tempElem.tag == ModelTag.ModelElement, () => `Wrong element type '${tempElem?.tag}'`);
    return {
        callerElement: rargs.callerElement,
        element: tempElem,
        binder: async (bctx, bargs): Promise<BinderRes<TempRes>> => {
            const binderResult = {
                missingRes: rargs.element.tag,
                result: {
                    missingResRes: rargs.element.tag,
                } as TempRes
            };
            if (isDebug) (binderResult as any)['bargs'] = bargs;
            return binderResult;
        }
    };
};
