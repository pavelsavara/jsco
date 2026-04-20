// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { ModelTag, ModelTag_Count } from '../parser/model/tags';
import { PrimitiveValType, PrimitiveValType_Count } from '../parser/model/types';
import { CallingConvention, CallingConvention_Count } from '../resolver/calling-convention';
import { PlanOpKind, PlanOpKind_Count } from '../resolver/binding-plan';
import { jsco_assert, registerInitDebugNames } from './assert';

// nameOf: compile-time checks that the string is a valid member name of the enum
const nameOf = <T extends object>(key: keyof T & string): string => key;

// Name tables — populated only in debug builds
let _modelTagNames: string[] | null = null;
let _primitiveValTypeNames: string[] | null = null;
let _callingConventionNames: string[] | null = null;
let _planOpKindNames: string[] | null = null;

export function modelTagName(tag: ModelTag): string {
    if (_modelTagNames === null) return `ModelTag(${tag})`;
    return _modelTagNames[tag] ?? `ModelTag(${tag})`;
}

export function primitiveValTypeName(t: PrimitiveValType): string {
    if (_primitiveValTypeNames === null) return `PrimitiveValType(${t})`;
    return _primitiveValTypeNames[t] ?? `PrimitiveValType(${t})`;
}

export function callingConventionName(cc: CallingConvention): string {
    if (_callingConventionNames === null) return `CallingConvention(${cc})`;
    return _callingConventionNames[cc] ?? `CallingConvention(${cc})`;
}

export function planOpKindName(kind: PlanOpKind): string {
    if (_planOpKindNames === null) return `PlanOpKind(${kind})`;
    return _planOpKindNames[kind] ?? `PlanOpKind(${kind})`;
}

