// this is a model written by hand, so that we can test the parser and resolver early on
// it should match ./hello.wat (delta mistakes)

import { CoreModule, WITSection } from '../src/parser/types';
import { ComponentExport, ComponentExternalKind } from '../src/model/exports';
import { ComponentInstanceInstantiate, CoreInstanceFromExports, CoreInstanceInstantiate, InstantiationArgKind } from '../src/model/instances';
import { ComponentTypeComponent, ComponentTypeFunc, ComponentTypeInstance, PrimitiveValType } from '../src/model/types';
import { ComponentAliasCoreInstanceExport, ComponentAliasInstanceExport } from '../src/model/aliases';
import { CanonicalFunctionLift, CanonicalFunctionLower } from '../src/model/canonicals';
import { ExternalKind } from '../src/model/core';
import { ComponentImport } from '../src/model/imports';
import { ModelTag } from '../src/model/tags';

export const componentTypeInstance0: ComponentTypeInstance = {
    tag: ModelTag.ComponentTypeInstance,
    declarations: [
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeDefinedRecord,
                members: [
                    {
                        name: 'name',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.String
                        },
                    },
                    {
                        name: 'head-count',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.U32
                        },
                    },
                    {
                        name: 'budget',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.S64
                        },
                    }
                ]
            }
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'city-info'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 0
                }
            }
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeFunc,
                params: [
                    {
                        name: 'message',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.String
                        }
                    }
                ],
                results: {
                    tag: ModelTag.ComponentFuncResultNamed,
                    values: []//void
                }
            }
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'send-message'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefFunc,
                value: 2
            }
        }
    ]
};

export const componentImport0: ComponentImport = {
    tag: ModelTag.ComponentImport,
    name: {
        tag: ModelTag.ComponentExternNameInterface,
        name: 'hello:city/city'
    },
    ty: {
        tag: ModelTag.ComponentTypeRefComponent,
        value: 0
    },
};

export const coreModule0: CoreModule = {
    tag: ModelTag.CoreModule,
    data: 'M0' as any,
};

export const coreModule1: CoreModule = {
    tag: ModelTag.CoreModule,
    data: 'M1' as any,
};

export const coreModule2: CoreModule = {
    tag: ModelTag.CoreModule,
    data: 'M1' as any,
};

export const coreInstance0: CoreInstanceInstantiate = {
    tag: ModelTag.CoreInstanceInstantiate,
    module_index: 1,
    args: [],
};

export const aliasCoreExportFunc0: ComponentAliasCoreInstanceExport = {
    tag: ModelTag.ComponentAliasCoreInstanceExport,
    kind: ExternalKind.Func,
    instance_index: 0,
    name: '0',
};

export const coreInstance1: CoreInstanceFromExports = {
    tag: ModelTag.CoreInstanceFromExports,
    exports: [
        {
            name: 'send-message',
            kind: ExternalKind.Func,
            index: 0,
        },
    ],
};

export const coreInstance2: CoreInstanceInstantiate = {
    tag: ModelTag.CoreInstanceInstantiate,
    module_index: 0,
    args: [
        {
            name: 'hello:city/city',
            kind: InstantiationArgKind.Instance,
            index: 1,
        },
    ],
};

export const aliasCoreExportMemory0: ComponentAliasCoreInstanceExport = {
    tag: ModelTag.ComponentAliasCoreInstanceExport,
    kind: ExternalKind.Memory,
    instance_index: 2,
    name: 'memory',
};

export const aliasCoreExportFunc1: ComponentAliasCoreInstanceExport = {
    tag: ModelTag.ComponentAliasCoreInstanceExport,
    kind: ExternalKind.Func,
    instance_index: 2,
    name: 'cabi_realloc',
};

export const aliasCoreExportTable0: ComponentAliasCoreInstanceExport = {
    tag: ModelTag.ComponentAliasCoreInstanceExport,
    kind: ExternalKind.Table,
    instance_index: 0,
    name: '$imports',
};

export const aliasExport0: ComponentAliasInstanceExport = {
    tag: ModelTag.ComponentAliasInstanceExport,
    kind: ComponentExternalKind.Func,
    instance_index: 0,
    name: 'send-message',
};

export const canonicalFuncLower2: CanonicalFunctionLower = {
    tag: ModelTag.CanonicalFunctionLower,
    func_index: 0,
    options: [
        {
            tag: ModelTag.CanonicalOptionMemory,
            value: 0
        },
        {
            tag: ModelTag.CanonicalOptionUTF8
        }
    ],
};

export const coreInstance3: CoreInstanceFromExports = {
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
            index: 2,
        }
    ]
};

export const coreInstance4: CoreInstanceInstantiate = {
    tag: ModelTag.CoreInstanceInstantiate,
    module_index: 2,
    args: [
        {
            name: '',
            kind: InstantiationArgKind.Instance,
            index: 3,
        },
    ],
};

export const aliasExportType1: ComponentAliasInstanceExport = {
    tag: ModelTag.ComponentAliasInstanceExport,
    /// The alias kind.
    kind: ComponentExternalKind.Type,
    /// The instance index.
    instance_index: 0,
    /// The export name.
    name: 'city-info',
};

