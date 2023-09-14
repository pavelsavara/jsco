import { BindingContext } from '../binding/types';
import { ModelTag } from '../model/tags';
import { cacheFactory } from './context';
import { ImplComponentType, ResolverContext } from './types';

export function prepareComponentTypeDefined(rctx: ResolverContext, definedIndex: number): ImplComponentType {
    function createDefinedType(ctx: BindingContext, index: number): any {
        console.log('createDefinedType', index, section);
        return undefined;
    }

    const section = rctx.componentTypes[definedIndex];
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
    const factory: ImplComponentType = cacheFactory(rctx.implComponentTypes, definedIndex, () => (ctx) => {
        return createDefinedType(ctx, definedIndex);
    });
    return factory;
}

