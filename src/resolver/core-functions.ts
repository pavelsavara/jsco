import { ComponentFunction, CoreFunction, ComponentAliasInstanceExport as ComponentAliasInstanceExportType } from '../model/aliases';
import { CanonicalFunctionLower, CanonicalFunctionResourceDrop, CanonicalFunctionResourceNew, CanonicalFunctionResourceRep } from '../model/canonicals';
import { ComponentExternalKind } from '../model/exports';
import { ComponentTypeIndex } from '../model/indices';
import { ModelTag } from '../model/tags';
import { ComponentTypeFunc, ComponentTypeInstance, InstanceTypeDeclaration } from '../model/types';
import { debugStack, withDebugTrace, jsco_assert } from '../utils/assert';
import { createFunctionLowering } from './binding';
import { JsFunction } from './binding/types';
import { resolveComponentFunction } from './component-functions';
import { resolveComponentAliasCoreInstanceExport } from './core-exports';
import type { ResolvedType } from './type-resolution';
import { getComponentFunction, getComponentType } from './indices';
import { Resolver, BinderRes, ResolverRes, resolveCanonicalOptions, StringEncoding } from './types';


export const resolveCoreFunction: Resolver<CoreFunction> = (rctx, rargs) => {
    const coreInstance = rargs.element;
    switch (coreInstance.tag) {
        case ModelTag.ComponentAliasCoreInstanceExport: return resolveComponentAliasCoreInstanceExport(rctx, rargs as any) as ResolverRes;
        case ModelTag.CanonicalFunctionLower: return resolveCanonicalFunctionLower(rctx, rargs as any);
        case ModelTag.CanonicalFunctionResourceDrop: return resolveCanonicalFunctionResourceDrop(rctx, rargs as any);
        case ModelTag.CanonicalFunctionResourceNew: return resolveCanonicalFunctionResourceNew(rctx, rargs as any);
        case ModelTag.CanonicalFunctionResourceRep: return resolveCanonicalFunctionResourceRep(rctx, rargs as any);
        default: throw new Error(`"${(coreInstance as any).tag}" not implemented`);
    }
};

export const resolveCanonicalFunctionLower: Resolver<CanonicalFunctionLower> = (rctx, rargs) => {
    const canonicalFunctionLowerElem = rargs.element;
    jsco_assert(canonicalFunctionLowerElem && canonicalFunctionLowerElem.tag == ModelTag.CanonicalFunctionLower, () => `Wrong element type '${canonicalFunctionLowerElem?.tag}'`);

    const componentFunction = getComponentFunction(rctx, canonicalFunctionLowerElem.func_index);
    const componentFunctionResolution = resolveComponentFunction(rctx, { element: componentFunction, callerElement: canonicalFunctionLowerElem });

    // Resolve function type by following the component function chain:
    // CanonicalFunctionLower.func_index → componentFunction →
    //   CanonicalFunctionLift.type_index → ComponentTypeFunc
    //   ComponentAliasInstanceExport → resolvedTypes lookup
    const funcType = resolveLoweredFuncType(rctx, componentFunction);

    const canonOpts = resolveCanonicalOptions(canonicalFunctionLowerElem.options);
    jsco_assert(canonOpts.stringEncoding === StringEncoding.Utf8,
        () => `String encoding '${canonOpts.stringEncoding}' not yet supported, only UTF-8`);

    const loweringBinder = createFunctionLowering(rctx, funcType);

    return {
        callerElement: rargs.callerElement,
        element: canonicalFunctionLowerElem,
        binder: withDebugTrace(async (bctx, bargs): Promise<BinderRes> => {
            const args = {
                arguments: bargs.arguments,
                imports: bargs.imports,
                callerArgs: bargs,
                debugStack: bargs.debugStack,
            };
            debugStack(args, args, componentFunction.tag + ':' + componentFunction.selfSortIndex);
            const functionResult = await componentFunctionResolution.binder(bctx, args);

            const wasmFunction = loweringBinder(bctx, functionResult.result as JsFunction);

            const binderResult = {
                result: wasmFunction
            };
            return binderResult;
        }, rargs.element.tag + ':' + rargs.element.selfSortIndex)
    };
};

function resolveLoweredFuncType(rctx: import('./types').ResolverContext, componentFunction: ComponentFunction): ComponentTypeFunc {
    // If the component function is a CanonicalFunctionLift, it has type_index directly
    if (componentFunction.tag === ModelTag.CanonicalFunctionLift) {
        const sectionFunType = getComponentType(rctx, componentFunction.type_index);
        jsco_assert(sectionFunType.tag === ModelTag.ComponentTypeFunc,
            () => `expected ComponentTypeFunc from lift type_index, got ${sectionFunType.tag}`);
        return sectionFunType as ComponentTypeFunc;
    }

    // If the component function is a ComponentAliasInstanceExport, trace through the instance.
    // This may involve following chains of aliases: the instance at instance_index may itself
    // reference another instance, etc. We follow the chain with a bounded depth to prevent
    // infinite loops.
    if (componentFunction.tag === ModelTag.ComponentAliasInstanceExport) {
        const result = resolveAliasedFuncType(rctx, componentFunction, 10);
        if (result) return result;

        throw new Error(`Could not resolve function type for ComponentAliasInstanceExport '${componentFunction.name}'`);
    }

    throw new Error(`Cannot resolve function type for component function tag '${(componentFunction as any).tag}'`);
}

