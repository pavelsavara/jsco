import { BindingContext } from '../binding/types';
import { ExternalKind } from '../model/core';
import { ComponentExternalKind } from '../model/exports';
import { ModelTag } from '../model/tags';
import { prepareComponentInstance } from './component-instance';
import { cacheFactory } from './context';
import { ImplComponentType, ResolverContext } from './types';

export function prepareComponentTypeDefined(rctx: ResolverContext, definedIndex: number): Promise<ImplComponentType> {
    const section = rctx.indexes.componentTypes[definedIndex];
    return cacheFactory<ImplComponentType>(rctx, section, async () => {
        async function createDefinedType(ctx: BindingContext): Promise<any> {
            //console.log('createDefinedType', index, section);
            return undefined;
        }

        switch (section.tag) {
            case ModelTag.ComponentAliasInstanceExport: {
                switch (section.kind) {
                    case ComponentExternalKind.Type: {
                        console.log('ComponentTypeDefined', section);
                        const componentInstance = await prepareComponentInstance(rctx, section.instance_index);
                        break;
                    }
                    case ComponentExternalKind.Func:
                    case ComponentExternalKind.Component:
                    case ComponentExternalKind.Instance:
                    case ComponentExternalKind.Module:
                    case ComponentExternalKind.Value:
                    default:
                        throw new Error(`${section.kind} not implemented`);
                }

                break;

            }
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
        //console.log('prepareDefinedType', definedIndex, section);
        return (ctx) => createDefinedType(ctx);
    });
}

