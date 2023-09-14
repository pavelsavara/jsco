import { ComponentExternalKind } from '../model/exports';
import { ModelTag } from '../model/tags';
import { prepareComponentInstance } from './component-instance';
import { memoizePrepare } from './context';
import { ImplComponentType, ResolverContext } from './types';

export function prepareComponentTypeDefined(rctx: ResolverContext, definedIndex: number): Promise<ImplComponentType> {
    const section = rctx.indexes.componentTypes[definedIndex];
    return memoizePrepare<ImplComponentType>(rctx, section, async () => {
        switch (section.tag) {
            case ModelTag.ComponentAliasInstanceExport: {
                switch (section.kind) {
                    case ComponentExternalKind.Type: {
                        const componentInstance = await prepareComponentInstance(rctx, section.instance_index);
                        //console.log('TODO ComponentAliasInstanceExport', section, componentInstance);
                        return async (ctx) => {
                            const instance = await componentInstance(ctx);
                            //console.log('TODO ComponentAliasInstanceExport', section, instance);
                            return instance;
                        };
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
    });
}

