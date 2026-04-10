import { isDebug } from '../utils/assert';
import { JsImports, WasmComponentInstance } from './api-types';
import { createBindingContext } from './context';
import { BinderArgs, BindingContext, ResolverRes } from './types';

export const enum PlanOpKind {
    CoreInstantiate,
    ImportBind,
    ExportBind,
}

export type PlanOp =
    | CoreInstantiateOp
    | ImportBindOp
    | ExportBindOp

export type CoreInstantiateOp = {
    kind: PlanOpKind.CoreInstantiate;
    resolution: ResolverRes;
    label: string;
}

export type ImportBindOp = {
    kind: PlanOpKind.ImportBind;
    resolution: ResolverRes;
    label: string;
}

export type ExportBindOp = {
    kind: PlanOpKind.ExportBind;
    resolution: ResolverRes;
    label: string;
}

export async function executePlan<TJSExports>(
    plan: PlanOp[],
    componentImports?: JsImports,
): Promise<WasmComponentInstance<TJSExports>> {
    componentImports = componentImports ?? {};
    const ctx: BindingContext = createBindingContext(componentImports);

    const imports = {};
    const exports = {};

    // Partition plan into phases by kind
    const importOps = plan.filter(op => op.kind === PlanOpKind.ImportBind);
    const coreOps = plan.filter(op => op.kind === PlanOpKind.CoreInstantiate);
    const exportOps = plan.filter(op => op.kind === PlanOpKind.ExportBind);

    // Phase 1: ImportBind — independent, run in parallel
    await Promise.all(importOps.map(async (op) => {
        const args: BinderArgs = { imports: componentImports };
        if (isDebug) args.debugStack = [];
        const result = await op.resolution.binder(ctx, args);
        Object.assign(imports, result.result as object);
    }));

    // Phase 2: CoreInstantiate — may have inter-dependencies, run sequentially
    for (const op of coreOps) {
        const args: BinderArgs = {};
        if (isDebug) args.debugStack = [];
        await op.resolution.binder(ctx, args);
    }

    // Phase 3: ExportBind — independent, run in parallel
    await Promise.all(exportOps.map(async (op) => {
        const args: BinderArgs = {};
        if (isDebug) args.debugStack = [];
        const result = await op.resolution.binder(ctx, args);
        Object.assign(exports, result.result as object);
    }));

    return {
        exports,
        abort: ctx.abort,
    } as any as WasmComponentInstance<TJSExports>;
}