export const componentTypeFunc2: ComponentTypeFunc = {
    tag: ModelTag.ComponentTypeFunc,
    params: [
        {
            name: 'info',
            type: {
                tag: ModelTag.ComponentValTypeType,
                value: 1
            }
        }
    ],
    results: {
        tag: ModelTag.ComponentFuncResultNamed,
        values: [] // void
    },
};

export const aliasCoreExportFunc3: ComponentAliasCoreInstanceExport = {
    tag: ModelTag.ComponentAliasCoreInstanceExport,
    kind: ExternalKind.Func,
    instance_index: 2,
    name: 'hello:city/greeter#run',
};

export const canonicalFuncLift1: CanonicalFunctionLift = {
    tag: ModelTag.CanonicalFunctionLift,
    core_func_index: 3,
    type_index: 2,
    options: [
        {
            tag: ModelTag.CanonicalOptionMemory,
            value: 0
        },
        {
            tag: ModelTag.CanonicalOptionRealloc,
            value: 1
        },
        {
            tag: ModelTag.CanonicalOptionUTF8
        },
    ],
};

export const aliasExportType3: ComponentAliasInstanceExport = {
    tag: ModelTag.ComponentAliasInstanceExport,
    kind: ComponentExternalKind.Type,
    instance_index: 0,
    name: 'city-info',
};

export const componentTypeComponent0: ComponentTypeComponent = {
    tag: ModelTag.ComponentTypeComponent,
    declarations: [
        {
            tag: ModelTag.ComponentTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeDefinedRecord,
                members:
                    [
                        {
                            name: 'name',
                            type: {
                                tag: ModelTag.ComponentValTypePrimitive,
                                value: PrimitiveValType.String
                            }
                        },
                        {
                            name: 'head-count',
                            type: {
                                tag: ModelTag.ComponentValTypePrimitive,
                                value: PrimitiveValType.U32
                            }
                        },
                        {
                            name: 'budget',
                            type: {
                                tag: ModelTag.ComponentValTypePrimitive,
                                value: PrimitiveValType.S64
                            }
                        }
                    ]

            },
        },
        {
            tag: ModelTag.ComponentImport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'import-type-city-info'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value:
                {
                    tag: ModelTag.TypeBoundsEq,
                    value: 0
                }
            },
        },
        {
            tag: ModelTag.ComponentImport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'import-type-city-info0'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value:
                {
                    tag: ModelTag.TypeBoundsEq,
                    value: 1
                }
            },
        },
        {
            tag: ModelTag.ComponentTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeFunc,
                params: [
                    {
                        name: 'info',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 2
                        }
                    }
                ],
                results: {
                    tag: ModelTag.ComponentFuncResultUnnamed,
                    type: undefined as any, // there is no info about the results
                },
            },
        },
        {
            tag: ModelTag.ComponentImport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'import-func-run'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefFunc,
                value: 3
            },
        },
        {
            tag: ModelTag.ComponentTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'city-info'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 1 // you sure? Here we don't have eq
                }
            },
        },
        {
            tag: ModelTag.ComponentTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeFunc,
                params: [
                    {
                        name: 'info',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 4
                        }
                    }
                ],
                results:
                {
                    tag: ModelTag.ComponentFuncResultNamed,
                    values: [] // void
                },
            },
        },
        {
            tag: ModelTag.ComponentTypeDeclarationExport,
            // what about (func 0)?
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'run'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefFunc,
                value: 5
            },
        },
    ]
};

// TODO: re-check where type/func info should be saved
export const componentInstance1: ComponentInstanceInstantiate = {
    tag: ModelTag.ComponentInstanceInstantiate,
    component_index: 0,
    args: [
        {
            name: 'import-func-run',
            kind: ComponentExternalKind.Func,
            index: 1,
        },
        {
            name: 'import-type-city-info',
            kind: ComponentExternalKind.Type,
            index: 3,
        },
        {
            name: 'import-type-city-info0',
            kind: ComponentExternalKind.Type,
            index: 1,
        }
    ]
};

export const componentExport0: ComponentExport = {
    tag: ModelTag.ComponentExport,
    name: { tag: ModelTag.ComponentExternNameInterface, name: 'hello:city/greeter' },
    kind: ComponentExternalKind.Instance,
    index: 1,
    ty: undefined
};

export const expectedModel: WITSection[] = [
    componentTypeInstance0,
    componentImport0,
    coreModule0,
    coreModule1,
    coreModule2,
    coreInstance0,
    aliasCoreExportFunc0,
    coreInstance1,
    coreInstance2,
    aliasCoreExportMemory0,
    aliasCoreExportFunc1,
    aliasCoreExportTable0,
    aliasExport0,
    canonicalFuncLower2,
    coreInstance3,
    coreInstance4,
    aliasExportType1,
    componentTypeFunc2,
    aliasCoreExportFunc3,
    canonicalFuncLift1,
    aliasExportType3,
    componentTypeComponent0,
    componentInstance1,
    componentExport0
];
