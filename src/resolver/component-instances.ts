// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import isDebug from 'env:isDebug';
import camelCase from 'just-camel-case';
import { ComponentExport, ComponentExternalKind } from '../parser/model/exports';
import { ComponentFuncIndex, ComponentInstanceIndex } from '../parser/model/indices';
import { ComponentInstance, ComponentInstanceFromExports, ComponentInstanceInstantiate, ComponentInstantiationArg } from '../parser/model/instances';
import { ComponentAliasInstanceExport } from '../parser/model/aliases';
import { ModelTag, TaggedElement } from '../parser/model/tags';
import { ComponentTypeInstance } from '../parser/model/types';
import { stripImportPrefix } from './import-names';
import { debugStack, withDebugTrace, jsco_assert } from '../utils/assert';
import { JsImports } from './api-types';
import { resolveComponentFunction } from './component-functions';
import { resolveComponentType } from './component-types';
import { getComponentFunction, getComponentInstance } from './indices';
import { BinderArgs, BinderRes, BindingContext, Resolver, ResolverRes } from './types';

export type ComponentInstanceData = {
    instanceIndex: number;
    imports: Record<string, unknown>;
    exports: Record<string, unknown>;
    types: Record<string, unknown>;
}

type ComponentInstanceBinderRes = BinderRes & { result: ComponentInstanceData };

export const resolveComponentInstance: Resolver<ComponentInstance> = (rctx, rargs) => {
    const cached = rctx.componentInstanceCache.get(rargs.element);
    if (cached) {
        if (isDebug && rctx.resolved.stats) rctx.resolved.stats.componentInstanceCacheHits++;
        return { ...cached, callerElement: rargs.callerElement };
    }
    const coreInstance = rargs.element;
    let result: ResolverRes;
    switch (coreInstance.tag) {
        case ModelTag.ComponentInstanceInstantiate: result = resolveComponentInstanceInstantiate(rctx, rargs as any); break;
        case ModelTag.ComponentInstanceFromExports: result = resolveComponentInstanceFromExports(rctx, rargs as any); break;
        case ModelTag.ComponentTypeInstance: result = resolveComponentTypeInstance(rctx, rargs as any); break;
        case ModelTag.ComponentAliasInstanceExport: result = resolveComponentAliasInstanceExport(rctx, rargs as any); break;
        default: throw new Error(`"${(coreInstance as any).tag}" not implemented`);
    }
    rctx.componentInstanceCache.set(rargs.element, result);
    return result;
};

