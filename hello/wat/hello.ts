// this is a model written by hand, so that we can test the parser and resolver early on
// it should match ./hello.wat (delta mistakes)

import { WITSection } from '../../src/parser/types'
import { ComponentExport, ComponentExternalKind } from '../../src/model/exports'
import { InstanceFromExports, InstanceInstantiate, InstantiationArgKind } from '../../src/model/instances'
import { ComponentTypeComponent, ComponentTypeFunc, ComponentTypeInstance, PrimitiveValType } from '../../src/model/types'
import { ComponentAliasCoreInstanceExport, ComponentAliasInstanceExport } from '../../src/model/aliases'
import { CanonicalFunctionLift, CanonicalFunctionLower } from "../../src/model/canonicals"
import { ExternalKind } from '../../src/model/core'
import { ComponentImport } from '../../src/model/imports'
import { WITModelByType } from '../../src/resolver/types'

export const componentType: ComponentTypeInstance = {
    tag: 'ComponentTypeInstance',
    declarations: [
        {
            tag: 'InstanceTypeDeclarationType',
            value: {
                tag: 'ComponentTypeDefined',
                value: {
                    tag: 'ComponentDefinedTypeRecord',
                    members: [
                        {
                            name: "name",
                            type: {
                                tag: 'ComponentValTypePrimitive',
                                value: PrimitiveValType.String
                            },
                        },
                        {
                            name: "head-count",
                            type: {
                                tag: 'ComponentValTypePrimitive',
                                value: PrimitiveValType.U32
                            },
                        },
                        {
                            name: "budget",
                            type: {
                                tag: 'ComponentValTypePrimitive',
                                value: PrimitiveValType.S64
                            },
                        }
                    ]
                }
            }
        },
        {
            tag: 'InstanceTypeDeclarationExport',
            name: {
                tag: 'ComponentExternNameKebab',
                name: "city-info"
            },
            ty: {
                tag: 'ComponentTypeRefType',
                value: {
                    tag: 'TypeBoundsEq',
                    value: 0
                }
            }
        },
        {
            tag: 'InstanceTypeDeclarationType',
            value: {
                tag: 'ComponentTypeFunc',
                value: {
                    params: [
                    ],
                    results: {
                        tag: 'ComponentFuncResultNamed',
                        value: []//void
                    }
                }
            }
        },
        {
            tag: 'InstanceTypeDeclarationExport',
            name: {
                tag: 'ComponentExternNameKebab',
                name: "send-message"
            },
            ty: {
                tag: 'ComponentTypeRefFunc',
                value: 2
            }
        }
    ]
}

export const componentImport: ComponentImport = {
    tag: 'ComponentImport',
    name: {
        tag: 'ComponentExternNameInterface',
        name: "hello:city/city"
    },
    ty: {
        tag: 'ComponentTypeRefInstance',
        value: 0
    },
}

// TODO: why is (instantiate 1) empty? We cannot put anything into value, right?
export const coreInstance0: InstanceFromExports = {
    tag: 'InstanceFromExports',
    value: [],
}

export const aliasCoreExportFunc0: ComponentAliasCoreInstanceExport = {
    tag: 'ComponentAliasCoreInstanceExport',
    kind: ExternalKind.Func,
    instance_index: 0,
    name: "0",
}

export const coreInstance1: InstanceFromExports = {
    tag: 'InstanceFromExports',
    value: [
        {
            name: "send-message",
            kind: ExternalKind.Func,
            index: 0,
        },
    ],
}

export const coreInstance2: InstanceInstantiate = {
    tag: 'InstanceInstantiate',
    module_index: 0,
    args: [
        {
            name: "hello:city/city",
            kind: InstantiationArgKind.Instance,
            index: 1,
        },
    ],
}

export const aliasCoreExportMemory0: ComponentAliasCoreInstanceExport = {
    tag: 'ComponentAliasCoreInstanceExport',
    kind: ExternalKind.Memory,
    instance_index: 2,
    name: "cabi_realloc",
}

export const aliasCoreExportFunc1: ComponentAliasCoreInstanceExport = {
    tag: 'ComponentAliasCoreInstanceExport',
    kind: ExternalKind.Func,
    instance_index: 2,
    name: "cabi_realloc",
}

