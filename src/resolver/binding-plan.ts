// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import isDebug from 'env:isDebug';
import { LogLevel } from '../utils/assert';
import { planOpKindName } from '../utils/debug-names';
import { JsImports, WasmComponentInstance } from './api-types';
import { createBindingContext } from './context';
import { BinderArgs, BindingContext, ResolvedContext, ResolverRes } from './types';
import { EXPORTS, ABORT } from '../utils/constants';

export const enum PlanOpKind {
    CoreInstantiate,
    ImportBind,
    ExportBind,
}

export const PlanOpKind_Count = PlanOpKind.ExportBind + 1;

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
    resolved: ResolvedContext,
    componentImports?: JsImports,
): Promise<WasmComponentInstance<TJSExports>> {
    componentImports = componentImports ?? {};
    const ctx: BindingContext = createBindingContext(componentImports, resolved);

    const imports = {};
    const exports = {};

    // Partition plan into phases by kind
    const importOps = plan.filter(op => op.kind === PlanOpKind.ImportBind);
    const coreOps = plan.filter(op => op.kind === PlanOpKind.CoreInstantiate);
    const exportOps = plan.filter(op => op.kind === PlanOpKind.ExportBind);

    // Phase 1: ImportBind — independent, run in parallel
    await Promise.all(importOps.map(async (op) => {
        if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Detailed) {
            ctx.logger!('executor', LogLevel.Detailed, `executing ${planOpKindName(op.kind)}: ${op.label}`);
        }
        const args: BinderArgs = { imports: componentImports };
        if (isDebug) args.debugStack = [];
        const result = await op.resolution.binder(ctx, args);
        Object.assign(imports, result.result as object);
    }));

    // Phase 2: CoreInstantiate — may have inter-dependencies, run sequentially
    for (const op of coreOps) {
        if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Detailed) {
            ctx.logger!('executor', LogLevel.Detailed, `executing ${planOpKindName(op.kind)}: ${op.label}`);
        }
        const args: BinderArgs = {};
        if (isDebug) args.debugStack = [];
        await op.resolution.binder(ctx, args);
    }

    // Phase 3: ExportBind — independent, run in parallel
    await Promise.all(exportOps.map(async (op) => {
        if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Detailed) {
            ctx.logger!('executor', LogLevel.Detailed, `executing ${planOpKindName(op.kind)}: ${op.label}`);
        }
        const args: BinderArgs = {};
        if (isDebug) args.debugStack = [];
        const result = await op.resolution.binder(ctx, args);
        Object.assign(exports, result.result as object);
    }));

    return {
        [EXPORTS]: exports,
        [ABORT]: ctx.abort,
    } as any as WasmComponentInstance<TJSExports>;
}