export const resolveComponentInstanceInstantiate: Resolver<ComponentInstanceInstantiate> = (rctx, rargs) => {
    const componentInstanceInstantiate = rargs.element;
    jsco_assert(componentInstanceInstantiate && componentInstanceInstantiate.tag == ModelTag.ComponentInstanceInstantiate, () => `Wrong element type '${componentInstanceInstantiate?.tag}'`);
    if (isDebug && rctx.resolved.stats) rctx.resolved.stats.resolveComponentInstanceInstantiate++;
    // component_index references the COMPONENT sort (componentSections), NOT the TYPE sort
    const componentSection = rctx.indexes.componentSections[componentInstanceInstantiate.component_index];
    jsco_assert(componentSection && componentSection.tag === ModelTag.ComponentSection,
        () => `Expected ComponentSection at component sort index ${componentInstanceInstantiate.component_index}, got ${componentSection?.tag}`);
    const componentSectionResolution = resolveComponentType(rctx, { element: componentSection, callerElement: componentInstanceInstantiate });
    const argResolutions: ResolverRes[] = [];
    for (const arg of componentInstanceInstantiate.args) {
        switch (arg.kind) {
            case ComponentExternalKind.Func: {
                const componentFunction = getComponentFunction(rctx, arg.index as ComponentFuncIndex);
                const resolver = resolveComponentFunction(rctx, { element: componentFunction, callerElement: arg as unknown as TaggedElement });
                argResolutions.push(resolver);
                break;
            }
            case ComponentExternalKind.Instance: {
                const componentInstance = getComponentInstance(rctx, arg.index as ComponentInstanceIndex);
                const resolver = resolveComponentInstance(rctx, { element: componentInstance, callerElement: arg as unknown as TaggedElement });
                argResolutions.push(resolver);
                break;
            }
            case ComponentExternalKind.Type: {
                // Type arguments to component instantiation are structural —
                // they carry type information for validation but don't produce
                // runtime values. We skip resolution since the child component
                // references types by their local indices, and the type graph
                // is already constructed during parsing.
                break;
            }
            case ComponentExternalKind.Component:
            case ComponentExternalKind.Module:
            case ComponentExternalKind.Value:
            default:
                throw new Error(`"${arg.kind}" not implemented`);
        }
    }

    return {
        callerElement: rargs.callerElement,
        element: componentInstanceInstantiate,
        binder: withDebugTrace(async (bctx, bargs) => {
            const binderResult = lookupComponentInstance(bctx, componentInstanceInstantiate.selfSortIndex!);
            Object.assign(binderResult.result, bargs.imports);

            const componentArgs: Record<string, unknown> = {};
            for (const argResolution of argResolutions) {
                const callerElement = argResolution.callerElement as unknown as ComponentInstantiationArg;

                const args = {
                    arguments: bargs.arguments,
                    imports: bargs.imports,
                    callerArgs: bargs,
                    debugStack: bargs.debugStack,
                };
                debugStack(args, args, 'ComponentInstantiationArg:' + callerElement.index + ':' + callerElement.name);
                const argResult = await argResolution.binder(bctx, args);
                let argName = callerElement.name;
                // wit-component (wasm-tools crate) generates synthetic prefixed names for
                // component instantiation arguments to disambiguate kinds in the flat
                // namespace. The prefixes are defined in:
                // https://github.com/bytecodealliance/wasm-tools/blob/main/crates/wit-component/src/encoding.rs
                //
                // import_func_name() produces:
                //   'import-func-{name}'        — freestanding functions
                //   'import-method-{obj}-{name}' — [method]obj.name
                //   'import-constructor-{name}'  — [constructor]name
                //   'import-static-{obj}-{name}' — [static]obj.name
                //
                // unique_import_name() produces:
                //   'import-type-{name}'         — type imports into nested shim components
                //
                // Both the instantiation site (with "import-func-run" ...) and the child
                // component's import declaration (import "import-func-run" ...) use the same
                // prefixed name. Wasmtime matches them verbatim (see inline.rs:444).
                //
                // We strip the prefix to recover the original WIT name for internal wiring.
                // Note: we do NOT camelCase here — internal component wiring should use
                // the original WIT names. CamelCase conversion is only for the JS-host boundary.
                argName = stripImportPrefix(argName);
                // For Instance args, pass the flat exports (interface functions),
                // not the whole ComponentInstanceData. The child's import resolution
                // for ComponentTypeRefInstance does Object.assign(exports, imprt),
                // expecting a flat { hideFood: fn, consumeFood: fn } object.
                if (callerElement.kind === ComponentExternalKind.Instance && (argResult.result as any)?.exports) {
                    componentArgs[argName] = (argResult.result as any).exports;
                } else {
                    componentArgs[argName] = argResult.result;
                }
            }
            Object.assign(binderResult.result.exports, componentArgs);

            const args: BinderArgs = {
                imports: componentArgs as JsImports,
                callerArgs: bargs,
                debugStack: bargs.debugStack,
            };
            const componentSectionResult = await componentSectionResolution.binder(bctx, args);

            Object.assign(binderResult.result.exports, componentSectionResult.result);
            return binderResult;
        }, rargs.element.tag + ':' + rargs.element.selfSortIndex)
    };
};