function initDebugNames(): void {
    // --- ModelTag ---
    _modelTagNames = [];
    _modelTagNames[ModelTag.Model] = nameOf<typeof ModelTag>('Model');
    _modelTagNames[ModelTag.ModelElement] = nameOf<typeof ModelTag>('ModelElement');
    _modelTagNames[ModelTag.CustomSection] = nameOf<typeof ModelTag>('CustomSection');
    _modelTagNames[ModelTag.CoreModule] = nameOf<typeof ModelTag>('CoreModule');
    _modelTagNames[ModelTag.SkippedSection] = nameOf<typeof ModelTag>('SkippedSection');
    _modelTagNames[ModelTag.ComponentSection] = nameOf<typeof ModelTag>('ComponentSection');
    _modelTagNames[ModelTag.ComponentStartFunction] = nameOf<typeof ModelTag>('ComponentStartFunction');
    _modelTagNames[ModelTag.ComponentImport] = nameOf<typeof ModelTag>('ComponentImport');
    _modelTagNames[ModelTag.ComponentExport] = nameOf<typeof ModelTag>('ComponentExport');
    _modelTagNames[ModelTag.ComponentAliasCoreInstanceExport] = nameOf<typeof ModelTag>('ComponentAliasCoreInstanceExport');
    _modelTagNames[ModelTag.ComponentAliasInstanceExport] = nameOf<typeof ModelTag>('ComponentAliasInstanceExport');
    _modelTagNames[ModelTag.ComponentAliasOuter] = nameOf<typeof ModelTag>('ComponentAliasOuter');
    _modelTagNames[ModelTag.ComponentInstanceFromExports] = nameOf<typeof ModelTag>('ComponentInstanceFromExports');
    _modelTagNames[ModelTag.ComponentInstanceInstantiate] = nameOf<typeof ModelTag>('ComponentInstanceInstantiate');
    _modelTagNames[ModelTag.CoreInstanceFromExports] = nameOf<typeof ModelTag>('CoreInstanceFromExports');
    _modelTagNames[ModelTag.CoreInstanceInstantiate] = nameOf<typeof ModelTag>('CoreInstanceInstantiate');
    _modelTagNames[ModelTag.CanonicalFunctionLift] = nameOf<typeof ModelTag>('CanonicalFunctionLift');
    _modelTagNames[ModelTag.CanonicalFunctionLower] = nameOf<typeof ModelTag>('CanonicalFunctionLower');
    _modelTagNames[ModelTag.CanonicalFunctionResourceDrop] = nameOf<typeof ModelTag>('CanonicalFunctionResourceDrop');
    _modelTagNames[ModelTag.CanonicalFunctionResourceNew] = nameOf<typeof ModelTag>('CanonicalFunctionResourceNew');
    _modelTagNames[ModelTag.CanonicalFunctionResourceRep] = nameOf<typeof ModelTag>('CanonicalFunctionResourceRep');
    _modelTagNames[ModelTag.CanonicalFunctionBackpressureSet] = nameOf<typeof ModelTag>('CanonicalFunctionBackpressureSet');
    _modelTagNames[ModelTag.CanonicalFunctionBackpressureInc] = nameOf<typeof ModelTag>('CanonicalFunctionBackpressureInc');
    _modelTagNames[ModelTag.CanonicalFunctionBackpressureDec] = nameOf<typeof ModelTag>('CanonicalFunctionBackpressureDec');
    _modelTagNames[ModelTag.CanonicalFunctionTaskReturn] = nameOf<typeof ModelTag>('CanonicalFunctionTaskReturn');
    _modelTagNames[ModelTag.CanonicalFunctionTaskCancel] = nameOf<typeof ModelTag>('CanonicalFunctionTaskCancel');
    _modelTagNames[ModelTag.CanonicalFunctionContextGet] = nameOf<typeof ModelTag>('CanonicalFunctionContextGet');
    _modelTagNames[ModelTag.CanonicalFunctionContextSet] = nameOf<typeof ModelTag>('CanonicalFunctionContextSet');
    _modelTagNames[ModelTag.CanonicalFunctionThreadYield] = nameOf<typeof ModelTag>('CanonicalFunctionThreadYield');
    _modelTagNames[ModelTag.CanonicalFunctionSubtaskCancel] = nameOf<typeof ModelTag>('CanonicalFunctionSubtaskCancel');
    _modelTagNames[ModelTag.CanonicalFunctionSubtaskDrop] = nameOf<typeof ModelTag>('CanonicalFunctionSubtaskDrop');
    _modelTagNames[ModelTag.CanonicalFunctionStreamNew] = nameOf<typeof ModelTag>('CanonicalFunctionStreamNew');
    _modelTagNames[ModelTag.CanonicalFunctionStreamRead] = nameOf<typeof ModelTag>('CanonicalFunctionStreamRead');
    _modelTagNames[ModelTag.CanonicalFunctionStreamWrite] = nameOf<typeof ModelTag>('CanonicalFunctionStreamWrite');
    _modelTagNames[ModelTag.CanonicalFunctionStreamCancelRead] = nameOf<typeof ModelTag>('CanonicalFunctionStreamCancelRead');
    _modelTagNames[ModelTag.CanonicalFunctionStreamCancelWrite] = nameOf<typeof ModelTag>('CanonicalFunctionStreamCancelWrite');
    _modelTagNames[ModelTag.CanonicalFunctionStreamDropReadable] = nameOf<typeof ModelTag>('CanonicalFunctionStreamDropReadable');
    _modelTagNames[ModelTag.CanonicalFunctionStreamDropWritable] = nameOf<typeof ModelTag>('CanonicalFunctionStreamDropWritable');
    _modelTagNames[ModelTag.CanonicalFunctionFutureNew] = nameOf<typeof ModelTag>('CanonicalFunctionFutureNew');
    _modelTagNames[ModelTag.CanonicalFunctionFutureRead] = nameOf<typeof ModelTag>('CanonicalFunctionFutureRead');
    _modelTagNames[ModelTag.CanonicalFunctionFutureWrite] = nameOf<typeof ModelTag>('CanonicalFunctionFutureWrite');
    _modelTagNames[ModelTag.CanonicalFunctionFutureCancelRead] = nameOf<typeof ModelTag>('CanonicalFunctionFutureCancelRead');
    _modelTagNames[ModelTag.CanonicalFunctionFutureCancelWrite] = nameOf<typeof ModelTag>('CanonicalFunctionFutureCancelWrite');
    _modelTagNames[ModelTag.CanonicalFunctionFutureDropReadable] = nameOf<typeof ModelTag>('CanonicalFunctionFutureDropReadable');
    _modelTagNames[ModelTag.CanonicalFunctionFutureDropWritable] = nameOf<typeof ModelTag>('CanonicalFunctionFutureDropWritable');
    _modelTagNames[ModelTag.CanonicalFunctionErrorContextNew] = nameOf<typeof ModelTag>('CanonicalFunctionErrorContextNew');
    _modelTagNames[ModelTag.CanonicalFunctionErrorContextDebugMessage] = nameOf<typeof ModelTag>('CanonicalFunctionErrorContextDebugMessage');
    _modelTagNames[ModelTag.CanonicalFunctionErrorContextDrop] = nameOf<typeof ModelTag>('CanonicalFunctionErrorContextDrop');
    _modelTagNames[ModelTag.CanonicalFunctionWaitableSetNew] = nameOf<typeof ModelTag>('CanonicalFunctionWaitableSetNew');
    _modelTagNames[ModelTag.CanonicalFunctionWaitableSetWait] = nameOf<typeof ModelTag>('CanonicalFunctionWaitableSetWait');
    _modelTagNames[ModelTag.CanonicalFunctionWaitableSetPoll] = nameOf<typeof ModelTag>('CanonicalFunctionWaitableSetPoll');
    _modelTagNames[ModelTag.CanonicalFunctionWaitableSetDrop] = nameOf<typeof ModelTag>('CanonicalFunctionWaitableSetDrop');
    _modelTagNames[ModelTag.CanonicalFunctionWaitableJoin] = nameOf<typeof ModelTag>('CanonicalFunctionWaitableJoin');
    _modelTagNames[ModelTag.CanonicalOptionAsync] = nameOf<typeof ModelTag>('CanonicalOptionAsync');
    _modelTagNames[ModelTag.CanonicalOptionCallback] = nameOf<typeof ModelTag>('CanonicalOptionCallback');
    _modelTagNames[ModelTag.CanonicalOptionCompactUTF16] = nameOf<typeof ModelTag>('CanonicalOptionCompactUTF16');
    _modelTagNames[ModelTag.CanonicalOptionMemory] = nameOf<typeof ModelTag>('CanonicalOptionMemory');
    _modelTagNames[ModelTag.CanonicalOptionPostReturn] = nameOf<typeof ModelTag>('CanonicalOptionPostReturn');
    _modelTagNames[ModelTag.CanonicalOptionRealloc] = nameOf<typeof ModelTag>('CanonicalOptionRealloc');
    _modelTagNames[ModelTag.CanonicalOptionUTF16] = nameOf<typeof ModelTag>('CanonicalOptionUTF16');
    _modelTagNames[ModelTag.CanonicalOptionUTF8] = nameOf<typeof ModelTag>('CanonicalOptionUTF8');
    _modelTagNames[ModelTag.ComponentTypeDefinedBorrow] = nameOf<typeof ModelTag>('ComponentTypeDefinedBorrow');
    _modelTagNames[ModelTag.ComponentTypeDefinedEnum] = nameOf<typeof ModelTag>('ComponentTypeDefinedEnum');
    _modelTagNames[ModelTag.ComponentTypeDefinedErrorContext] = nameOf<typeof ModelTag>('ComponentTypeDefinedErrorContext');
    _modelTagNames[ModelTag.ComponentTypeDefinedFlags] = nameOf<typeof ModelTag>('ComponentTypeDefinedFlags');
    _modelTagNames[ModelTag.ComponentTypeDefinedFuture] = nameOf<typeof ModelTag>('ComponentTypeDefinedFuture');
    _modelTagNames[ModelTag.ComponentTypeDefinedList] = nameOf<typeof ModelTag>('ComponentTypeDefinedList');
    _modelTagNames[ModelTag.ComponentTypeDefinedOption] = nameOf<typeof ModelTag>('ComponentTypeDefinedOption');
    _modelTagNames[ModelTag.ComponentTypeDefinedOwn] = nameOf<typeof ModelTag>('ComponentTypeDefinedOwn');
    _modelTagNames[ModelTag.ComponentTypeDefinedPrimitive] = nameOf<typeof ModelTag>('ComponentTypeDefinedPrimitive');
    _modelTagNames[ModelTag.ComponentTypeDefinedRecord] = nameOf<typeof ModelTag>('ComponentTypeDefinedRecord');
    _modelTagNames[ModelTag.ComponentTypeDefinedResult] = nameOf<typeof ModelTag>('ComponentTypeDefinedResult');
    _modelTagNames[ModelTag.ComponentTypeDefinedStream] = nameOf<typeof ModelTag>('ComponentTypeDefinedStream');
    _modelTagNames[ModelTag.ComponentTypeDefinedTuple] = nameOf<typeof ModelTag>('ComponentTypeDefinedTuple');
    _modelTagNames[ModelTag.ComponentTypeDefinedVariant] = nameOf<typeof ModelTag>('ComponentTypeDefinedVariant');
    _modelTagNames[ModelTag.ComponentExternNameInterface] = nameOf<typeof ModelTag>('ComponentExternNameInterface');
    _modelTagNames[ModelTag.ComponentExternNameKebab] = nameOf<typeof ModelTag>('ComponentExternNameKebab');
    _modelTagNames[ModelTag.ComponentFuncResultNamed] = nameOf<typeof ModelTag>('ComponentFuncResultNamed');
    _modelTagNames[ModelTag.ComponentFuncResultUnnamed] = nameOf<typeof ModelTag>('ComponentFuncResultUnnamed');
    _modelTagNames[ModelTag.ComponentNameComponents] = nameOf<typeof ModelTag>('ComponentNameComponents');
    _modelTagNames[ModelTag.ComponentNameCoreFuncs] = nameOf<typeof ModelTag>('ComponentNameCoreFuncs');
    _modelTagNames[ModelTag.ComponentNameCoreGlobals] = nameOf<typeof ModelTag>('ComponentNameCoreGlobals');
    _modelTagNames[ModelTag.ComponentNameCoreInstances] = nameOf<typeof ModelTag>('ComponentNameCoreInstances');
    _modelTagNames[ModelTag.ComponentNameCoreMemories] = nameOf<typeof ModelTag>('ComponentNameCoreMemories');
    _modelTagNames[ModelTag.ComponentNameCoreModules] = nameOf<typeof ModelTag>('ComponentNameCoreModules');
    _modelTagNames[ModelTag.ComponentNameCoreTables] = nameOf<typeof ModelTag>('ComponentNameCoreTables');
    _modelTagNames[ModelTag.ComponentNameCoreTypes] = nameOf<typeof ModelTag>('ComponentNameCoreTypes');
    _modelTagNames[ModelTag.ComponentNameFuncs] = nameOf<typeof ModelTag>('ComponentNameFuncs');
    _modelTagNames[ModelTag.ComponentNameInstances] = nameOf<typeof ModelTag>('ComponentNameInstances');
    _modelTagNames[ModelTag.ComponentNameTypes] = nameOf<typeof ModelTag>('ComponentNameTypes');
    _modelTagNames[ModelTag.ComponentNameValues] = nameOf<typeof ModelTag>('ComponentNameValues');
    _modelTagNames[ModelTag.ComponentTypeComponent] = nameOf<typeof ModelTag>('ComponentTypeComponent');
    _modelTagNames[ModelTag.ComponentTypeDeclarationAlias] = nameOf<typeof ModelTag>('ComponentTypeDeclarationAlias');
    _modelTagNames[ModelTag.ComponentTypeDeclarationExport] = nameOf<typeof ModelTag>('ComponentTypeDeclarationExport');
    _modelTagNames[ModelTag.ComponentTypeDeclarationCoreType] = nameOf<typeof ModelTag>('ComponentTypeDeclarationCoreType');
    _modelTagNames[ModelTag.ComponentTypeDeclarationImport] = nameOf<typeof ModelTag>('ComponentTypeDeclarationImport');
    _modelTagNames[ModelTag.ComponentTypeDeclarationType] = nameOf<typeof ModelTag>('ComponentTypeDeclarationType');
    _modelTagNames[ModelTag.ComponentTypeFunc] = nameOf<typeof ModelTag>('ComponentTypeFunc');
    _modelTagNames[ModelTag.ComponentTypeInstance] = nameOf<typeof ModelTag>('ComponentTypeInstance');
    _modelTagNames[ModelTag.ComponentTypeResource] = nameOf<typeof ModelTag>('ComponentTypeResource');
    _modelTagNames[ModelTag.ComponentValTypePrimitive] = nameOf<typeof ModelTag>('ComponentValTypePrimitive');
    _modelTagNames[ModelTag.ComponentValTypeResolved] = nameOf<typeof ModelTag>('ComponentValTypeResolved');
    _modelTagNames[ModelTag.ComponentValTypeType] = nameOf<typeof ModelTag>('ComponentValTypeType');
    _modelTagNames[ModelTag.CoreTypeFunc] = nameOf<typeof ModelTag>('CoreTypeFunc');
    _modelTagNames[ModelTag.CoreTypeModule] = nameOf<typeof ModelTag>('CoreTypeModule');
    _modelTagNames[ModelTag.InstanceTypeDeclarationAlias] = nameOf<typeof ModelTag>('InstanceTypeDeclarationAlias');
    _modelTagNames[ModelTag.InstanceTypeDeclarationExport] = nameOf<typeof ModelTag>('InstanceTypeDeclarationExport');
    _modelTagNames[ModelTag.InstanceTypeDeclarationCoreType] = nameOf<typeof ModelTag>('InstanceTypeDeclarationCoreType');
    _modelTagNames[ModelTag.InstanceTypeDeclarationType] = nameOf<typeof ModelTag>('InstanceTypeDeclarationType');
    _modelTagNames[ModelTag.InstantiationArgKindInstance] = nameOf<typeof ModelTag>('InstantiationArgKindInstance');
    _modelTagNames[ModelTag.ModuleTypeDeclarationType] = nameOf<typeof ModelTag>('ModuleTypeDeclarationType');
    _modelTagNames[ModelTag.ModuleTypeDeclarationExport] = nameOf<typeof ModelTag>('ModuleTypeDeclarationExport');
    _modelTagNames[ModelTag.ModuleTypeDeclarationOuterAlias] = nameOf<typeof ModelTag>('ModuleTypeDeclarationOuterAlias');
    _modelTagNames[ModelTag.ModuleTypeDeclarationImport] = nameOf<typeof ModelTag>('ModuleTypeDeclarationImport');
    _modelTagNames[ModelTag.OuterAliasKindType] = nameOf<typeof ModelTag>('OuterAliasKindType');
    _modelTagNames[ModelTag.StorageTypeI16] = nameOf<typeof ModelTag>('StorageTypeI16');
    _modelTagNames[ModelTag.StorageTypeI8] = nameOf<typeof ModelTag>('StorageTypeI8');
    _modelTagNames[ModelTag.StorageTypeVal] = nameOf<typeof ModelTag>('StorageTypeVal');
    _modelTagNames[ModelTag.StructuralTypeArray] = nameOf<typeof ModelTag>('StructuralTypeArray');
    _modelTagNames[ModelTag.StructuralTypeFunc] = nameOf<typeof ModelTag>('StructuralTypeFunc');
    _modelTagNames[ModelTag.StructuralTypeStruct] = nameOf<typeof ModelTag>('StructuralTypeStruct');
    _modelTagNames[ModelTag.ComponentTypeRefModule] = nameOf<typeof ModelTag>('ComponentTypeRefModule');
    _modelTagNames[ModelTag.ComponentTypeRefFunc] = nameOf<typeof ModelTag>('ComponentTypeRefFunc');
    _modelTagNames[ModelTag.ComponentTypeRefValue] = nameOf<typeof ModelTag>('ComponentTypeRefValue');
    _modelTagNames[ModelTag.ComponentTypeRefType] = nameOf<typeof ModelTag>('ComponentTypeRefType');
    _modelTagNames[ModelTag.ComponentTypeRefInstance] = nameOf<typeof ModelTag>('ComponentTypeRefInstance');
    _modelTagNames[ModelTag.ComponentTypeRefComponent] = nameOf<typeof ModelTag>('ComponentTypeRefComponent');
    _modelTagNames[ModelTag.TypeBoundsEq] = nameOf<typeof ModelTag>('TypeBoundsEq');
    _modelTagNames[ModelTag.TypeBoundsSubResource] = nameOf<typeof ModelTag>('TypeBoundsSubResource');
    _modelTagNames[ModelTag.TypeRefFunc] = nameOf<typeof ModelTag>('TypeRefFunc');
    _modelTagNames[ModelTag.TypeRefGlobal] = nameOf<typeof ModelTag>('TypeRefGlobal');
    _modelTagNames[ModelTag.TypeRefMemory] = nameOf<typeof ModelTag>('TypeRefMemory');
    _modelTagNames[ModelTag.TypeRefTable] = nameOf<typeof ModelTag>('TypeRefTable');
    _modelTagNames[ModelTag.TypeRefTag] = nameOf<typeof ModelTag>('TypeRefTag');
    _modelTagNames[ModelTag.ValTypeF32] = nameOf<typeof ModelTag>('ValTypeF32');
    _modelTagNames[ModelTag.ValTypeF64] = nameOf<typeof ModelTag>('ValTypeF64');
    _modelTagNames[ModelTag.ValTypeI32] = nameOf<typeof ModelTag>('ValTypeI32');
    _modelTagNames[ModelTag.ValTypeI64] = nameOf<typeof ModelTag>('ValTypeI64');
    _modelTagNames[ModelTag.ValTypeRef] = nameOf<typeof ModelTag>('ValTypeRef');
    _modelTagNames[ModelTag.ValTypeV128] = nameOf<typeof ModelTag>('ValTypeV128');

    jsco_assert(
        _modelTagNames.filter(x => x !== undefined).length === ModelTag_Count,
        () => `ModelTag name count mismatch: have ${_modelTagNames!.filter(x => x !== undefined).length}, expected ${ModelTag_Count}`
    );

    // --- PrimitiveValType ---
    _primitiveValTypeNames = [];
    _primitiveValTypeNames[PrimitiveValType.Bool] = nameOf<typeof PrimitiveValType>('Bool');
    _primitiveValTypeNames[PrimitiveValType.S8] = nameOf<typeof PrimitiveValType>('S8');
    _primitiveValTypeNames[PrimitiveValType.U8] = nameOf<typeof PrimitiveValType>('U8');
    _primitiveValTypeNames[PrimitiveValType.S16] = nameOf<typeof PrimitiveValType>('S16');
    _primitiveValTypeNames[PrimitiveValType.U16] = nameOf<typeof PrimitiveValType>('U16');
    _primitiveValTypeNames[PrimitiveValType.S32] = nameOf<typeof PrimitiveValType>('S32');
    _primitiveValTypeNames[PrimitiveValType.U32] = nameOf<typeof PrimitiveValType>('U32');
    _primitiveValTypeNames[PrimitiveValType.S64] = nameOf<typeof PrimitiveValType>('S64');
    _primitiveValTypeNames[PrimitiveValType.U64] = nameOf<typeof PrimitiveValType>('U64');
    _primitiveValTypeNames[PrimitiveValType.Float32] = nameOf<typeof PrimitiveValType>('Float32');
    _primitiveValTypeNames[PrimitiveValType.Float64] = nameOf<typeof PrimitiveValType>('Float64');
    _primitiveValTypeNames[PrimitiveValType.Char] = nameOf<typeof PrimitiveValType>('Char');
    _primitiveValTypeNames[PrimitiveValType.String] = nameOf<typeof PrimitiveValType>('String');

    jsco_assert(
        _primitiveValTypeNames.filter(x => x !== undefined).length === PrimitiveValType_Count,
        () => `PrimitiveValType name count mismatch: have ${_primitiveValTypeNames!.filter(x => x !== undefined).length}, expected ${PrimitiveValType_Count}`
    );

    // --- CallingConvention ---
    _callingConventionNames = [];
    _callingConventionNames[CallingConvention.Scalar] = nameOf<typeof CallingConvention>('Scalar');
    _callingConventionNames[CallingConvention.Flat] = nameOf<typeof CallingConvention>('Flat');
    _callingConventionNames[CallingConvention.Spilled] = nameOf<typeof CallingConvention>('Spilled');

    jsco_assert(
        _callingConventionNames.filter(x => x !== undefined).length === CallingConvention_Count,
        () => `CallingConvention name count mismatch: have ${_callingConventionNames!.filter(x => x !== undefined).length}, expected ${CallingConvention_Count}`
    );

    // --- PlanOpKind ---
    _planOpKindNames = [];
    _planOpKindNames[PlanOpKind.CoreInstantiate] = nameOf<typeof PlanOpKind>('CoreInstantiate');
    _planOpKindNames[PlanOpKind.ImportBind] = nameOf<typeof PlanOpKind>('ImportBind');
    _planOpKindNames[PlanOpKind.ExportBind] = nameOf<typeof PlanOpKind>('ExportBind');

    jsco_assert(
        _planOpKindNames.filter(x => x !== undefined).length === PlanOpKind_Count,
        () => `PlanOpKind name count mismatch: have ${_planOpKindNames!.filter(x => x !== undefined).length}, expected ${PlanOpKind_Count}`
    );
}

registerInitDebugNames(initDebugNames);
