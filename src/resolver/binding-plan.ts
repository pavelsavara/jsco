import { isDebug } from '../utils/assert';
import { JsImports, WasmComponentInstance } from './api-types';
import { createBindingContext } from './context';
import { BinderArgs, BindingContext, ResolverContext, ResolverRes } from './types';

export const enum PlanOpKind {
    CoreInstantiate = 'CoreInstantiate',
    ImportBind = 'ImportBind',
    ExportBind = 'ExportBind',
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
    rctx: ResolverContext,
    plan: PlanOp[],
    componentImports?: JsImports,
): Promise<WasmComponentInstance<TJSExports>> {
    componentImports = componentImports ?? {};
    const ctx: BindingContext = createBindingContext(rctx, componentImports);

    const imports = {};
    const exports = {};

    for (const op of plan) {
        const args: BinderArgs = {};
        if (isDebug) args.debugStack = [];

        switch (op.kind) {
            case PlanOpKind.ImportBind: {
                args.imports = componentImports;
                const result = await op.resolution.binder(ctx, args);
                Object.assign(imports, result.result as object);
                break;
            }
            case PlanOpKind.ExportBind: {
                const result = await op.resolution.binder(ctx, args);
                Object.assign(exports, result.result as object);
                break;
            }
            case PlanOpKind.CoreInstantiate: {
                await op.resolution.binder(ctx, args);
                break;
            }
        }
    }

    return {
        exports,
        abort: ctx.abort,
    } as any as WasmComponentInstance<TJSExports>;
}
