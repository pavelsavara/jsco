import { BindingContext } from '../binding/types';
import { ModelTag } from '../model/tags';
import { ImplComponentTypeDefined, ResolverContext } from './types';

export function prepareComponentTypeDefined(rctx: ResolverContext, definedIndex: number): ImplComponentTypeDefined {
    function createDefinedType(index: number, ctx: BindingContext): any {
        console.log('createDefinedType', index, section);
        return undefined;
    }

    const section = rctx.componentTypeDefined[definedIndex];
    switch (section.tag) {
        case ModelTag.ComponentTypeDefinedBorrow:
        case ModelTag.ComponentTypeDefinedEnum:
        case ModelTag.ComponentTypeDefinedFlags:
        case ModelTag.ComponentTypeDefinedList:
        case ModelTag.ComponentTypeDefinedOption:
        case ModelTag.ComponentTypeDefinedOwn:
        case ModelTag.ComponentTypeDefinedPrimitive:
        case ModelTag.ComponentTypeDefinedRecord:
        case ModelTag.ComponentTypeDefinedResult:
        case ModelTag.ComponentTypeDefinedTuple:
        case ModelTag.ComponentTypeDefinedVariant:
        default:
            throw new Error(`${section.tag} not implemented`);
    }
    console.log('prepareDefinedType', definedIndex, section);
    const factory: ImplComponentTypeDefined = cacheFactory(rctx, definedIndex, () => (ctx) => createDefinedType(definedIndex, ctx));
    return factory;
}

function cacheFactory(rctx: ResolverContext, cacheIndex: number, ff: () => ImplComponentTypeDefined): ImplComponentTypeDefined {
    const cache = rctx.implComponentTypeDefined;
    if (cache[cacheIndex] !== undefined) {
        return cache[cacheIndex];
    }
    const factory = ff();
    cache[cacheIndex] = factory;
    return factory;
}