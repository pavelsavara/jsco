import { ComponentImport } from '../model/imports';
import { ModelTag } from '../model/tags';
import { jsco_assert } from '../utils/assert';
import { lookupComponentInstance } from './component-instances';
import { JsImports } from './api-types';
import { Resolver, BinderRes } from './types';

/**
 * Resolve an import name from the JS imports object.
 * Handles both direct keys and namespaced names with '#' separators
 * (e.g., 'wasi:cli/stdin#get-stdin' → imports['wasi:cli/stdin']['get-stdin']).
 */
function resolveImportByName(imports: JsImports | undefined, name: string): unknown {
    if (!imports) return undefined;

    // Direct lookup
    if (name in imports) return imports[name];

    // For namespaced names like 'wasi:cli/stdin#get-stdin', split on '#'
    if (name.includes('#')) {
        const hashIdx = name.indexOf('#');
        const namespace = name.substring(0, hashIdx);
        const funcName = name.substring(hashIdx + 1);
        const ns = imports[namespace];
        if (ns && typeof ns === 'object') {
            return (ns as Record<string, unknown>)[funcName];
        }
    }

    return undefined;
}

export const resolveComponentImport: Resolver<ComponentImport> = (rctx, rargs) => {
    const componentImport = rargs.element;
    jsco_assert(componentImport && componentImport.tag == ModelTag.ComponentImport, () => `Wrong element type '${componentImport?.tag}'`);

    switch (componentImport.ty.tag) {
        case ModelTag.ComponentTypeRefComponent: {
            return {
                callerElement: rargs.callerElement,
                element: componentImport,
                binder: async (bctx, bargs) => {
                    // The import's selfSortIndex within componentImports currently aligns with
                    // the component instance index space because the parser inserts a matching
                    // ComponentTypeInstance into componentInstances at the same position.
                    // TODO: For multi-import components, verify this alignment holds or compute
                    // the correct unified instance index from the import's position in the
                    // component instance index space (imports first, then local instances).
                    const binderResult = lookupComponentInstance(bctx, componentImport.selfSortIndex!);
                    const imprt = bargs.imports?.[componentImport.name.name];
                    // Imported functions are "exports" of this instance from the
                    // Component Model perspective — ComponentAliasInstanceExport reads from .exports
                    Object.assign(binderResult.result.exports, imprt);
                    return binderResult;
                }
            };
        }
        case ModelTag.ComponentTypeRefFunc: {
            // Function import: the component imports a function directly (not through an instance).
            // The JS imports object should have the function at the import name key.
            // TODO: When the index space unification is implemented (imports contributing to
            // componentFunctions), CanonicalFunctionLower will be able to reference this
            // function by its component function index.
            return {
                callerElement: rargs.callerElement,
                element: componentImport,
                binder: async (bctx, bargs) => {
                    const importName = componentImport.name.name;
                    const imprt = resolveImportByName(bargs.imports, importName);

                    const binderResult: BinderRes = {
                        result: imprt
                    };
                    return binderResult;
                }
            };
        }
        case ModelTag.ComponentTypeRefType:
        case ModelTag.ComponentTypeRefInstance: {
            // Type and instance imports: declarations that establish type information.
            // The actual wiring happens through other mechanisms (aliases, instantiation args).
            return {
                callerElement: rargs.callerElement,
                element: componentImport,
                binder: async (_bctx, _bargs) => {
                    const binderResult: BinderRes = {
                        result: undefined
                    };
                    return binderResult;
                }
            };
        }
        default:
            throw new Error(`${componentImport.ty.tag} not implemented`);

    }
};