/**
 * Recursively trace through alias chains to find the ComponentTypeFunc for
 * a ComponentAliasInstanceExport. The alias may point to:
 *   - ComponentTypeInstance → look up export declaration by name
 *   - ComponentInstanceFromExports → find the named export, follow if it's another alias
 *   - ComponentInstanceInstantiate → check the component section for the export type
 * maxDepth prevents infinite loops in pathological cases.
 */
function resolveAliasedFuncType(
    rctx: import('./types').ResolverContext,
    alias: ComponentAliasInstanceExportType,
    maxDepth: number
): ComponentTypeFunc | undefined {
    if (maxDepth <= 0) return undefined;

    const instance = rctx.indexes.componentInstances[alias.instance_index];

    if (instance.tag === ModelTag.ComponentTypeInstance) {
        const instanceType = instance as ComponentTypeInstance;

        // Register instance-local types in resolvedTypes so that
        // createFunctionLowering can resolve Type(localIdx) references
        registerInstanceLocalTypes(rctx, instanceType);

        // Find the export declaration matching the alias name
        for (const decl of instanceType.declarations) {
            if (decl.tag === ModelTag.InstanceTypeDeclarationExport &&
                decl.name.name === alias.name) {
                if (decl.ty.tag === ModelTag.ComponentTypeRefFunc) {
                    const funcType = findLocalType(instanceType.declarations, decl.ty.value);
                    if (funcType && funcType.tag === ModelTag.ComponentTypeFunc) {
                        return funcType as ComponentTypeFunc;
                    }
                }
            }
        }
    }

    if (instance.tag === ModelTag.ComponentInstanceFromExports) {
        // The instance is a bag of exports. Find the export matching our name
        // and trace through it if it's a function alias.
        for (const exp of instance.exports) {
            if (exp.name.name === alias.name && exp.kind === ComponentExternalKind.Func) {
                const targetFunc = rctx.indexes.componentFunctions[exp.index];
                if (targetFunc) {
                    // Recurse: the target may be a CanonicalFunctionLift (terminal)
                    // or another ComponentAliasInstanceExport (chain continues)
                    return resolveLoweredFuncType(rctx, targetFunc);
                }
            }
        }
    }

    // Fallback: try resolvedTypes map
    const typeIndex = alias.selfSortIndex;
    if (typeIndex !== undefined) {
        const resolved = rctx.resolvedTypes.get(typeIndex as ComponentTypeIndex);
        if (resolved && resolved.tag === ModelTag.ComponentTypeFunc) {
            return resolved;
        }
    }

    return undefined;
}

/**
 * Find the Nth type-creating declaration in an instance's declarations.
 * Type-creating declarations are: InstanceTypeDeclarationType, InstanceTypeDeclarationAlias,
 * and InstanceTypeDeclarationExport with a Type bound (SubResource or Eq).
 */
function findLocalType(declarations: InstanceTypeDeclaration[], localTypeIndex: number): import('../model/types').ComponentType | undefined {
    let typeIdx = 0;
    for (const decl of declarations) {
        if (isTypeCreatingDeclaration(decl)) {
            if (typeIdx === localTypeIndex) {
                if (decl.tag === ModelTag.InstanceTypeDeclarationType) {
                    return decl.value;
                }
                // For export or alias type-creating declarations, we don't have a direct
                // ComponentType object, but the local type is registered in resolvedTypes
                return undefined;
            }
            typeIdx++;
        }
    }
    return undefined;
}

/**
 * Check if an instance type declaration creates a local type index entry.
 */
function isTypeCreatingDeclaration(decl: InstanceTypeDeclaration): boolean {
    switch (decl.tag) {
        case ModelTag.InstanceTypeDeclarationType:
            return true;
        case ModelTag.InstanceTypeDeclarationAlias:
            return true;
        case ModelTag.InstanceTypeDeclarationExport:
            // Exports with type bounds (Type(SubResource), Type(Eq(N))) create type entries
            return decl.ty.tag === ModelTag.ComponentTypeRefType;
        case ModelTag.InstanceTypeDeclarationCoreType:
            return false;
        default:
            return false;
    }
}

