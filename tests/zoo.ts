// this is a model written by hand, so that we can test the parser and resolver early on
// it should match ./zoo.wat (delta mistakes)

import { ComponentSection, CoreModule, CustomSection } from '../src/parser/types';
import { ComponentExport, ComponentExternalKind } from '../src/model/exports';
import { ComponentInstanceInstantiate, CoreInstanceFromExports, CoreInstanceInstantiate, InstantiationArgKind } from '../src/model/instances';
import { ComponentTypeFunc, ComponentTypeInstance, PrimitiveValType } from '../src/model/types';
import { ComponentAliasCoreInstanceExport, ComponentAliasInstanceExport } from '../src/model/aliases';
import { CanonicalFunctionLift, CanonicalFunctionLower } from '../src/model/canonicals';
import { ExternalKind } from '../src/model/core';
import { ComponentImport } from '../src/model/imports';
import { CoreFuncIndex, CoreInstanceIndex, CoreModuleIndex, ComponentFuncIndex, ComponentInstanceIndex, ComponentTypeIndex } from '../src/model/indices';
import { ModelTag, WITSection } from '../src/model/tags';

export const componentTypeInstance0: ComponentTypeInstance = {
    tag: ModelTag.ComponentTypeInstance,
    declarations: [
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeDefinedTuple,
                members: [
                    {
                        tag: ModelTag.ComponentValTypePrimitive,
                        value: PrimitiveValType.S8,
                    },
                    {
                        tag: ModelTag.ComponentValTypePrimitive,
                        value: PrimitiveValType.U8,
                    }
                ],
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeDefinedRecord,
                members: [
                    {
                        name: 'name',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.String,
                        },
                    },
                    {
                        name: 'iso-code',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.Char,
                        },
                    },
                    {
                        name: 'weight',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.Float32,
                        },
                    },
                    {
                        name: 'healthy',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.Bool,
                        },
                    },
                    {
                        name: 'calories',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.U64,
                        },
                    },
                    {
                        name: 'cost',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.U16,
                        },
                    },
                    {
                        name: 'rating',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.S16,
                        },
                    },
                    {
                        name: 'pieces',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.U8,
                        },
                    },
                    {
                        name: 'shelf-temperature',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 0,
                        },
                    },
                    {
                        name: 'cook-time-in-minutes',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.S32,
                        },
                    }
                ],
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'food-info',
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 1,
                },
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeDefinedEnum,
                members: [
                    'carbohydrate',
                    'protein',
                    'vitamin'
                ],
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'nutrition-type',
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 3,
                },
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeDefinedRecord,
                members: [
                    {
                        name: 'percentage',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.Float64,
                        },
                    },
                    {
                        name: 'nutrition-type',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 4,
                        },
                    }
                ],
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'nutrition-info',
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 5,
                },
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeDefinedVariant,
                variants: [
                    {
                        name: 'plastic-bag',
                        ty: undefined,
                        refines: undefined,
                    },
                    {
                        name: 'metal-can',
                        ty: undefined,
                        refines: undefined,
                    }
                ],
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'material-type',
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 7,
                },
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeDefinedFlags,
                members: [
                    'opened',
                    'closed',
                    'damaged'
                ],
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'sealing-state',
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 9,
                },
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeDefinedRecord,
                members: [
                    {
                        name: 'nutrition',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 6,
                        },
                    },
                    {
                        name: 'material',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 8,
                        },
                    },
                    {
                        name: 'sealing',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 10,
                        },
                    }
                ],
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'package-info',
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 11,
                },
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeDefinedList,
                value: {
                    tag: ModelTag.ComponentValTypeType,
                    value: 2,
                },
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeDefinedOption,
                value: {
                    tag: ModelTag.ComponentValTypePrimitive,
                    value: PrimitiveValType.String,
                },
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeDefinedRecord,
                members: [
                    {
                        name: 'foods',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 13,
                        },
                    },
                    {
                        name: 'label',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 14,
                        },
                    }
                ],
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'meal-plan',
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 15,
                },
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeFunc,
                params: [
                    {
                        name: 'food',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 2,
                        },
                    },
                    {
                        name: 'message',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.String,
                        },
                    }
                ],
                results: {
                    tag: ModelTag.ComponentFuncResultNamed,
                    values: [],
                },
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'hide-food',
            },
            ty: {
                tag: ModelTag.ComponentTypeRefFunc,
                value: 17,
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeFunc,
                params: [
                    {
                        name: 'foodinfo',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 2,
                        },
                    },
                    {
                        name: 'packageinfo',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 12,
                        },
                    },
                    {
                        name: 'message',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.String,
                        },
                    }
                ],
                results: {
                    tag: ModelTag.ComponentFuncResultNamed,
                    values: [],
                },
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'consume-food',
            },
            ty: {
                tag: ModelTag.ComponentTypeRefFunc,
                value: 18,
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeFunc,
                params: [
                    {
                        name: 'sealingstate',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 10,
                        },
                    },
                    {
                        name: 'packageinfo',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 12,
                        },
                    },
                    {
                        name: 'message',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.String,
                        },
                    }
                ],
                results: {
                    tag: ModelTag.ComponentFuncResultNamed,
                    values: [],
                },
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'open-package',
            },
            ty: {
                tag: ModelTag.ComponentTypeRefFunc,
                value: 19,
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeDefinedList,
                value: {
                    tag: ModelTag.ComponentValTypeType,
                    value: 12,
                },
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeFunc,
                params: [
                    {
                        name: 'trashed',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 20,
                        },
                    },
                    {
                        name: 'message',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.String,
                        },
                    }
                ],
                results: {
                    tag: ModelTag.ComponentFuncResultUnnamed,
                    type: {
                        tag: ModelTag.ComponentValTypePrimitive,
                        value: PrimitiveValType.Bool,
                    },
                },
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'trash-package',
            },
            ty: {
                tag: ModelTag.ComponentTypeRefFunc,
                value: 21,
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeDefinedResult,
                ok: {
                    tag: ModelTag.ComponentValTypePrimitive,
                    value: PrimitiveValType.String,
                },
                err: {
                    tag: ModelTag.ComponentValTypePrimitive,
                    value: PrimitiveValType.String,
                },
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeFunc,
                params: [
                    {
                        name: 'plan',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 16,
                        },
                    }
                ],
                results: {
                    tag: ModelTag.ComponentFuncResultUnnamed,
                    type: {
                        tag: ModelTag.ComponentValTypeType,
                        value: 22,
                    },
                },
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'plan-meal',
            },
            ty: {
                tag: ModelTag.ComponentTypeRefFunc,
                value: 23,
            },
        }
    ],
};

