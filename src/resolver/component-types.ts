import { ComponentExport, ComponentExternalKind } from '../model/exports';
import { ModelTag, WITSection } from '../model/tags';
import { ComponentType } from '../model/types';
import { ComponentSection } from '../parser/types';
import { debugStack, jsco_assert } from '../utils/assert';
import { resolveComponentExport } from './component-exports';
import { resolveComponentAliasInstanceExport } from './component-functions';
import { BinderRes, Resolver, ResolverRes } from './types';

export const resolveComponentType: Resolver<ComponentType> = (rctx, rargs) => {
    const coreInstance = rargs.element;
    if (!coreInstance) {
        throw new Error('Wrong element type ');
    }
    switch (coreInstance.tag) {
        case ModelTag.ComponentSection: return resolveComponentSection(rctx, rargs as any);
        case ModelTag.ComponentAliasInstanceExport: return resolveComponentAliasInstanceExport(rctx, rargs as any);
        default: throw new Error(`"${(coreInstance as any).tag}" not implemented`);
    }
};

export const resolveComponentSection: Resolver<ComponentSection> = (rctx, rargs) => {
    const componentSection = rargs.element;
    jsco_assert(componentSection && componentSection.tag == ModelTag.ComponentSection, () => `Wrong element type '${componentSection?.tag}'`);

    const exportResolutions: ResolverRes[] = [];
    for (const declaration of componentSection.sections) {
        switch (declaration.tag) {
            case ModelTag.ComponentExport: {
                if (declaration.kind === ComponentExternalKind.Func) {
                    const exportResolution = resolveComponentExport(rctx, { element: declaration, callerElement: declaration });
                    exportResolutions.push(exportResolution);
                } else if (declaration.kind !== ComponentExternalKind.Type) {
                    throw new Error('Not implemented');
                }
                break;
            }
            case ModelTag.ComponentImport: {
                // declaration.name
                // declaration.name.name
                // rctx.indexes.componentTypes[declaration.ty.value];
                // throw new Error('Not implemented' + declaration.name.name);
                break;
            }
            case ModelTag.ComponentTypeFunc:
            case ModelTag.ComponentTypeDefinedRecord:
            case ModelTag.ComponentTypeDefinedTuple:
            case ModelTag.ComponentTypeDefinedEnum:
            case ModelTag.ComponentTypeDefinedVariant:
                // TODO types
                break;
            default:
                throw new Error(`${declaration.tag} not implemented`);
        }
    }

    return {
        callerElement: rargs.callerElement,
        element: componentSection,
        binder: async (bctx, bargs) => {
            const exports = {} as any;
            for (const exportResolution of exportResolutions) {
                const callerElement = exportResolution.callerElement as ComponentExport;
                const args = {
                    arguments: bargs.arguments,
                    imports: bargs.imports,
                    callerArgs: bargs,
                    debugSource: callerElement.tag + ':' + callerElement.name.name
                };
                debugStack(bargs, args, rargs.element.tag + ':' + rargs.element.selfSortIndex);
                debugStack(args, args, callerElement.tag + ':' + callerElement.name.name);

                const argResult = await exportResolution.binder(bctx, args);

                exports[callerElement.name.name] = argResult.result as any;
            }
            const binderResult: BinderRes = {
                result: exports
            };
            return binderResult;
        }
    };
};


