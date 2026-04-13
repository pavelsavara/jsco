// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { ComponentExport, ComponentExternalKind } from '../model/exports';
import { ComponentImport } from '../model/imports';
import { ModelTag } from '../model/tags';
import { ComponentFuncType, ComponentValType } from '../model/types';
import type { ResolverContext } from './types';

const kindToTypeRefTag: Record<ComponentExternalKind, ModelTag | undefined> = {
    [ComponentExternalKind.Module]: ModelTag.ComponentTypeRefModule,
    [ComponentExternalKind.Func]: ModelTag.ComponentTypeRefFunc,
    [ComponentExternalKind.Value]: ModelTag.ComponentTypeRefValue,
    [ComponentExternalKind.Type]: ModelTag.ComponentTypeRefType,
    [ComponentExternalKind.Instance]: ModelTag.ComponentTypeRefInstance,
    [ComponentExternalKind.Component]: ModelTag.ComponentTypeRefComponent,
};

export function validateExportType(rctx: ResolverContext, componentExport: ComponentExport): void {
    const ty = componentExport.ty;
    if (!ty) return;

    // 1. Kind consistency: export kind must match type ref kind
    const expectedTag = kindToTypeRefTag[componentExport.kind];
    if (expectedTag !== undefined && ty.tag !== expectedTag) {
        throw new Error(
            `Export '${componentExport.name.name}': kind ${componentExport.kind} ` +
            `expects type ref ${expectedTag}, got ${ty.tag}`
        );
    }

    // 2. For function exports: validate the declared type is a ComponentTypeFunc
    //    and structurally matches the exported function's type
    if (ty.tag === ModelTag.ComponentTypeRefFunc) {
        validateExportFuncType(rctx, componentExport, ty.value);
    }

    // 3. For instance exports: validate the declared type is a ComponentTypeInstance
    if (ty.tag === ModelTag.ComponentTypeRefInstance) {
        const declaredType = rctx.indexes.componentTypes[ty.value];
        // Skip if index refers to a section-local type space
        if (declaredType && declaredType.tag !== ModelTag.ComponentTypeInstance) {
            throw new Error(
                `Export '${componentExport.name.name}': type index ${ty.value} ` +
                `does not resolve to an instance type (got ${declaredType.tag})`
            );
        }
    }
}

function validateExportFuncType(rctx: ResolverContext, componentExport: ComponentExport, declaredTypeIndex: number): void {
    const declaredType = rctx.indexes.componentTypes[declaredTypeIndex];
    // Type index may refer to a section-local type space (nested component).
    // If the index is out of range for the global type array, skip validation.
    if (!declaredType) return;
    if (declaredType.tag !== ModelTag.ComponentTypeFunc) {
        throw new Error(
            `Export '${componentExport.name.name}': type index ${declaredTypeIndex} ` +
            `does not resolve to a function type (got ${declaredType.tag})`
        );
    }

    // Resolve the actual function to find its type_index (only for CanonicalFunctionLift)
    const func = rctx.indexes.componentFunctions[componentExport.index];
    if (!func || func.tag !== ModelTag.CanonicalFunctionLift) return;

    const actualType = rctx.indexes.componentTypes[func.type_index];
    if (!actualType || actualType.tag !== ModelTag.ComponentTypeFunc) return;

    // If they reference the same type index, no structural check needed
    if (declaredTypeIndex === func.type_index) return;

    // Structural comparison of parameter and result types
    compareFuncTypes(componentExport.name.name, declaredType, actualType);
}

function compareFuncTypes(name: string, declared: ComponentFuncType, actual: ComponentFuncType): void {
    // Compare parameter count
    if (declared.params.length !== actual.params.length) {
        throw new Error(
            `Export '${name}': declared type has ${declared.params.length} params, ` +
            `actual has ${actual.params.length}`
        );
    }

    // Compare parameter types
    for (let i = 0; i < declared.params.length; i++) {
        if (!valTypesEqual(declared.params[i].type, actual.params[i].type)) {
            throw new Error(
                `Export '${name}': param ${i} ('${declared.params[i].name}') type mismatch`
            );
        }
    }

    // Compare result types
    if (declared.results.tag !== actual.results.tag) {
        throw new Error(
            `Export '${name}': result kind mismatch (${declared.results.tag} vs ${actual.results.tag})`
        );
    }

    if (declared.results.tag === ModelTag.ComponentFuncResultUnnamed) {
        const actualResults = actual.results as typeof declared.results;
        if (!valTypesEqual(declared.results.type, actualResults.type)) {
            throw new Error(`Export '${name}': result type mismatch`);
        }
    } else if (declared.results.tag === ModelTag.ComponentFuncResultNamed) {
        const actualResults = actual.results as typeof declared.results;
        if (declared.results.values.length !== actualResults.values.length) {
            throw new Error(
                `Export '${name}': declared type has ${declared.results.values.length} result values, ` +
                `actual has ${actualResults.values.length}`
            );
        }
        for (let i = 0; i < declared.results.values.length; i++) {
            if (!valTypesEqual(declared.results.values[i].type, actualResults.values[i].type)) {
                throw new Error(
                    `Export '${name}': result ${i} ('${declared.results.values[i].name}') type mismatch`
                );
            }
        }
    }
}

function valTypesEqual(a: ComponentValType, b: ComponentValType): boolean {
    if (a.tag !== b.tag) return false;
    if (a.tag === ModelTag.ComponentValTypePrimitive && b.tag === ModelTag.ComponentValTypePrimitive) {
        return a.value === b.value;
    }
    if (a.tag === ModelTag.ComponentValTypeType && b.tag === ModelTag.ComponentValTypeType) {
        return a.value === b.value;
    }
    if (a.tag === ModelTag.ComponentValTypeResolved && b.tag === ModelTag.ComponentValTypeResolved) {
        return a.resolved === b.resolved;
    }
    return false;
}

export function validateImportType(rctx: ResolverContext, componentImport: ComponentImport): void {
    const ty = componentImport.ty;

    switch (ty.tag) {
        case ModelTag.ComponentTypeRefFunc: {
            const declaredType = rctx.indexes.componentTypes[ty.value];
            if (declaredType && declaredType.tag !== ModelTag.ComponentTypeFunc) {
                throw new Error(
                    `Import '${componentImport.name.name}': type index ${ty.value} ` +
                    `does not resolve to a function type (got ${declaredType.tag})`
                );
            }
            break;
        }
        case ModelTag.ComponentTypeRefInstance: {
            const declaredType = rctx.indexes.componentTypes[ty.value];
            if (declaredType && declaredType.tag !== ModelTag.ComponentTypeInstance) {
                throw new Error(
                    `Import '${componentImport.name.name}': type index ${ty.value} ` +
                    `does not resolve to an instance type (got ${declaredType.tag})`
                );
            }
            break;
        }
        case ModelTag.ComponentTypeRefComponent:
        case ModelTag.ComponentTypeRefType:
        case ModelTag.ComponentTypeRefModule:
        case ModelTag.ComponentTypeRefValue:
            // No additional validation for these kinds
            break;
    }
}