export const expectedModel: WITSection[] = [
    componentTypeInstance0,
    {
        tag: ModelTag.ComponentImport,
        name: {
            tag: ModelTag.ComponentExternNameKebab,
            name: 'zoo:food/food@0.1.0',
        },
        ty: {
            tag: ModelTag.ComponentTypeRefInstance,
            value: 0,
        },
    },
    {
        tag: ModelTag.CoreModule,
    },
    {
        tag: ModelTag.CoreModule,
    },
    {
        tag: ModelTag.CoreModule,
    },
    {
        tag: ModelTag.CoreInstanceInstantiate,
        module_index: 1,
        args: [],
    },
    {
        tag: ModelTag.ComponentAliasCoreInstanceExport,
        kind: ExternalKind.Func,
        instance_index: 0,
        name: '0',
    },
    {
        tag: ModelTag.ComponentAliasCoreInstanceExport,
        kind: ExternalKind.Func,
        instance_index: 0,
        name: '1',
    },
    {
        tag: ModelTag.ComponentAliasCoreInstanceExport,
        kind: ExternalKind.Func,
        instance_index: 0,
        name: '2',
    },
    {
        tag: ModelTag.ComponentAliasCoreInstanceExport,
        kind: ExternalKind.Func,
        instance_index: 0,
        name: '3',
    },
    {
        tag: ModelTag.ComponentAliasCoreInstanceExport,
        kind: ExternalKind.Func,
        instance_index: 0,
        name: '4',
    },
    {
        tag: ModelTag.CoreInstanceFromExports,
        exports: [
            {
                name: 'hide-food',
                kind: ExternalKind.Func,
                index: 0,
            },
            {
                name: 'trash-package',
                kind: ExternalKind.Func,
                index: 1,
            },
            {
                name: 'consume-food',
                kind: ExternalKind.Func,
                index: 2,
            },
            {
                name: 'open-package',
                kind: ExternalKind.Func,
                index: 3,
            },
            {
                name: 'plan-meal',
                kind: ExternalKind.Func,
                index: 4,
            }
        ],
    },
    {
        tag: ModelTag.CoreInstanceInstantiate,
        module_index: 0,
        args: [
            {
                name: 'zoo:food/food@0.1.0',
                kind: InstantiationArgKind.Instance,
                index: 1,
            }
        ],
    },
    {
        tag: ModelTag.ComponentAliasCoreInstanceExport,
        kind: ExternalKind.Memory,
        instance_index: 2,
        name: 'memory',
    },
    {
        tag: ModelTag.ComponentAliasCoreInstanceExport,
        kind: ExternalKind.Table,
        instance_index: 0,
        name: '$imports',
    },
    {
        tag: ModelTag.ComponentAliasInstanceExport,
        kind: ComponentExternalKind.Func,
        instance_index: 0,
        name: 'hide-food',
    },
    {
        tag: ModelTag.ComponentAliasCoreInstanceExport,
        kind: ExternalKind.Func,
        instance_index: 2,
        name: 'cabi_realloc',
    },
    {
        tag: ModelTag.CanonicalFunctionLower,
        func_index: 0,
        options: [
            {
                tag: ModelTag.CanonicalOptionMemory,
                value: 0,
            },
            {
                tag: ModelTag.CanonicalOptionUTF8,
            }
        ],
    },
    {
        tag: ModelTag.ComponentAliasInstanceExport,
        kind: ComponentExternalKind.Func,
        instance_index: 0,
        name: 'trash-package',
    },
    {
        tag: ModelTag.CanonicalFunctionLower,
        func_index: 1,
        options: [
            {
                tag: ModelTag.CanonicalOptionMemory,
                value: 0,
            },
            {
                tag: ModelTag.CanonicalOptionUTF8,
            }
        ],
    },
    {
        tag: ModelTag.ComponentAliasInstanceExport,
        kind: ComponentExternalKind.Func,
        instance_index: 0,
        name: 'consume-food',
    },
    {
        tag: ModelTag.CanonicalFunctionLower,
        func_index: 2,
        options: [
            {
                tag: ModelTag.CanonicalOptionMemory,
                value: 0,
            },
            {
                tag: ModelTag.CanonicalOptionUTF8,
            }
        ],
    },
    {
        tag: ModelTag.ComponentAliasInstanceExport,
        kind: ComponentExternalKind.Func,
        instance_index: 0,
        name: 'open-package',
    },
    {
        tag: ModelTag.CanonicalFunctionLower,
        func_index: 3,
        options: [
            {
                tag: ModelTag.CanonicalOptionMemory,
                value: 0,
            },
            {
                tag: ModelTag.CanonicalOptionUTF8,
            }
        ],
    },
    {
        tag: ModelTag.ComponentAliasInstanceExport,
        kind: ComponentExternalKind.Func,
        instance_index: 0,
        name: 'plan-meal',
    },
    {
        tag: ModelTag.CanonicalFunctionLower,
        func_index: 4,
        options: [
            {
                tag: ModelTag.CanonicalOptionMemory,
                value: 0,
            },
            {
                tag: ModelTag.CanonicalOptionRealloc,
                value: 5,
            },
            {
                tag: ModelTag.CanonicalOptionUTF8,
            }
        ],
    },
    {
        tag: ModelTag.CoreInstanceFromExports,
        exports: [
            {
                name: '$imports',
                kind: ExternalKind.Table,
                index: 0,
            },
            {
                name: '0',
                kind: ExternalKind.Func,
                index: 6,
            },
            {
                name: '1',
                kind: ExternalKind.Func,
                index: 7,
            },
            {
                name: '2',
                kind: ExternalKind.Func,
                index: 8,
            },
            {
                name: '3',
                kind: ExternalKind.Func,
                index: 9,
            },
            {
                name: '4',
                kind: ExternalKind.Func,
                index: 10,
            }
        ],
    },
    {
        tag: ModelTag.CoreInstanceInstantiate,
        module_index: 2,
        args: [
            {
                name: '',
                kind: InstantiationArgKind.Instance,
                index: 3,
            }
        ],
    },
    {
        tag: ModelTag.ComponentAliasInstanceExport,
        kind: ComponentExternalKind.Type,
        instance_index: 0,
        name: 'food-info',
    },
    {
        tag: ModelTag.ComponentAliasInstanceExport,
        kind: ComponentExternalKind.Type,
        instance_index: 0,
        name: 'package-info',
    },
    {
        tag: ModelTag.ComponentTypeFunc,
        params: [
            {
                name: 'foodinfo',
                type: {
                    tag: ModelTag.ComponentValTypeType,
                    value: 1,
                },
            },
            {
                name: 'packageinfo',
                type: {
                    tag: ModelTag.ComponentValTypeType,
                    value: 2,
                },
            }
        ],
        results: {
            tag: ModelTag.ComponentFuncResultNamed,
            values: [],
        },
    },
    {
        tag: ModelTag.ComponentAliasCoreInstanceExport,
        kind: ExternalKind.Func,
        instance_index: 2,
        name: 'zoo:food/eater@0.1.0#feed',
    },
    {
        tag: ModelTag.CanonicalFunctionLift,
        core_func_index: 11,
        options: [
            {
                tag: ModelTag.CanonicalOptionMemory,
                value: 0,
            },
            {
                tag: ModelTag.CanonicalOptionRealloc,
                value: 5,
            },
            {
                tag: ModelTag.CanonicalOptionUTF8,
            }
        ],
        type_index: 3,
    },
    {
        tag: ModelTag.ComponentAliasInstanceExport,
        kind: ComponentExternalKind.Type,
        instance_index: 0,
        name: 'meal-plan',
    },
    {
        tag: ModelTag.ComponentTypeDefinedResult,
        ok: {
            tag: ModelTag.ComponentValTypePrimitive,
            value: PrimitiveValType.String,
        },
        err: {
            tag: ModelTag.ComponentValTypePrimitive,
            value: PrimitiveValType.String,
        },
    },
    {
        tag: ModelTag.ComponentTypeFunc,
        params: [
            {
                name: 'plan',
                type: {
                    tag: ModelTag.ComponentValTypeType,
                    value: 4,
                },
            }
        ],
        results: {
            tag: ModelTag.ComponentFuncResultUnnamed,
            type: {
                tag: ModelTag.ComponentValTypeType,
                value: 5,
            },
        },
    },
    {
        tag: ModelTag.ComponentAliasCoreInstanceExport,
        kind: ExternalKind.Func,
        instance_index: 2,
        name: 'zoo:food/eater@0.1.0#schedule',
    },
    {
        tag: ModelTag.ComponentAliasCoreInstanceExport,
        kind: ExternalKind.Func,
        instance_index: 2,
        name: 'cabi_post_zoo:food/eater@0.1.0#schedule',
    },
    {
        tag: ModelTag.CanonicalFunctionLift,
        core_func_index: 12,
        options: [
            {
                tag: ModelTag.CanonicalOptionMemory,
                value: 0,
            },
            {
                tag: ModelTag.CanonicalOptionRealloc,
                value: 5,
            },
            {
                tag: ModelTag.CanonicalOptionUTF8,
            },
            {
                tag: ModelTag.CanonicalOptionPostReturn,
                value: 13,
            }
        ],
        type_index: 6,
    },
    {
        tag: ModelTag.ComponentAliasInstanceExport,
        kind: ComponentExternalKind.Type,
        instance_index: 0,
        name: 'food-info',
    },
    {
        tag: ModelTag.ComponentAliasInstanceExport,
        kind: ComponentExternalKind.Type,
        instance_index: 0,
        name: 'nutrition-type',
    },
    {
        tag: ModelTag.ComponentAliasInstanceExport,
        kind: ComponentExternalKind.Type,
        instance_index: 0,
        name: 'nutrition-info',
    },
    {
        tag: ModelTag.ComponentAliasInstanceExport,
        kind: ComponentExternalKind.Type,
        instance_index: 0,
        name: 'material-type',
    },
    {
        tag: ModelTag.ComponentAliasInstanceExport,
        kind: ComponentExternalKind.Type,
        instance_index: 0,
        name: 'sealing-state',
    },
    {
        tag: ModelTag.ComponentAliasInstanceExport,
        kind: ComponentExternalKind.Type,
        instance_index: 0,
        name: 'package-info',
    },
    {
        tag: ModelTag.ComponentAliasInstanceExport,
        kind: ComponentExternalKind.Type,
        instance_index: 0,
        name: 'meal-plan',
    },
    {
        tag: ModelTag.ComponentSection,
        sections: [
            {
                tag: ModelTag.ComponentTypeDefinedTuple,
                members: [
                    {
                        tag: ModelTag.ComponentValTypePrimitive,
                        value: PrimitiveValType.S8,
                    },
                    {
                        tag: ModelTag.ComponentValTypePrimitive,
                        value: PrimitiveValType.U8,
                    }
                ],
            },
            {
                tag: ModelTag.ComponentTypeDefinedRecord,
                members: [
                    {
                        name: 'name',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.String,
                        },
                    },
                    {
                        name: 'iso-code',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.Char,
                        },
                    },
                    {
                        name: 'weight',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.Float32,
                        },
                    },
                    {
                        name: 'healthy',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.Bool,
                        },
                    },
                    {
                        name: 'calories',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.U64,
                        },
                    },
                    {
                        name: 'cost',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.U16,
                        },
                    },
                    {
                        name: 'rating',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.S16,
                        },
                    },
                    {
                        name: 'pieces',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.U8,
                        },
                    },
                    {
                        name: 'shelf-temperature',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 0,
                        },
                    },
                    {
                        name: 'cook-time-in-minutes',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.S32,
                        },
                    }
                ],
            },
            {
                tag: ModelTag.ComponentImport,
                name: {
                    tag: ModelTag.ComponentExternNameKebab,
                    name: 'import-type-food-info',
                },
                ty: {
                    tag: ModelTag.ComponentTypeRefType,
                    value: {
                        tag: ModelTag.TypeBoundsEq,
                        value: 1,
                    },
                },
            },
            {
                tag: ModelTag.ComponentTypeDefinedEnum,
                members: [
                    'carbohydrate',
                    'protein',
                    'vitamin'
                ],
            },
            {
                tag: ModelTag.ComponentImport,
                name: {
                    tag: ModelTag.ComponentExternNameKebab,
                    name: 'import-type-nutrition-type',
                },
                ty: {
                    tag: ModelTag.ComponentTypeRefType,
                    value: {
                        tag: ModelTag.TypeBoundsEq,
                        value: 3,
                    },
                },
            },
            {
                tag: ModelTag.ComponentTypeDefinedRecord,
                members: [
                    {
                        name: 'percentage',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.Float64,
                        },
                    },
                    {
                        name: 'nutrition-type',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 4,
                        },
                    }
                ],
            },
            {
                tag: ModelTag.ComponentImport,
                name: {
                    tag: ModelTag.ComponentExternNameKebab,
                    name: 'import-type-nutrition-info',
                },
                ty: {
                    tag: ModelTag.ComponentTypeRefType,
                    value: {
                        tag: ModelTag.TypeBoundsEq,
                        value: 5,
                    },
                },
            },
            {
                tag: ModelTag.ComponentTypeDefinedVariant,
                variants: [
                    {
                        name: 'plastic-bag',
                        ty: undefined,
                        refines: undefined,
                    },
                    {
                        name: 'metal-can',
                        ty: undefined,
                        refines: undefined,
                    }
                ],
            },
            {
                tag: ModelTag.ComponentImport,
                name: {
                    tag: ModelTag.ComponentExternNameKebab,
                    name: 'import-type-material-type',
                },
                ty: {
                    tag: ModelTag.ComponentTypeRefType,
                    value: {
                        tag: ModelTag.TypeBoundsEq,
                        value: 7,
                    },
                },
            },
            {
                tag: ModelTag.ComponentTypeDefinedFlags,
                members: [
                    'opened',
                    'closed',
                    'damaged'
                ],
            },
            {
                tag: ModelTag.ComponentImport,
                name: {
                    tag: ModelTag.ComponentExternNameKebab,
                    name: 'import-type-sealing-state',
                },
                ty: {
                    tag: ModelTag.ComponentTypeRefType,
                    value: {
                        tag: ModelTag.TypeBoundsEq,
                        value: 9,
                    },
                },
            },
            {
                tag: ModelTag.ComponentTypeDefinedRecord,
                members: [
                    {
                        name: 'nutrition',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 6,
                        },
                    },
                    {
                        name: 'material',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 8,
                        },
                    },
                    {
                        name: 'sealing',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 10,
                        },
                    }
                ],
            },
            {
                tag: ModelTag.ComponentImport,
                name: {
                    tag: ModelTag.ComponentExternNameKebab,
                    name: 'import-type-package-info',
                },
                ty: {
                    tag: ModelTag.ComponentTypeRefType,
                    value: {
                        tag: ModelTag.TypeBoundsEq,
                        value: 11,
                    },
                },
            },
            {
                tag: ModelTag.ComponentTypeDefinedList,
                value: {
                    tag: ModelTag.ComponentValTypeType,
                    value: 2,
                },
            },
            {
                tag: ModelTag.ComponentTypeDefinedOption,
                value: {
                    tag: ModelTag.ComponentValTypePrimitive,
                    value: PrimitiveValType.String,
                },
            },
            {
                tag: ModelTag.ComponentTypeDefinedRecord,
                members: [
                    {
                        name: 'foods',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 13,
                        },
                    },
                    {
                        name: 'label',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 14,
                        },
                    }
                ],
            },
            {
                tag: ModelTag.ComponentImport,
                name: {
                    tag: ModelTag.ComponentExternNameKebab,
                    name: 'import-type-meal-plan',
                },
                ty: {
                    tag: ModelTag.ComponentTypeRefType,
                    value: {
                        tag: ModelTag.TypeBoundsEq,
                        value: 15,
                    },
                },
            },
            {
                tag: ModelTag.ComponentImport,
                name: {
                    tag: ModelTag.ComponentExternNameKebab,
                    name: 'import-type-food-info0',
                },
                ty: {
                    tag: ModelTag.ComponentTypeRefType,
                    value: {
                        tag: ModelTag.TypeBoundsEq,
                        value: 2,
                    },
                },
            },
            {
                tag: ModelTag.ComponentImport,
                name: {
                    tag: ModelTag.ComponentExternNameKebab,
                    name: 'import-type-package-info0',
                },
                ty: {
                    tag: ModelTag.ComponentTypeRefType,
                    value: {
                        tag: ModelTag.TypeBoundsEq,
                        value: 12,
                    },
                },
            },
            {
                tag: ModelTag.ComponentTypeFunc,
                params: [
                    {
                        name: 'foodinfo',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 17,
                        },
                    },
                    {
                        name: 'packageinfo',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 18,
                        },
                    }
                ],
                results: {
                    tag: ModelTag.ComponentFuncResultNamed,
                    values: [],
                },
            },
            {
                tag: ModelTag.ComponentImport,
                name: {
                    tag: ModelTag.ComponentExternNameKebab,
                    name: 'import-func-feed',
                },
                ty: {
                    tag: ModelTag.ComponentTypeRefFunc,
                    value: 19,
                },
            },
            {
                tag: ModelTag.ComponentImport,
                name: {
                    tag: ModelTag.ComponentExternNameKebab,
                    name: 'import-type-meal-plan0',
                },
                ty: {
                    tag: ModelTag.ComponentTypeRefType,
                    value: {
                        tag: ModelTag.TypeBoundsEq,
                        value: 16,
                    },
                },
            },
            {
                tag: ModelTag.ComponentTypeDefinedResult,
                ok: {
                    tag: ModelTag.ComponentValTypePrimitive,
                    value: PrimitiveValType.String,
                },
                err: {
                    tag: ModelTag.ComponentValTypePrimitive,
                    value: PrimitiveValType.String,
                },
            },
            {
                tag: ModelTag.ComponentTypeFunc,
                params: [
                    {
                        name: 'plan',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 20,
                        },
                    }
                ],
                results: {
                    tag: ModelTag.ComponentFuncResultUnnamed,
                    type: {
                        tag: ModelTag.ComponentValTypeType,
                        value: 21,
                    },
                },
            },
            {
                tag: ModelTag.ComponentImport,
                name: {
                    tag: ModelTag.ComponentExternNameKebab,
                    name: 'import-func-schedule',
                },
                ty: {
                    tag: ModelTag.ComponentTypeRefFunc,
                    value: 22,
                },
            },
            {
                tag: ModelTag.ComponentExport,
                name: {
                    tag: ModelTag.ComponentExternNameKebab,
                    name: 'food-info',
                },
                kind: ComponentExternalKind.Type,
                index: 2,
                ty: undefined,
            },
            {
                tag: ModelTag.ComponentExport,
                name: {
                    tag: ModelTag.ComponentExternNameKebab,
                    name: 'package-info',
                },
                kind: ComponentExternalKind.Type,
                index: 12,
                ty: undefined,
            },
            {
                tag: ModelTag.ComponentExport,
                name: {
                    tag: ModelTag.ComponentExternNameKebab,
                    name: 'meal-plan',
                },
                kind: ComponentExternalKind.Type,
                index: 16,
                ty: undefined,
            },
            {
                tag: ModelTag.ComponentTypeFunc,
                params: [
                    {
                        name: 'foodinfo',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 23,
                        },
                    },
                    {
                        name: 'packageinfo',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 24,
                        },
                    }
                ],
                results: {
                    tag: ModelTag.ComponentFuncResultNamed,
                    values: [],
                },
            },
            {
                tag: ModelTag.ComponentExport,
                name: {
                    tag: ModelTag.ComponentExternNameKebab,
                    name: 'feed',
                },
                kind: ComponentExternalKind.Func,
                index: 0,
                ty: {
                    tag: ModelTag.ComponentTypeRefFunc,
                    value: 26,
                },
            },
            {
                tag: ModelTag.ComponentTypeDefinedResult,
                ok: {
                    tag: ModelTag.ComponentValTypePrimitive,
                    value: PrimitiveValType.String,
                },
                err: {
                    tag: ModelTag.ComponentValTypePrimitive,
                    value: PrimitiveValType.String,
                },
            },
            {
                tag: ModelTag.ComponentTypeFunc,
                params: [
                    {
                        name: 'plan',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 25,
                        },
                    }
                ],
                results: {
                    tag: ModelTag.ComponentFuncResultUnnamed,
                    type: {
                        tag: ModelTag.ComponentValTypeType,
                        value: 27,
                    },
                },
            },
            {
                tag: ModelTag.ComponentExport,
                name: {
                    tag: ModelTag.ComponentExternNameKebab,
                    name: 'schedule',
                },
                kind: ComponentExternalKind.Func,
                index: 1,
                ty: {
                    tag: ModelTag.ComponentTypeRefFunc,
                    value: 28,
                },
            }
        ],
    },
    {
        tag: ModelTag.ComponentInstanceInstantiate,
        component_index: 0,
        args: [
            {
                name: 'import-func-feed',
                kind: ComponentExternalKind.Func,
                index: 5,
            },
            {
                name: 'import-func-schedule',
                kind: ComponentExternalKind.Func,
                index: 6,
            },
            {
                name: 'import-type-food-info',
                kind: ComponentExternalKind.Type,
                index: 7,
            },
            {
                name: 'import-type-nutrition-type',
                kind: ComponentExternalKind.Type,
                index: 8,
            },
            {
                name: 'import-type-nutrition-info',
                kind: ComponentExternalKind.Type,
                index: 9,
            },
            {
                name: 'import-type-material-type',
                kind: ComponentExternalKind.Type,
                index: 10,
            },
            {
                name: 'import-type-sealing-state',
                kind: ComponentExternalKind.Type,
                index: 11,
            },
            {
                name: 'import-type-package-info',
                kind: ComponentExternalKind.Type,
                index: 12,
            },
            {
                name: 'import-type-meal-plan',
                kind: ComponentExternalKind.Type,
                index: 13,
            },
            {
                name: 'import-type-food-info0',
                kind: ComponentExternalKind.Type,
                index: 1,
            },
            {
                name: 'import-type-package-info0',
                kind: ComponentExternalKind.Type,
                index: 2,
            },
            {
                name: 'import-type-meal-plan0',
                kind: ComponentExternalKind.Type,
                index: 4,
            }
        ],
    },
    {
        tag: ModelTag.ComponentExport,
        name: {
            tag: ModelTag.ComponentExternNameKebab,
            name: 'zoo:food/eater@0.1.0',
        },
        kind: ComponentExternalKind.Instance,
        index: 1,
        ty: undefined,
    },
    {
        tag: ModelTag.CustomSection,
        name: 'producers',
        data: undefined,
    },
    {
        tag: ModelTag.CustomSection,
        name: 'component-name',
        data: undefined,
    },
    {
        tag: ModelTag.CustomSection,
        name: 'authors',
        data: undefined,
    },
    {
        tag: ModelTag.CustomSection,
        name: 'revision',
        data: undefined,
    },
    {
        tag: ModelTag.CustomSection,
        name: 'version',
        data: undefined,
    },
];