export const resolveComponentInstanceFromExports: Resolver<ComponentInstanceFromExports> = (rctx, rargs) => {
    const componentInstanceFromExports = rargs.element;
    jsco_assert(componentInstanceFromExports && componentInstanceFromExports.tag == ModelTag.ComponentInstanceFromExports, () => `Wrong element type '${componentInstanceFromExports?.tag}'`);

    const exportResolutions: ResolverRes[] = [];
    for (const exp of componentInstanceFromExports.exports) {
        switch (exp.kind) {
            case ComponentExternalKind.Func: {
                const componentFunction = getComponentFunction(rctx, exp.index as ComponentFuncIndex);
                const resolver = resolveComponentFunction(rctx, { element: componentFunction, callerElement: exp as unknown as TaggedElement });
                exportResolutions.push(resolver);
                break;
            }
            case ComponentExternalKind.Instance: {
                const componentInstance = getComponentInstance(rctx, exp.index as ComponentInstanceIndex);
                const resolver = resolveComponentInstance(rctx, { element: componentInstance, callerElement: exp as unknown as TaggedElement });
                exportResolutions.push(resolver);
                break;
            }
            case ComponentExternalKind.Type: {
                // Type exports from an instance are structural — they establish
                // type entries visible to the parent scope but don't produce
                // runtime values. The type information is already captured in
                // the instance's type declarations during parsing.
                break;
            }
            case ComponentExternalKind.Component:
            case ComponentExternalKind.Module:
            case ComponentExternalKind.Value:
            default:
                throw new Error(`ComponentInstanceFromExports: "${exp.kind}" not implemented`);
        }
    }

    return {
        callerElement: rargs.callerElement,
        element: componentInstanceFromExports,
        binder: withDebugTrace(async (bctx, bargs) => {
            const binderResult = lookupComponentInstance(bctx, componentInstanceFromExports.selfSortIndex!);

            for (const exportResolution of exportResolutions) {
                const callerElement = exportResolution.callerElement as unknown as ComponentExport;
                const args: BinderArgs = {
                    arguments: bargs.arguments,
                    imports: bargs.imports,
                    callerArgs: bargs,
                    debugStack: bargs.debugStack,
                };
                debugStack(args, args, 'ComponentInstanceFromExports:' + callerElement.name?.name);
                const argResult = await exportResolution.binder(bctx, args);
                const exportName = camelCase(callerElement.name?.name ?? '');
                binderResult.result.exports[exportName] = argResult.result;
            }

            return binderResult;
        }, rargs.element.tag + ':' + rargs.element.selfSortIndex)
    };
};

export const resolveComponentTypeInstance: Resolver<ComponentTypeInstance> = (rctx, rargs) => {
    const componentTypeInstance = rargs.element;
    jsco_assert(componentTypeInstance && componentTypeInstance.tag == ModelTag.ComponentTypeInstance, () => `Wrong element type '${componentTypeInstance?.tag}'`);

    return {
        callerElement: rargs.callerElement,
        element: componentTypeInstance,
        binder: async (bctx, bargs) => {
            const binderResult = lookupComponentInstance(bctx, componentTypeInstance.selfSortIndex!);
            Object.assign(binderResult.result.exports, bargs.imports);
            Object.assign(binderResult.result.types, componentTypeInstance.declarations);
            return binderResult;
        }
    };
};

export const resolveComponentAliasInstanceExport: Resolver<ComponentAliasInstanceExport> = (rctx, rargs) => {
    const alias = rargs.element;
    jsco_assert(alias && alias.tag == ModelTag.ComponentAliasInstanceExport, () => `Wrong element type '${alias?.tag}'`);

    const parentInstance = getComponentInstance(rctx, alias.instance_index as ComponentInstanceIndex);
    const parentResolution = resolveComponentInstance(rctx, { element: parentInstance, callerElement: alias });

    return {
        callerElement: rargs.callerElement,
        element: alias,
        binder: withDebugTrace(async (bctx, bargs) => {
            const parentResult = await parentResolution.binder(bctx, bargs) as ComponentInstanceBinderRes;
            const binderResult = lookupComponentInstance(bctx, alias.selfSortIndex!);
            // Try the original name first (for interface URIs like "zoo:food/eater@0.1.0"),
            // then fall back to camelCase (for simple kebab-case identifiers like "food-info").
            const exportedInstance = parentResult.result.exports[alias.name]
                ?? parentResult.result.exports[camelCase(alias.name)];
            if (exportedInstance && typeof exportedInstance === 'object') {
                Object.assign(binderResult.result.exports, exportedInstance);
            }
            return binderResult;
        }, rargs.element.tag + ':' + alias.name)
    };
};

export function lookupComponentInstance(bctx: BindingContext, instanceIndex: number): ComponentInstanceBinderRes {
    let binderResult = bctx.instances.componentInstances[instanceIndex] as ComponentInstanceBinderRes | undefined;
    if (!binderResult) {
        binderResult = {
            result: {
                instanceIndex,
                imports: {},
                exports: {},
                types: {}
            }
        };
        bctx.instances.componentInstances[instanceIndex] = binderResult;
    }
    return binderResult;
}