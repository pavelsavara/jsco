import { ComponentExternalKind } from '../model/exports';
import { ComponentTypeRef } from '../model/imports';
import { ModelTag } from '../model/tags';
import { ComponentType } from '../model/types';
import { prepareCoreFunction } from './core-function';
import { ResolverContext, ImplFactory } from './types';

function resolveComponentTypeIndex(rctx: ResolverContext, componentTypeIndex: number): any {
    const section = rctx.indexes.componentTypes[componentTypeIndex];
    switch (section.tag) {
        case ModelTag.ComponentAliasInstanceExport: {
            switch (section.kind) {
                case ComponentExternalKind.Type: {

                    const instanceSection = rctx.indexes.componentInstances[section.instance_index];
                    switch (instanceSection.tag) {
                        case ModelTag.ComponentTypeInstance: {
                            const decl = instanceSection.declarations.find(d => d.tag === ModelTag.InstanceTypeDeclarationExport && d.name.name === section.name);
                            if (!decl) {
                                throw new Error(`InstanceTypeDeclarationExport "${section.name}" not found`);
                            }
                            switch (decl.tag) {
                                case ModelTag.InstanceTypeDeclarationExport: {
                                    switch (decl.ty.tag) {
                                        case ModelTag.ComponentTypeRefType: {
                                            switch (decl.ty.value.tag) {
                                                case ModelTag.TypeBoundsEq: {
                                                    const res = instanceSection.declarations[decl.ty.value.value];
                                                    switch (res.tag) {
                                                        case ModelTag.InstanceTypeDeclarationType:
                                                            return res.value;
                                                        default:
                                                            throw new Error(`${(res as any).tag} not implemented`);
                                                    }
                                                }
                                                default:
                                                    throw new Error(`${(decl.ty as any).tag} not implemented`);
                                            }
                                        }
                                        default:
                                            throw new Error(`${(decl.ty as any).tag} not implemented`);
                                    }
                                }
                                case ModelTag.InstanceTypeDeclarationCoreType:
                                case ModelTag.InstanceTypeDeclarationType:
                                case ModelTag.InstanceTypeDeclarationAlias:
                                default:
                                    throw new Error(`${(decl as any).tag} not implemented`);
                            }
                        }
                        default:
                            throw new Error(`${(instanceSection as any).kind} not implemented`);
                    }
                }
                case ComponentExternalKind.Instance:
                case ComponentExternalKind.Component:
                case ComponentExternalKind.Module:
                case ComponentExternalKind.Value:
                default:
                    throw new Error(`${(section as any).kind} not implemented`);
            }
        }
        default:
            throw new Error(`${(section as any).tag} not implemented`);
    }
}

export async function prepareComponentTypeRef(rctx: ResolverContext, ref: ComponentTypeRef): Promise<ImplFactory> {
    switch (ref.tag) {
        case ModelTag.ComponentTypeRefFunc: {
            return await prepareCoreFunction(rctx, ref.value);
        }
        case ModelTag.ComponentTypeRefType: {
            switch (ref.value.tag) {
                case ModelTag.TypeBoundsEq: {
                    const type = rctx.indexes.componentTypes[ref.value.value];
                    return async (ctx, args) => {
                        return type;
                    };
                }
                case ModelTag.TypeBoundsSubResource:
                default:
                    throw new Error(`"${(ref.value as any).tag}" not implemented`);
            }
        }
        default:
            throw new Error(`"${ref.tag}" not implemented, ${rctx.debugStack}`);
    }
}

async function prepareComponentType(rctx: ResolverContext, type: ComponentType): Promise<ImplFactory> {
    const resolved = resolveComponentType(rctx, type);
    return async () => {
        return resolved;
    };
}

function resolveComponentType(rctx: ResolverContext, type: ComponentType): any {
    switch (type.tag) {
        case ModelTag.ComponentTypeFunc:
        case ModelTag.ComponentTypeDefinedRecord: {
            break;
        }
        default:
            throw new Error(`"${type.tag}" not implemented, ${rctx.debugStack}`);
    }
    return {
        TODO: type.tag + ' ' + (new Error().stack)!.split('\n')[1]
    };
}

