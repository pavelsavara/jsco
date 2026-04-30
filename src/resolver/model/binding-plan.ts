// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { ResolverRes } from './types';

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