/**
 * Register instance-local types in rctx.resolvedTypes so that resolveValType
 * can resolve Type(localIdx) references within function types from this instance.
 *
 * Instance type declarations create a local type index space. Function types
 * inside the instance reference these local indices. Since the resolver processes
 * one CanonicalFunctionLower at a time, we register the current instance's types
 * at their local indices. This overwrites any previous instance's types at the
 * same indices, which is fine because the function type's lifters/lowerers
 * are fully created before the next function is processed.
 */
function registerInstanceLocalTypes(rctx: import('./types').ResolverContext, instance: ComponentTypeInstance): void {
    const localTypes: (ResolvedType | undefined)[] = [];
    let localTypeIdx = 0;

    for (const decl of instance.declarations) {
        if (!isTypeCreatingDeclaration(decl)) {
            continue;
        }

        let resolved: ResolvedType | undefined;

        switch (decl.tag) {
            case ModelTag.InstanceTypeDeclarationType: {
                // Direct type definition (Record, Variant, Borrow, Own, List, etc.)
                const value = decl.value;
                switch (value.tag) {
                    case ModelTag.ComponentTypeDefinedRecord:
                    case ModelTag.ComponentTypeDefinedVariant:
                    case ModelTag.ComponentTypeDefinedList:
                    case ModelTag.ComponentTypeDefinedTuple:
                    case ModelTag.ComponentTypeDefinedFlags:
                    case ModelTag.ComponentTypeDefinedEnum:
                    case ModelTag.ComponentTypeDefinedOption:
                    case ModelTag.ComponentTypeDefinedResult:
                    case ModelTag.ComponentTypeDefinedOwn:
                    case ModelTag.ComponentTypeDefinedBorrow:
                    case ModelTag.ComponentTypeDefinedPrimitive:
                    case ModelTag.ComponentTypeFunc:
                        resolved = value;
                        break;
                    default:
                        // ComponentTypeInstance, ComponentTypeComponent, etc. — skip
                        break;
                }
                break;
            }
            case ModelTag.InstanceTypeDeclarationAlias: {
                const alias = decl.value;
                if (alias.tag === ModelTag.ComponentAliasOuter) {
                    // Outer alias: look up the referenced type in the outer scope's resolvedTypes
                    const outerResolved = rctx.resolvedTypes.get(alias.index as ComponentTypeIndex);
                    if (outerResolved) {
                        resolved = outerResolved;
                    }
                }
                break;
            }
            case ModelTag.InstanceTypeDeclarationExport: {
                // Export with type bound
                if (decl.ty.tag === ModelTag.ComponentTypeRefType) {
                    if (decl.ty.value.tag === ModelTag.TypeBoundsEq) {
                        // Eq(N) → same type as local type N
                        const eqIdx = decl.ty.value.value;
                        resolved = localTypes[eqIdx];
                    }
                    // SubResource → resource marker, not directly resolvable as a value type
                    // Skip — Borrow/Own types handle resource references
                }
                break;
            }
        }

        localTypes.push(resolved);
        if (resolved) {
            rctx.resolvedTypes.set(localTypeIdx as ComponentTypeIndex, resolved);
        }
        localTypeIdx++;
    }
}

/**
 * resource.drop — produces a core function that drops a resource handle.
 * The core module calls this to release an imported resource (e.g. output-stream).
 */
export const resolveCanonicalFunctionResourceDrop: Resolver<CanonicalFunctionResourceDrop> = (rctx, rargs) => {
    const elem = rargs.element;
    const resourceTypeIdx = elem.resource;

    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (bctx, bargs): Promise<BinderRes> => {
            const dropFn = (handle: number) => {
                bctx.resources.remove(resourceTypeIdx, handle);
            };
            return { result: dropFn };
        }, `resource.drop:${elem.selfSortIndex}`)
    };
};

/**
 * resource.new — produces a core function that creates a new resource handle.
 * The core module calls this to create an owned handle to a resource.
 */
export const resolveCanonicalFunctionResourceNew: Resolver<CanonicalFunctionResourceNew> = (rctx, rargs) => {
    const elem = rargs.element;
    const resourceTypeIdx = elem.resource;

    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (bctx, bargs): Promise<BinderRes> => {
            const newFn = (rep: number) => {
                return bctx.resources.add(resourceTypeIdx, rep);
            };
            return { result: newFn };
        }, `resource.new:${elem.selfSortIndex}`)
    };
};

/**
 * resource.rep — produces a core function that returns the i32 representation of a resource handle.
 */
export const resolveCanonicalFunctionResourceRep: Resolver<CanonicalFunctionResourceRep> = (rctx, rargs) => {
    const elem = rargs.element;
    const resourceTypeIdx = elem.resource;

    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (bctx, bargs): Promise<BinderRes> => {
            const repFn = (handle: number) => {
                return bctx.resources.get(resourceTypeIdx, handle);
            };
            return { result: repFn };
        }, `resource.rep:${elem.selfSortIndex}`)
    };
};
