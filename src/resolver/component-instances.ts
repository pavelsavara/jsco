import camelCase from 'just-camel-case';
import { ComponentExternalKind } from '../model/exports';
import { ComponentFuncIndex, ComponentInstanceIndex } from '../model/indices';
import { ComponentInstance, ComponentInstanceFromExports, ComponentInstanceInstantiate, ComponentInstantiationArg } from '../model/instances';
import { ModelTag, TaggedElement } from '../model/tags';
import { ComponentTypeInstance } from '../model/types';
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
    const coreInstance = rargs.element;
    switch (coreInstance.tag) {
        case ModelTag.ComponentInstanceInstantiate: return resolveComponentInstanceInstantiate(rctx, rargs as any);
        case ModelTag.ComponentInstanceFromExports: return resolveComponentInstanceFromExports(rctx, rargs as any);
        case ModelTag.ComponentTypeInstance: return resolveComponentTypeInstance(rctx, rargs as any);
        default: throw new Error(`"${(coreInstance as any).tag}" not implemented`);
    }
};

export const resolveComponentInstanceInstantiate: Resolver<ComponentInstanceInstantiate> = (rctx, rargs) => {
    const componentInstanceInstantiate = rargs.element;
    jsco_assert(componentInstanceInstantiate && componentInstanceInstantiate.tag == ModelTag.ComponentInstanceInstantiate, () => `Wrong element type '${componentInstanceInstantiate?.tag}'`);
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
                // We strip the prefix to recover the original WIT name for JS-side lookup.
                if (argName.startsWith('import-func-')) {
                    argName = argName.substring('import-func-'.length);
                } else if (argName.startsWith('import-method-')) {
                    argName = argName.substring('import-method-'.length);
                } else if (argName.startsWith('import-constructor-')) {
                    argName = argName.substring('import-constructor-'.length);
                } else if (argName.startsWith('import-static-')) {
                    argName = argName.substring('import-static-'.length);
                } else if (argName.startsWith('import-type-')) {
                    argName = argName.substring('import-type-'.length);
                }
                argName = camelCase(argName);
                componentArgs[argName] = argResult.result;
            }
            Object.assign(binderResult.result.exports, componentArgs);

            const args: BinderArgs = {
                imports: componentArgs as JsImports,
                callerArgs: bargs,
                debugStack: bargs.debugStack,
            };
            const componentSectionResult = await componentSectionResolution.binder(bctx, args);

            binderResult.result = componentSectionResult.result as ComponentInstanceData;
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
                const callerElement = exportResolution.callerElement as unknown as import('../model/exports').ComponentExport;
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