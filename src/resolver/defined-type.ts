import { BindingContext } from '../binding/types';
import { ModelTag } from '../model/tags';
import { jsco_assert } from '../utils/assert';
import { ResolverContext, ImplDefinedTypeFactory } from './types';

export function prepareDefinedType(rctx: ResolverContext, definedIndex: number): ImplDefinedTypeFactory {
    function createDefinedType(index: number, ctx: BindingContext): any {
        console.log('createDefinedType', index, section);
        return undefined;
    }

    const section = rctx.definedType[definedIndex];
    jsco_assert(section.tag === ModelTag.ComponentTypeDefined, () => `expected ComponentTypeDefined, got ${section.tag}`);
    console.log('prepareDefinedType', definedIndex, section);
    const factory: ImplDefinedTypeFactory = cacheFactory(rctx, definedIndex, () => (ctx) => createDefinedType(definedIndex, ctx));
    return factory;
}

function cacheFactory(rctx: ResolverContext, cacheIndex: number, ff: () => ImplDefinedTypeFactory): ImplDefinedTypeFactory {
    const cache = rctx.definedTypeFactories;
    if (cache[cacheIndex] !== undefined) {
        return cache[cacheIndex];
    }
    const factory = ff();
    cache[cacheIndex] = factory;
    return factory;
}