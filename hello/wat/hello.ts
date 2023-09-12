import { WITSection } from '../../src/parser/types'
import { ComponentExport, ComponentExternalKind } from '../../src/model/exports'
import { InstanceInstantiate, InstantiationArgKind } from '../../src/model/instances'
import { ComponentTypeComponent, ComponentTypeFunc, PrimitiveValType } from '../../src/model/types'
import { ComponentAliasCoreInstanceExport, ComponentAliasInstanceExport } from '../../src/model/aliases'
import { CanonicalFunctionLift } from "../../src/model/canonicals"
import { ExternalKind } from '../../src/model/core'

const componentExport: ComponentExport = {
    tag: 'ComponentExport',
    name: {
        tag: 'ComponentExternNameInterface',
        name: 'hello:city/greeter',
    },
    kind: ComponentExternalKind.Instance,
    index: 1,
    ty: undefined
}

export const instance: InstanceInstantiate = {
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

export const component: ComponentTypeComponent = 
{
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
                        value: undefined, // there is no info about the results
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
                ty: { value: 3 }, // ComponentTypeRefFunc is it connected with "(func (;0;) (type 3))"?
            }
        },
        {
            name: {
                tag: 'ComponentExternNameKebab',
                name: "city-info"
            },
            ty: {
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
                        tag: 'ComponentFuncResultUnnamed',
                        value: undefined, // there is no info about the results
                    },
                }
            },
        },
        {
            name: {
                tag: 'ComponentExternNameKebab',
                name: "run"
            },
            ty: {
                value: 0 // what about (func (type 5))?
            },
        },
    ]
}

export const aliasExport3: ComponentAliasInstanceExport =
{
    tag: 'ComponentAliasInstanceExport',
    /// The alias kind.
    kind: ComponentExternalKind.Type,
    /// The instance index.
    instance_index: 0,
    /// The export name.
    name: "city-info",
}

export const canonicalFunc1: CanonicalFunctionLift =
{
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

export const aliasCoreExport3: ComponentAliasCoreInstanceExport = {
    tag: 'ComponentAliasCoreInstanceExport',
    kind: ExternalKind.Func,
    instance_index: 2,
    name: "hello:city/greeter#run",
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
        results: undefined, // no info about the result
    }
}

export const model: WITSection[] = [
    typeFunction2,
    aliasCoreExport3,
    canonicalFunc1,
    aliasExport3,
    component,
    instance, // TODO: re-check where type/func info should be saved
    componentExport
]
