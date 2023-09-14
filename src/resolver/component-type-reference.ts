import { ComponentTypeRef } from '../model/imports';
import { ModelTag } from '../model/tags';
import { ComponentType } from '../model/types';
import { ResolverContext, ImplComponentTypeReference } from './types';

export async function prepareComponentTypeReference(rctx: ResolverContext, componentTypeRef: ComponentTypeRef): Promise<ImplComponentTypeReference> {
    switch (componentTypeRef.tag) {
        case ModelTag.ComponentTypeRefType:
        case ModelTag.ComponentTypeRefFunc:
            return async (ctx) => {
                return {
                    TODO: componentTypeRef.tag
                } as any;
            };
        default:
            throw new Error(`${componentTypeRef.tag} not implemented`);
    }
}

export async function prepareComponentType(rctx: ResolverContext, componentTypeRef: ComponentType): Promise<ImplComponentTypeReference> {
    switch (componentTypeRef.tag) {
        case ModelTag.ComponentTypeDefinedRecord:
        case ModelTag.ComponentTypeFunc:
            return async (ctx) => {
                return {
                    TODO: componentTypeRef.tag
                } as any;
            };
        default:
            throw new Error(`${componentTypeRef.tag} not implemented`);
    }
}
