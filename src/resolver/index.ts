import { parse } from '../parser';
import { ParserOptions } from '../parser/types';
import { JsImports, WasmComponentInstance, WasmComponent } from './api-types';
import { PlanOp, PlanOpKind, executePlan } from './binding-plan';
import { resolveComponentExport } from './component-exports';
import { resolveComponentImport } from './component-imports';
import { createResolverContext } from './context';
import { resolveCoreInstance } from './core-instance';
import { ComponentFactoryInput, ComponentFactoryOptions, ResolverContext } from './types';

export async function instantiateComponent<TJSExports>(
    modelOrComponentOrUrl: ComponentFactoryInput,
    imports?: JsImports,
    options?: ComponentFactoryOptions & ParserOptions,
): Promise<WasmComponentInstance<TJSExports>> {
    let input = modelOrComponentOrUrl as any;
    if (typeof input !== 'object' || (Array.isArray(input) && input.length != 0 && typeof input[0] !== 'object')) {
        input = await parse(input, options ?? {});
    }
    const component = await createComponent<TJSExports>(input, options);
    return component.instantiate(imports);
}

export async function createComponent<TJSExports>(modelOrComponentOrUrl: ComponentFactoryInput, options?: ComponentFactoryOptions & ParserOptions): Promise<WasmComponent<TJSExports>> {
    let input = modelOrComponentOrUrl as any;
    if (typeof input !== 'object' || (Array.isArray(input) && input.length != 0 && typeof input[0] !== 'object')) {
        input = await parse(input, options ?? {});
    }

    const rctx: ResolverContext = createResolverContext(input, options ?? {});

    // Module compilation (via compileStreaming) was kicked off during parsing.
    // No need to await here — the compiled module is only needed at instantiation
    // time in resolveCoreModule.binder, allowing compilation to overlap with
    // resolution and import binding.

    // Build the binding plan — an inspectable IR of operations
    const plan: PlanOp[] = [];

    // Resolve core instances (resolution phase only — execution deferred to plan)
    for (const coreInstance of rctx.indexes.coreInstances) {
        const resolution = resolveCoreInstance(rctx, { element: coreInstance, callerElement: undefined });
        plan.push({
            kind: PlanOpKind.CoreInstantiate,
            resolution,
            label: `CoreInstance:${coreInstance.tag}:${coreInstance.selfSortIndex}`,
        });
    }

    // Resolve component imports
    for (const componentImport of rctx.indexes.componentImports) {
        const resolution = resolveComponentImport(rctx, { element: componentImport, callerElement: undefined });
        plan.push({
            kind: PlanOpKind.ImportBind,
            resolution,
            label: `Import:${componentImport.name.name}`,
        });
    }

    // Resolve component exports
    for (const componentExport of rctx.indexes.componentExports) {
        const resolution = resolveComponentExport(rctx, { element: componentExport, callerElement: undefined });
        plan.push({
            kind: PlanOpKind.ExportBind,
            resolution,
            label: `Export:${componentExport.name.name}`,
        });
    }

    // Sort plan into execution order: imports → exports → core instances
    // This preserves the original execution semantics where core instances
    // are instantiated last ("magic" — some core instances like $imports
    // are not exported but still needed)
    const sortedPlan = sortPlanForExecution(plan);

    // Free the large indexes structure — no longer needed after resolution.
    // rctx.resolvedTypes and rctx.memoizeCache are still captured by binder
    // closures (createLifting/createLowering use them at bind time).
    // The innermost trampoline closures no longer capture rctx — they pre-capture
    // only stringEncoding (number) and canonicalResourceIds (Map).
    rctx.indexes = null!;

    const component: WasmComponent<TJSExports> = {
        instantiate: (imports) => executePlan(sortedPlan, imports),
        plan: sortedPlan,
    };
    return component;
}

const executionOrder: Record<PlanOpKind, number> = {
    [PlanOpKind.ImportBind]: 0,
    [PlanOpKind.CoreInstantiate]: 1,
    [PlanOpKind.ExportBind]: 2,
};

function sortPlanForExecution(plan: PlanOp[]): PlanOp[] {
    return [...plan].sort((a, b) => executionOrder[a.kind] - executionOrder[b.kind]);
}