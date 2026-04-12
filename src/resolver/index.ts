import { parse } from '../parser';
import { ParserOptions } from '../parser/types';
import { isDebug, LogLevel } from '../utils/assert';
import { planOpKindName, modelTagName } from '../utils/debug-names';
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

    if (isDebug && (rctx.resolved.verbose?.resolver ?? 0) >= LogLevel.Summary) {
        const ix = rctx.indexes;
        const lines = [
            'Index spaces populated:',
            `  coreModules:      ${ix.coreModules.length}`,
            `  coreInstances:    ${ix.coreInstances.length}  [${ix.coreInstances.map(i => modelTagName(i.tag)).join(', ')}]`,
            `  coreFunctions:    ${ix.coreFunctions.length}`,
            `  coreMemories:     ${ix.coreMemories.length}`,
            `  componentImports: ${ix.componentImports.length}  [${ix.componentImports.map(i => `"${i.name.name}"`).join(', ')}]`,
            `  componentExports: ${ix.componentExports.length}  [${ix.componentExports.map(e => `"${e.name.name}"`).join(', ')}]`,
            `  componentTypes:   ${ix.componentTypes.length}`,
            `  componentFunctions: ${ix.componentFunctions.length}`,
            `  componentInstances: ${ix.componentInstances.length}`,
            `  componentSections:  ${ix.componentSections.length}`,
            `  resolvedTypes:    ${rctx.resolved.resolvedTypes.size} entries`,
            `  canonicalResourceIds: ${rctx.resolved.canonicalResourceIds.size} entries`,
        ];
        rctx.resolved.logger!('resolver', LogLevel.Summary, lines.join('\n'));
    }

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

    if (isDebug && (rctx.resolved.verbose?.resolver ?? 0) >= LogLevel.Summary) {
        const lines = [`Plan (${sortedPlan.length} ops):`];
        for (let i = 0; i < sortedPlan.length; i++) {
            const op = sortedPlan[i];
            lines.push(`  ${i + 1}. ${planOpKindName(op.kind).padEnd(16)} ${op.label}`);
        }
        lines.push('');
        lines.push(`Resolution stats: resolveComponentSection=${rctx.resolved.stats!.resolveComponentSection} resolveComponentInstanceInstantiate=${rctx.resolved.stats!.resolveComponentInstanceInstantiate} createScopedResolverContext=${rctx.resolved.stats!.createScopedResolverContext} cacheHits=${rctx.resolved.stats!.componentSectionCacheHits} instanceCacheHits=${rctx.resolved.stats!.componentInstanceCacheHits} coreInstanceCacheHits=${rctx.resolved.stats!.coreInstanceCacheHits} coreFuncCacheHits=${rctx.resolved.stats!.coreFunctionCacheHits} compFuncCacheHits=${rctx.resolved.stats!.componentFunctionCacheHits}`);
        rctx.resolved.logger!('resolver', LogLevel.Summary, lines.join('\n'));
    }

    // Free the large indexes structure — no longer needed after resolution.
    // Binder closures capture rctx.resolved (ResolvedContext) — a separate object
    // from rctx, so rctx itself (with indexes, importToInstanceIndex, etc.) is GC-eligible.
    // The innermost trampoline closures don't capture resolved at all — they pre-capture
    // only stringEncoding (number) and canonicalResourceIds (Map) values.
    rctx.indexes = null!;

    const resolved = rctx.resolved;
    let firstInstantiation = true;
    const component: WasmComponent<TJSExports> = {
        instantiate: async (imports) => {
            const result = await executePlan<TJSExports>(sortedPlan, resolved, imports);
            if (firstInstantiation) {
                firstInstantiation = false;
                // After first instantiation all memoize factories have run.
                // Null heavy maps — lift/lower caches still serve cached lifters/lowerers.
                resolved.resolvedTypes = null!;
                resolved.canonicalResourceIds = null!;
            }
            return result;
        },
        plan: sortedPlan,
        stats: isDebug ? { ...rctx.resolved.stats! } : undefined,
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