export const aliasCoreExportTable0: ComponentAliasCoreInstanceExport = {
    tag: 'ComponentAliasCoreInstanceExport',
    kind: ExternalKind.Table,
    instance_index: 0,
    name: "$imports",
}

export const aliasExport0: ComponentAliasInstanceExport = {
    tag: 'ComponentAliasInstanceExport',
    kind: ComponentExternalKind.Func,
    instance_index: 0,
    name: "send-message",
}

export const canonicalFunc2: CanonicalFunctionLower = {
    tag: 'CanonicalFunctionLower',
    func_index: 0,
    options: [
        {
            tag: 'CanonicalOptionUTF8'
        },
        {
            tag: 'CanonicalOptionMemory',
            value: 0
        }
    ],
}

export const coreInstance3: InstanceFromExports = {
    tag: 'InstanceFromExports',
    value: [
        {
            name: "$imports",
            kind: ExternalKind.Table,
            index: 0,
        },
        {
            name: "0",
            kind: ExternalKind.Func,
            index: 2,
        }
    ]
}

export const coreInstance4: InstanceInstantiate = {
    tag: 'InstanceInstantiate',
    module_index: 2,
    args: [
        {
            name: "",
            kind: InstantiationArgKind.Instance,
            index: 3,
        },
    ],
}

export const aliasExport1: ComponentAliasInstanceExport = {
    tag: 'ComponentAliasInstanceExport',
    /// The alias kind.
    kind: ComponentExternalKind.Type,
    /// The instance index.
    instance_index: 0,
    /// The export name.
    name: "city-info",
}

export const typeFunction2: ComponentTypeFunc = {
    tag: 'ComponentTypeFunc',
    value: {
        params: [
            [
                "info",
                {
                    tag: 'ComponentValTypeType',
                    value: 1
                }
            ]
        ],
        results: undefined as any, // no info about the result
    }
}

export const aliasCoreExportFunc3: ComponentAliasCoreInstanceExport = {
    tag: 'ComponentAliasCoreInstanceExport',
    kind: ExternalKind.Func,
    instance_index: 2,
    name: "hello:city/greeter#run",
}

export const canonicalFunc1: CanonicalFunctionLift = {
    tag: 'CanonicalFunctionLift',
    core_func_index: 3,
    type_index: 2,
    options: [
        {
            tag: 'CanonicalOptionUTF8'
        },
        {
            tag: 'CanonicalOptionRealloc',
            value: 1
        },
        {
            tag: 'CanonicalOptionMemory',
            value: 0
        }
    ],
}

