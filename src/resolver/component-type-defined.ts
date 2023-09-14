import { BindingContext } from '../binding/types';
import { ModelTag } from '../model/tags';
import { cacheFactory } from './context';
import { ImplComponentType, ResolverContext } from './types';

export function prepareComponentTypeDefined(rctx: ResolverContext, definedIndex: number): Promise<ImplComponentType> {
    return cacheFactory<ImplComponentType>(rctx.implComponentTypes, definedIndex, async () => {
        async function createDefinedType(ctx: BindingContext, index: number): Promise<any> {
            //console.log('createDefinedType', index, section);
            return undefined;
        }

        const section = rctx.indexes.componentTypes[definedIndex];
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
                //console.log('ComponentTypeDefined', section.tag);
                break;
            default:
                throw new Error(`${section.tag} not implemented`);
        }
        //console.log('prepareDefinedType', definedIndex, section);
        return (ctx) => createDefinedType(ctx, definedIndex);
    });
}

