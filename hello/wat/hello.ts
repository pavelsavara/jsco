import { WITSection } from '../../src/parser/types'
import { ComponentExport, ComponentExternalKind } from '../../src/model/exports'
import { InstanceInstantiate, InstantiationArgKind } from '../../src/model/instances'
import { ComponentTypeComponent, PrimitiveValType } from '../../src/model/types'

// (export (;2;) (interface "hello:city/greeter") (instance 1))
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

/*
  (instance (;1;) (instantiate 0
      (with "import-func-run" (func 1))
      (with "import-type-city-info" (type 3))
      (with "import-type-city-info0" (type 1))
    )
  )
*/

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
                                tag: 'ComponentValTypePrimitive',
                                value: PrimitiveValType.S32 // no guarantee that 2 is int32
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
                                tag: 'ComponentValTypePrimitive',
                                value: PrimitiveValType.S32 // no guarantee that 4 is int32
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

export const model: WITSection[] = [
    component,
    instance, // TODO: re-check where type/func info should be saved
    componentExport
]
