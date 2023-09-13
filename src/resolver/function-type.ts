import { BindingContext } from '../binding/types';
import { ModelTag } from '../model/tags';
import { jsco_assert } from '../utils/assert';
import { ResolverContext, ImplFunctionTypeFactory } from './types';

export function prepareFunctionType(rctx: ResolverContext, functionIndex: number): ImplFunctionTypeFactory {
    function createFunctionType(index: number, ctx: BindingContext): any {
        console.log('createFunctionType', index, section);
        return undefined;
    }

    const section = rctx.functionType[functionIndex];
    jsco_assert(section.tag === ModelTag.ComponentTypeFunc, () => `expected ComponentTypeFunc, got ${section.tag}`);
    console.log('prepareComponentInstance', functionIndex, section);
    const factory: ImplFunctionTypeFactory = cacheFactory(rctx, functionIndex, () => (ctx) => createFunctionType(functionIndex, ctx));
    return factory;
}

function cacheFactory(rctx: ResolverContext, cacheIndex: number, ff: () => ImplFunctionTypeFactory): ImplFunctionTypeFactory {
    const cache = rctx.functionTypeFactories;
    if (cache[cacheIndex] !== undefined) {
        return cache[cacheIndex];
    }
    const factory = ff();
    cache[cacheIndex] = factory;
    return factory;
}