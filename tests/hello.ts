// this is a model written by hand, so that we can test the parser and resolver early on
// it should match ./hello.wat (delta mistakes)

import { WITSection } from '../src/parser/types';
import { ComponentExport, ComponentExternalKind } from '../src/model/exports';
import { ComponentInstanceInstantiate, CoreInstanceFromExports, CoreInstanceInstantiate, InstantiationArgKind } from '../src/model/instances';
import { ComponentTypeComponent, ComponentTypeFunc, ComponentTypeInstance, PrimitiveValType } from '../src/model/types';
import { ComponentAliasCoreInstanceExport, ComponentAliasInstanceExport } from '../src/model/aliases';
import { CanonicalFunctionLift, CanonicalFunctionLower } from '../src/model/canonicals';
import { ExternalKind } from '../src/model/core';
import { ComponentImport } from '../src/model/imports';
import { ResolverContext } from '../src/resolver/types';
import { ModelTag } from '../src/model/tags';
import { createLifting, createLowering } from '../src/binding';
import { js, wasm } from './hello-component';
import { BindingContext, Tcabi_realloc, WasmPointer } from '../src/binding/types';

export const componentType: ComponentTypeInstance = {
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
                    value: []//void
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

export const componentImport: ComponentImport = {
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

// TODO: why is (instantiate 1) empty? We cannot put anything into value, right?
export const coreInstance0: CoreInstanceFromExports = {
    tag: ModelTag.CoreInstanceFromExports,
    exports: [],
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

export const canonicalFunc2: CanonicalFunctionLower = {
    tag: ModelTag.CanonicalFunctionLower,
    func_index: 0,
    options: [
        {
            tag: ModelTag.CanonicalOptionUTF8
        },
        {
            tag: ModelTag.CanonicalOptionMemory,
            value: 0
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

export const aliasExport1: ComponentAliasInstanceExport = {
    tag: ModelTag.ComponentAliasInstanceExport,
    /// The alias kind.
    kind: ComponentExternalKind.Type,
    /// The instance index.
    instance_index: 0,
    /// The export name.
    name: 'city-info',
};

export const typeFunction2: ComponentTypeFunc = {
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
    results: undefined as any, // no info about the result

};

export const aliasCoreExportFunc3: ComponentAliasCoreInstanceExport = {
    tag: ModelTag.ComponentAliasCoreInstanceExport,
    kind: ExternalKind.Func,
    instance_index: 2,
    name: 'hello:city/greeter#run',
};

export const canonicalFunc1: CanonicalFunctionLift = {
    tag: ModelTag.CanonicalFunctionLift,
    core_func_index: 3,
    type_index: 2,
    options: [
        {
            tag: ModelTag.CanonicalOptionUTF8
        },
        {
            tag: ModelTag.CanonicalOptionRealloc,
            value: 1
        },
        {
            tag: ModelTag.CanonicalOptionMemory,
            value: 0
        }
    ],
};

export const aliasExportType3: ComponentAliasInstanceExport = {
    tag: ModelTag.ComponentAliasInstanceExport,
    kind: ComponentExternalKind.Type,
    instance_index: 0,
    name: 'city-info',
};

export const component: ComponentTypeComponent = {
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
                results:
                {
                    tag: ModelTag.ComponentFuncResultUnnamed,
                    value: undefined as any, // there is no info about the results
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
                    value: [] // void
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
export const componentInstance: ComponentInstanceInstantiate = {
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

export const componentExport: ComponentExport = {
    tag: ModelTag.ComponentExport,
    name: { tag: ModelTag.ComponentExternNameInterface, name: 'hello:city/greeter' },
    kind: ComponentExternalKind.Instance,
    index: 1,
    ty: undefined
};

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
];

export const expectedModelByType: Partial<ResolverContext> = {
    modules: [], other: [],
    componentExports: [componentExport],
    componentImports: [componentImport],
    coreInstances: [coreInstance0, coreInstance1, coreInstance2, coreInstance3, coreInstance4],
    componentInstances: [componentInstance],
    aliases: [aliasCoreExportFunc0, aliasCoreExportMemory0, aliasCoreExportFunc1, aliasCoreExportTable0, aliasExport0, aliasExport1, aliasCoreExportFunc3, aliasExportType3],
    cannon: [canonicalFunc2, canonicalFunc1],
    componentTypeInstance: [componentType],
    componentTypeFunc: [typeFunction2],
    componentTypeComponent: [component],
};


export async function resolveJCO(imports: any) {
    const rctx: ResolverContext = undefined as any;
    const ctx: BindingContext = undefined as any;
    const wasmInstantiate = WebAssembly.instantiate;

    const componentImports = (imports ? imports : {}) as {
        'hello:city/city': js.Imports,
    };

    const { sendMessage } = componentImports['hello:city/city'];
    const stringToJs = createLowering(rctx, {
        tag: ModelTag.ComponentValTypePrimitive,
        value: PrimitiveValType.String,
    });

    const stringFromJs = createLifting(rctx, {
        tag: ModelTag.ComponentValTypePrimitive,
        value: PrimitiveValType.String,
    });

    const numberToUint32 = createLifting(rctx, {
        tag: ModelTag.ComponentValTypePrimitive,
        value: PrimitiveValType.U32,
    });

    const bigIntToInt64 = createLifting(rctx, {
        tag: ModelTag.ComponentValTypePrimitive,
        value: PrimitiveValType.S64,
    });

    function sendMessageFromAbi(ptr: WasmPointer, len: WasmPointer) {
        const ptr0 = ptr;
        const len0 = len;
        const result0 = stringToJs(ctx, ptr0, len0);
        sendMessage(result0 as any);
    }

    function runToAbi(info: js.CityInfo) {
        const args = [
            ...stringFromJs(ctx, info.name),
            numberToUint32(ctx, info.headCount),
            bigIntToInt64(ctx, info.budget),
        ];
        exports0['hello:city/greeter#run'].apply(null, args as any);
    }

    const module0: WebAssembly.Module = await rctx.modules[0].module!;
    const module1: WebAssembly.Module = await rctx.modules[1].module!;
    const module2: WebAssembly.Module = await rctx.modules[2].module!;

    const exports1 = (await wasmInstantiate(module1)).exports as wasm.module1Exports;

    const imports0: wasm.module0Imports = {
        'hello:city/city': {
            'send-message': exports1['0'],
        },
    };
    const exports0 = (await wasmInstantiate(module0, imports0)).exports as wasm.module0Exports;

    const cabi_realloc: Tcabi_realloc = exports0.cabi_realloc;
    const memory0 = exports0.memory as WebAssembly.Memory;
    ctx.initialize(memory0, cabi_realloc);

    const imports2: wasm.module2Imports = {
        '': {
            $imports: exports1.$imports,
            '0': sendMessageFromAbi,
        },
    };

    await wasmInstantiate(module2, imports2);

    const greeter0_1_0: js.Exports = {
        run: runToAbi,
    };
    return greeter0_1_0;
}