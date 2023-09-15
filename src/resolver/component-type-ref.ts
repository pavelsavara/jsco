import { ComponentTypeRef } from '../model/imports';
import { ModelTag } from '../model/tags';
import { ComponentType } from '../model/types';
import { prepareCoreFunction } from './core-function';
import { ResolverContext, ImplFactory, BindingContext } from './types';

export async function prepareComponentTypeRef(rctx: ResolverContext, ref: ComponentTypeRef): Promise<ImplFactory> {
    switch (ref.tag) {
        case ModelTag.ComponentTypeRefFunc: {
            return prepareCoreFunction(rctx, ref.value);
        }
        case ModelTag.ComponentTypeRefType: {
            break;
        }
        default:
            throw new Error(`"${ref.tag}" not implemented, ${rctx.debugStack}`);
    }
    return async (ctx: BindingContext, args: any) => {
        return {
            TODO: ref.tag
        } as any;
    };
}

export async function prepareComponentType(rctx: ResolverContext, type: ComponentType): Promise<ImplFactory> {
    switch (type.tag) {
        case ModelTag.ComponentTypeFunc:
        case ModelTag.ComponentTypeDefinedRecord: {
            break;
        }
        default:
            throw new Error(`"${type.tag}" not implemented, ${rctx.debugStack}`);
    }
    return async (ctx: BindingContext, args: any) => {
        return {
            TODO: type.tag
        } as any;
    };
}

