import { ComponentExport, ComponentExternalKind } from '../model/exports';
import { ModelTag } from '../model/tags';
import { ComponentType } from '../model/types';
import { ComponentSection } from '../parser/types';
import { debugStack, withDebugTrace, jsco_assert } from '../utils/assert';
import { resolveComponentExport } from './component-exports';
import { resolveComponentAliasInstanceExport } from './component-functions';
import { BinderArgs, BinderRes, Resolver, ResolverRes } from './types';

export const resolveComponentType: Resolver<ComponentType> = (rctx, rargs) => {
    const coreInstance = rargs.element;
    if (!coreInstance) {
        throw new Error('Wrong element type ');
    }
    switch (coreInstance.tag) {
        case ModelTag.ComponentSection: return resolveComponentSection(rctx, { element: rargs.element as ComponentSection, callerElement: rargs.callerElement });
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
                // ComponentImport within a ComponentSection is a type declaration.
                // It establishes what imports this nested component requires.
                // The actual import wiring happens through ComponentInstanceInstantiate's
                // instantiation args — the ComponentSection binder receives resolved
                // functions via bargs.imports, NOT through this declaration.
                //
                // For ComponentTypeRefFunc: the import declares a function requirement.
                // For ComponentTypeRefType: the import declares a type requirement.
                // Both are satisfied when the component is instantiated with matching args.
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
        binder: withDebugTrace(async (bctx, bargs) => {
            const exports: Record<string, unknown> = {};
            for (const exportResolution of exportResolutions) {
                const callerElement = exportResolution.callerElement as ComponentExport;
                const args: BinderArgs = {
                    arguments: bargs.arguments,
                    imports: bargs.imports,
                    callerArgs: bargs,
                    debugStack: bargs.debugStack,
                };
                debugStack(args, args, callerElement.tag + ':' + callerElement.name.name);

                const argResult = await exportResolution.binder(bctx, args);

                exports[callerElement.name.name] = argResult.result;
            }
            const binderResult: BinderRes = {
                result: exports
            };
            return binderResult;
        }, rargs.element.tag + ':' + rargs.element.selfSortIndex)
    };
};