export const component: ComponentTypeComponent = {
    tag: 'ComponentTypeComponent',
    value: [
        {
            tag: 'ComponentTypeDeclarationType',
            value: {
                tag: 'ComponentTypeDefined',
                value: {
                    tag: 'ComponentDefinedTypeRecord',
                    members:
                        [
                            {
                                name: "name",
                                type: {
                                    tag: 'ComponentValTypePrimitive',
                                    value: PrimitiveValType.String
                                }
                            },
                            {
                                name: "head-count",
                                type: {
                                    tag: 'ComponentValTypePrimitive',
                                    value: PrimitiveValType.U32
                                }
                            },
                            {
                                name: "budget",
                                type: {
                                    tag: 'ComponentValTypePrimitive',
                                    value: PrimitiveValType.S64
                                }
                            }
                        ]
                }
            },
        },
        {
            tag: 'ComponentTypeDeclarationImport',
            value: {
                tag: 'ComponentImport',
                name: {
                    tag: 'ComponentExternNameKebab',
                    name: "import-type-city-info"
                },
                ty: {
                    tag: 'ComponentTypeRefType',
                    value:
                    {
                        tag: 'TypeBoundsEq',
                        value: 0
                    }
                },
            }
        },
        {
            tag: 'ComponentTypeDeclarationImport',
            value: {
                tag: 'ComponentImport',
                name: {
                    tag: 'ComponentExternNameKebab',
                    name: "import-type-city-info0"
                },
                ty: {
                    tag: 'ComponentTypeRefType',
                    value:
                    {
                        tag: 'TypeBoundsEq',
                        value: 1
                    }
                },
            }
        },
        {
            tag: 'ComponentTypeDeclarationType',
            value: {
                tag: 'ComponentTypeFunc',
                value:
                {
                    params: [
                        [
                            "info",
                            {
                                tag: 'ComponentValTypeType',
                                value: 2
                            }
                        ]
                    ],
                    results:
                    {
                        tag: 'ComponentFuncResultUnnamed',
                        value: undefined as any, // there is no info about the results
                    },
                }
            },
        },
        {
            tag: 'ComponentTypeDeclarationImport',
            value: {
                tag: 'ComponentImport',
                name: {
                    tag: 'ComponentExternNameKebab',
                    name: "import-func-run"
                },
                ty: {
                    tag: 'ComponentTypeRefFunc',
                    value: 3
                },
            }
        },
        {
            tag: 'ComponentTypeDeclarationExport',
            name: {
                tag: 'ComponentExternNameKebab',
                name: "city-info"
            },
            ty: {
                tag: 'ComponentTypeRefType',
                value: {
                    tag: 'TypeBoundsEq',
                    value: 1 // you sure? Here we don't have eq
                }
            },
        },
        {
            tag: 'ComponentTypeDeclarationType',
            value: {
                tag: 'ComponentTypeFunc',
                value:
                {
                    params: [
                        [
                            "info",
                            {
                                tag: 'ComponentValTypeType',
                                value: 4
                            }
                        ]
                    ],
                    results:
                    {
                        tag: 'ComponentFuncResultNamed',
                        value: [] // void
                    },
                }
            },
        },
        {
            tag: 'ComponentTypeDeclarationExport',
            // what about (func 0)?
            name: {
                tag: 'ComponentExternNameKebab',
                name: "run"
            },
            ty: {
                tag: 'ComponentTypeRefFunc',
                value: 5
            },
        },
    ]
}

// TODO: re-check where type/func info should be saved
export const componentInstance: InstanceInstantiate = {
    tag: 'InstanceInstantiate',
    module_index: 0,
    args: [
        {
            name: "import-func-run",
            kind: InstantiationArgKind.Instance,
            index: 1,
            // func ?????
        },
        {
            name: "import-type-city-info",
            kind: InstantiationArgKind.Instance,
            index: 3,
            // type ?????
        },
        {
            name: "import-type-city-info0",
            kind: InstantiationArgKind.Instance,
            index: 1,
            // type ?????
        }
    ]
}

export const componentExport: ComponentExport = {
    tag: 'ComponentExport',
    name: { tag: 'ComponentExternNameInterface', name: 'hello:city/greeter' },
    kind: ComponentExternalKind.Instance,
    index: 1,
    ty: undefined
}

export const aliasExportType3: ComponentAliasInstanceExport = {
    tag: 'ComponentAliasInstanceExport',
    kind: ComponentExternalKind.Type,
    instance_index: 0,
    name: "city-info",
}

export const expectedModel: WITSection[] = [
    componentType,
    componentImport,
    coreInstance0,
    aliasCoreExportFunc0,
    coreInstance1,
    coreInstance2,
    aliasCoreExportMemory0,
    aliasCoreExportFunc1,
    aliasCoreExportTable0,
    aliasExport0,
    canonicalFunc2,
    coreInstance3,
    coreInstance4,
    aliasExport1,
    typeFunction2,
    aliasCoreExportFunc3,
    canonicalFunc1,
    aliasExportType3,
    component,
    componentInstance,
    componentExport
]

export const expectedModelByType: WITModelByType = {
    componentExports: [componentExport],
    componentImports: [componentImport],
    instances: [coreInstance0, coreInstance1, coreInstance2, coreInstance3, coreInstance4, componentInstance],
    modules: [],
    other: [],
    type: [componentType, typeFunction2],
    aliases: [aliasCoreExportFunc0, aliasCoreExportMemory0, aliasCoreExportFunc1, aliasCoreExportTable0, aliasExport0, aliasExport1, aliasCoreExportFunc3, aliasExportType3],
    cannon: [canonicalFunc2, canonicalFunc1],
    component: [component],
};
