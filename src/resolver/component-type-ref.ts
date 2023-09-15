import { BindingContext } from '../binding/types';
import { ComponentTypeRef } from '../model/imports';
import { ModelTag } from '../model/tags';
import { ComponentType } from '../model/types';
import { ResolverContext, ImplFactory } from './types';

export async function prepareComponentTypeRef(rctx: ResolverContext, ref: ComponentTypeRef): Promise<ImplFactory> {
    switch (ref.tag) {
        case ModelTag.ComponentTypeRefFunc:
        case ModelTag.ComponentTypeRefType: {
            break;
        }
        default:
            throw new Error(`"${ref.tag}" not implemented, ${rctx.debugStack}`);
    }
    return async (ctx: BindingContext, imports: any) => {
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
    return async (ctx: BindingContext, imports: any) => {
        return {
            TODO: type.tag
        } as any;
    };
}

