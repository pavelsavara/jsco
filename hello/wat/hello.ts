import { WITSection } from '../../src/parser/types'
import { ComponentExport, ComponentExternalKind } from '../../src/model/exports'
import { InstanceFromExports, InstanceInstantiate, InstantiationArgKind } from '../../src/model/instances'
import { ExternalKind } from '../../src/model/core'

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
        }
    ]
}

export const model: WITSection[] = [
    instance,
    componentExport
]
