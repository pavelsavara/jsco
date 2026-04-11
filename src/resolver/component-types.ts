import { ComponentExport, ComponentExternalKind } from '../model/exports';
import { ModelTag } from '../model/tags';
import { ComponentType } from '../model/types';
import { ComponentSection } from '../parser/types';
import { debugStack, withDebugTrace, jsco_assert } from '../utils/assert';
import { resolveComponentExport } from './component-exports';
import { resolveComponentAliasInstanceExport } from './component-functions';
import { resolveComponentImport } from './component-imports';
import { createScopedResolverContext, createBindingContext } from './context';
import { resolveCoreInstance } from './core-instance';
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

    // Create a scoped resolver context for this nested ComponentSection.
    // Sort indices within the section are local — they reference elements
    // declared inside this section, not the parent scope.
    const scopedRctx = createScopedResolverContext(rctx, componentSection.sections);

    const exportResolutions: ResolverRes[] = [];
    const importResolutions: ResolverRes[] = [];
    const coreInstanceResolutions: ResolverRes[] = [];
    for (const declaration of componentSection.sections) {
        switch (declaration.tag) {
            case ModelTag.ComponentExport: {
                if (declaration.kind === ComponentExternalKind.Func) {
                    const exportResolution = resolveComponentExport(scopedRctx, { element: declaration, callerElement: declaration });
                    exportResolutions.push(exportResolution);
                } else if (declaration.kind === ComponentExternalKind.Instance) {
                    const exportResolution = resolveComponentExport(scopedRctx, { element: declaration, callerElement: declaration });
                    exportResolutions.push(exportResolution);
                } else if (declaration.kind !== ComponentExternalKind.Type) {
                    throw new Error(`ComponentExport kind ${declaration.kind} not implemented`);
                }
                break;
            }
            case ModelTag.ComponentImport: {
                // Resolve imports — they'll be wired up with `bargs.imports`
                // at bind time when the parent instantiates this component.
                const importResolution = resolveComponentImport(scopedRctx, { element: declaration, callerElement: declaration });
                importResolutions.push(importResolution);
                break;
            }
            case ModelTag.CoreInstanceFromExports:
            case ModelTag.CoreInstanceInstantiate: {
                // Core instances within the ComponentSection need to be
                // instantiated during binding so that canonical lifts
                // can access the WASM functions they export.
                const coreInstanceResolution = resolveCoreInstance(scopedRctx, { element: declaration, callerElement: undefined });
                coreInstanceResolutions.push(coreInstanceResolution);
                break;
            }
            case ModelTag.ComponentTypeFunc:
            case ModelTag.ComponentTypeInstance:
            case ModelTag.ComponentSection:
            case ModelTag.ComponentAliasInstanceExport:
            case ModelTag.ComponentAliasCoreInstanceExport:
            case ModelTag.ComponentAliasOuter:
            case ModelTag.CoreModule:
            case ModelTag.ComponentInstanceFromExports:
            case ModelTag.ComponentInstanceInstantiate:
            case ModelTag.CanonicalFunctionLift:
            case ModelTag.CanonicalFunctionLower:
            case ModelTag.CanonicalFunctionResourceDrop:
            case ModelTag.CanonicalFunctionResourceNew:
            case ModelTag.CanonicalFunctionResourceRep:
            case ModelTag.CustomSection:
            case ModelTag.SkippedSection:
            case ModelTag.ComponentTypeDefinedRecord:
            case ModelTag.ComponentTypeDefinedTuple:
            case ModelTag.ComponentTypeDefinedEnum:
            case ModelTag.ComponentTypeDefinedVariant:
            case ModelTag.ComponentTypeDefinedResult:
            case ModelTag.ComponentTypeDefinedList:
            case ModelTag.ComponentTypeDefinedOption:
            case ModelTag.ComponentTypeDefinedFlags:
            case ModelTag.ComponentTypeDefinedOwn:
            case ModelTag.ComponentTypeDefinedBorrow:
            case ModelTag.ComponentTypeDefinedPrimitive:
                // Type declarations within a component section define the
                // component's type graph (records, enums, functions, etc.).
                // These are structural — consumed by the type resolution pass
                // and the resolved type map, not by runtime binding.
                break;
            default:
                throw new Error(`ComponentSection declaration tag ${declaration.tag} not implemented`);
        }
    }

    return {
        callerElement: rargs.callerElement,
        element: componentSection,
        binder: withDebugTrace(async (bctx, bargs) => {
            // Create an isolated binding context for this ComponentSection scope.
            // Nested sections have their own local index spaces (core instances,
            // functions, etc.) that would collide with the parent's if they shared
            // the same binding context.
            const scopedBctx = createBindingContext(bargs.imports ?? {}, scopedRctx.resolved);

            // Phase 1: Bind imports — wire up component args from the parent's instantiation.
            for (const importResolution of importResolutions) {
                const args: BinderArgs = {
                    imports: bargs.imports,
                    callerArgs: bargs,
                    debugStack: bargs.debugStack,
                };
                await importResolution.binder(scopedBctx, args);
            }

            // Phase 2: Instantiate core instances — WASM modules within this section.
            for (const coreInstanceResolution of coreInstanceResolutions) {
                const args: BinderArgs = {
                    debugStack: bargs.debugStack,
                };
                await coreInstanceResolution.binder(scopedBctx, args);
            }

            // Phase 3: Bind exports — resolve exported functions/instances.
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

                const argResult = await exportResolution.binder(scopedBctx, args);

                // Both Func and Instance export binders return { [name]: value }.
                // Merge them into the exports map without adding another naming layer.
                Object.assign(exports, argResult.result);
            }
            const binderResult: BinderRes = {
                result: exports
            };
            return binderResult;
        }, rargs.element.tag + ':' + rargs.element.selfSortIndex)
    };
};


