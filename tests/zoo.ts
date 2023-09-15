// this is a model written by hand, so that we can test the parser and resolver early on
// it should match ./hello.wat (delta mistakes)

import { ComponentSection, CoreModule, CustomSection, WITSection } from '../src/parser/types';
import { ComponentExport, ComponentExternalKind } from '../src/model/exports';
import { ComponentInstanceInstantiate, CoreInstanceFromExports, CoreInstanceInstantiate, InstantiationArgKind } from '../src/model/instances';
import { ComponentTypeFunc, ComponentTypeInstance, PrimitiveValType } from '../src/model/types';
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
                tag: ModelTag.ComponentTypeDefinedTuple,
                members: [
                    {
                        tag: ModelTag.ComponentValTypePrimitive,
                        value: PrimitiveValType.S8
                    },
                    {
                        tag: ModelTag.ComponentValTypePrimitive,
                        value: PrimitiveValType.U8
                    }
                ]
            }
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
                            value: PrimitiveValType.String
                        }
                    },
                    {
                        name: 'iso-code',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.Char
                        }
                    },
                    {
                        name: 'weight',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.Float32
                        }
                    },
                    {
                        name: 'healthy',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.Bool
                        }
                    },
                    {
                        name: 'calories',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.U64
                        }
                    },
                    {
                        name: 'cost',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.S64
                        }
                    },
                    {
                        name: 'pieces',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.U8
                        }
                    },
                    {
                        name: 'shelf-temperature',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 0
                        }
                    },
                    {
                        name: 'cook-time-in-minutes',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.S32
                        }
                    }
                ]
            }
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
                    value: 1
                }
            }
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeDefinedEnum,
                members: [
                    'carbohyrdate',
                    'protein',
                    'vitamin'
                ]
            },
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'nutrition-type'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 3
                }
            }
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
                            value: PrimitiveValType.Float64
                        }
                    },
                    {
                        name: 'nutrition-type',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 4
                        }
                    }
                ]
            }
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'nutrition-info'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 5
                }
            }
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeDefinedVariant,
                variants: [
                    {
                        name: 'plastic-bag',
                        ty: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 0
                        },
                        'refines': 0
                    },
                    {
                        name: 'metal-can',
                        ty: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 0
                        },
                        'refines': 0
                    }
                ]
            }
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'material-type'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 7
                }
            }
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeDefinedEnum,
                members: [
                    'opened',
                    'closed',
                    'damaged'
                ]
            }
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'sealing-state'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 9
                }
            }
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
                            value: 6
                        }
                    },
                    {
                        name: 'material',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 8
                        }
                    },
                    {
                        name: 'sealing',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 10
                        }
                    }
                ]
            }
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'package-info'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 11
                }
            }
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
                            value: 2
                        }
                    },
                    {
                        name: 'message',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.String
                        }
                    }
                ],
                'results': {
                    tag: ModelTag.ComponentFuncResultNamed,
                    'values': []
                }
            }
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'hide-food'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefFunc,
                value: 13
            }
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
                            value: 2
                        }
                    },
                    {
                        name: 'packageinfo',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 12
                        }
                    },
                    {
                        name: 'message',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.String
                        }
                    }
                ],
                'results': {
                    tag: ModelTag.ComponentFuncResultNamed,
                    'values': []
                }
            }
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'consume-food'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefFunc,
                value: 14
            }
        },
        {
            tag: ModelTag.InstanceTypeDeclarationType,
            value: {
                tag: ModelTag.ComponentTypeFunc,
                params: [
                    {
                        name: 'packageinfo',
                        type: {
                            tag: ModelTag.ComponentValTypeType,
                            value: 12
                        }
                    },
                    {
                        name: 'message',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.String
                        }
                    }
                ],
                'results': {
                    tag: ModelTag.ComponentFuncResultNamed,
                    'values': []
                }
            }
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'open-package'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefFunc,
                value: 15
            }
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
                            value: 10
                        }
                    },
                    {
                        name: 'message',
                        type: {
                            tag: ModelTag.ComponentValTypePrimitive,
                            value: PrimitiveValType.String
                        }
                    }
                ],
                'results': {
                    tag: ModelTag.ComponentFuncResultNamed,
                    'values': []
                }
            }
        },
        {
            tag: ModelTag.InstanceTypeDeclarationExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'trash-package'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefFunc,
                value: 16
            }
        }
    ]
};

export const componentImport0: ComponentImport = {
    tag: ModelTag.ComponentImport,
    name: {
        tag: ModelTag.ComponentExternNameInterface,
        name: 'zoo:food/food'
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

export const aliasCoreExportFunc1: ComponentAliasCoreInstanceExport = {
    tag: ModelTag.ComponentAliasCoreInstanceExport,
    kind: ExternalKind.Func,
    instance_index: 0,
    name: '1',
};

export const aliasCoreExportFunc2: ComponentAliasCoreInstanceExport = {
    tag: ModelTag.ComponentAliasCoreInstanceExport,
    kind: ExternalKind.Func,
    instance_index: 0,
    name: '2',
};

export const aliasCoreExportFunc3: ComponentAliasCoreInstanceExport = {
    tag: ModelTag.ComponentAliasCoreInstanceExport,
    kind: ExternalKind.Func,
    instance_index: 0,
    name: '3',
};

export const coreInstance1: CoreInstanceFromExports = {
    tag: ModelTag.CoreInstanceFromExports,
    exports: [
        {
            name: 'hide-food',
            kind: ExternalKind.Func,
            index: 0,
        },
        {
            name: 'consume-food',
            kind: ExternalKind.Func,
            index: 1,
        },
        {
            name: 'open-package',
            kind: ExternalKind.Func,
            index: 2,
        },
        {
            name: 'trash-package',
            kind: ExternalKind.Func,
            index: 3,
        },
    ],
};

export const coreInstance2: CoreInstanceInstantiate = {
    tag: ModelTag.CoreInstanceInstantiate,
    module_index: 0,
    args: [
        {
            name: 'zoo:food/food',
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

export const aliasCoreExportFunc4: ComponentAliasCoreInstanceExport = {
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
    name: 'hide-food',
};

export const canonicalFuncLower5: CanonicalFunctionLower = {
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

export const aliasExport1: ComponentAliasInstanceExport = {
    tag: ModelTag.ComponentAliasInstanceExport,
    kind: ComponentExternalKind.Func,
    instance_index: 0,
    name: 'consume-food',
};

export const canonicalFuncLower6: CanonicalFunctionLower = {
    tag: ModelTag.CanonicalFunctionLower,
    func_index: 1,
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

export const aliasExport2: ComponentAliasInstanceExport = {
    tag: ModelTag.ComponentAliasInstanceExport,
    kind: ComponentExternalKind.Func,
    instance_index: 0,
    name: 'open-package',
};

export const canonicalFuncLower7: CanonicalFunctionLower = {
    tag: ModelTag.CanonicalFunctionLower,
    func_index: 2,
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

export const aliasExport3: ComponentAliasInstanceExport = {
    tag: ModelTag.ComponentAliasInstanceExport,
    kind: ComponentExternalKind.Func,
    instance_index: 0,
    name: 'trash-package',
};

export const canonicalFuncLower8: CanonicalFunctionLower = {
    tag: ModelTag.CanonicalFunctionLower,
    func_index: 3,
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
            index: 5,
        },
        {
            name: '1',
            kind: ExternalKind.Func,
            index: 6,
        },
        {
            name: '2',
            kind: ExternalKind.Func,
            index: 7,
        },
        {
            name: '3',
            kind: ExternalKind.Func,
            index: 8,
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
    kind: ComponentExternalKind.Type,
    instance_index: 0,
    name: 'food-info',
};

export const aliasExportType2: ComponentAliasInstanceExport = {
    tag: ModelTag.ComponentAliasInstanceExport,
    kind: ComponentExternalKind.Type,
    instance_index: 0,
    name: 'package-info',
};
export const componentTypeFunc3: ComponentTypeFunc = {
    tag: ModelTag.ComponentTypeFunc,
    params: [
        {
            name: 'foodinfo',
            type: {
                tag: ModelTag.ComponentValTypeType,
                value: 1
            }
        },
        {
            name: 'packageinfo',
            type: {
                tag: ModelTag.ComponentValTypeType,
                value: 2
            }
        }
    ],
    results: {
        tag: ModelTag.ComponentFuncResultNamed,
        values: [] // void
    },
};

export const aliasCoreExportFunc9: ComponentAliasCoreInstanceExport = {
    tag: ModelTag.ComponentAliasCoreInstanceExport,
    kind: ExternalKind.Func,
    instance_index: 2,
    name: 'zoo:food/eater#feed',
};

export const canonicalFuncLift4: CanonicalFunctionLift = {
    tag: ModelTag.CanonicalFunctionLift,
    core_func_index: 9,
    type_index: 3,
    options: [
        {
            tag: ModelTag.CanonicalOptionMemory,
            value: 0
        },
        {
            tag: ModelTag.CanonicalOptionRealloc,
            value: 4
        },
        {
            tag: ModelTag.CanonicalOptionUTF8
        },
    ],
};

export const aliasExportType4: ComponentAliasInstanceExport = {
    tag: ModelTag.ComponentAliasInstanceExport,
    kind: ComponentExternalKind.Type,
    instance_index: 0,
    name: 'food-info',
};

export const aliasExportType5: ComponentAliasInstanceExport = {
    tag: ModelTag.ComponentAliasInstanceExport,
    kind: ComponentExternalKind.Type,
    instance_index: 0,
    name: 'nutrition-type',
};

export const aliasExportType6: ComponentAliasInstanceExport = {
    tag: ModelTag.ComponentAliasInstanceExport,
    kind: ComponentExternalKind.Type,
    instance_index: 0,
    name: 'nutrition-info',
};

export const aliasExportType7: ComponentAliasInstanceExport = {
    tag: ModelTag.ComponentAliasInstanceExport,
    kind: ComponentExternalKind.Type,
    instance_index: 0,
    name: 'material-type',
};

export const aliasExportType8: ComponentAliasInstanceExport = {
    tag: ModelTag.ComponentAliasInstanceExport,
    kind: ComponentExternalKind.Type,
    instance_index: 0,
    name: 'sealing-state',
};

export const aliasExportType9: ComponentAliasInstanceExport = {
    tag: ModelTag.ComponentAliasInstanceExport,
    kind: ComponentExternalKind.Type,
    instance_index: 0,
    name: 'package-info',
};

export const componentTypeComponent0: ComponentSection = {
    tag: ModelTag.ComponentSection,
    sections: [
        {
            tag: ModelTag.ComponentTypeDefinedTuple,
            members: [
                {
                    tag: ModelTag.ComponentValTypePrimitive,
                    value: PrimitiveValType.S8
                },
                {
                    tag: ModelTag.ComponentValTypePrimitive,
                    value: PrimitiveValType.U8
                },
            ]
        },
        {
            tag: ModelTag.ComponentTypeDefinedRecord,
            members: [
                {
                    name: 'name',
                    type: {
                        tag: ModelTag.ComponentValTypePrimitive,
                        value: PrimitiveValType.String
                    }
                },
                {
                    name: 'iso-code',
                    type: {
                        tag: ModelTag.ComponentValTypePrimitive,
                        value: PrimitiveValType.Char
                    }
                },
                {
                    name: 'weight',
                    type: {
                        tag: ModelTag.ComponentValTypePrimitive,
                        value: PrimitiveValType.Float32
                    }
                },
                {
                    name: 'healthy',
                    type: {
                        tag: ModelTag.ComponentValTypePrimitive,
                        value: PrimitiveValType.Bool
                    }
                },
                {
                    name: 'calories',
                    type: {
                        tag: ModelTag.ComponentValTypePrimitive,
                        value: PrimitiveValType.U64
                    }
                },
                {
                    name: 'cost',
                    type: {
                        tag: ModelTag.ComponentValTypePrimitive,
                        value: PrimitiveValType.S64
                    }
                },
                {
                    name: 'pieces',
                    type: {
                        tag: ModelTag.ComponentValTypePrimitive,
                        value: PrimitiveValType.U8
                    }
                },
                {
                    name: 'shelf-temperature',
                    type: {
                        tag: ModelTag.ComponentValTypeType,
                        value: 0
                    }
                },
                {
                    name: 'cook-time-in-minutes',
                    type: {
                        tag: ModelTag.ComponentValTypePrimitive,
                        value: PrimitiveValType.S32
                    }
                }
            ]
        },
        {
            tag: ModelTag.ComponentImport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'import-type-food-info'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 1
                }
            }
        },
        {
            tag: ModelTag.ComponentTypeDefinedEnum,
            members: [
                'carbohyrdate',
                'protein',
                'vitamin'
            ]
        },
        {
            tag: ModelTag.ComponentImport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'import-type-nutrition-type'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 3
                }
            }
        },
        {
            tag: ModelTag.ComponentTypeDefinedRecord,
            members: [
                {
                    name: 'percentage',
                    type: {
                        tag: ModelTag.ComponentValTypePrimitive,
                        value: PrimitiveValType.Float64
                    }
                },
                {
                    name: 'nutrition-type',
                    type: {
                        tag: ModelTag.ComponentValTypeType,
                        value: 4
                    }
                }
            ]
        },
        {
            tag: ModelTag.ComponentImport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'import-type-nutrition-info'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 5
                }
            }
        },
        {
            tag: ModelTag.ComponentTypeDefinedVariant,
            variants: [
                {
                    name: 'plastic-bag',
                    ty: {
                        tag: ModelTag.ComponentValTypeType,
                        value: 0
                    },
                    refines: 0
                },
                {
                    name: 'metal-can',
                    ty: {
                        tag: ModelTag.ComponentValTypeType,
                        value: 0
                    },
                    refines: 0
                }
            ]
        },
        {
            tag: ModelTag.ComponentImport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'import-type-material-type'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 7
                }
            }
        },
        {
            tag: ModelTag.ComponentTypeDefinedEnum,
            members: [
                'opened',
                'closed',
                'damaged'
            ]
        },
        {
            tag: ModelTag.ComponentImport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'import-type-sealing-state'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 9
                }
            }
        },
        {
            tag: ModelTag.ComponentTypeDefinedRecord,
            members: [
                {
                    name: 'nutrition',
                    type: {
                        tag: ModelTag.ComponentValTypeType,
                        value: 6
                    }
                },
                {
                    name: 'material',
                    type: {
                        tag: ModelTag.ComponentValTypeType,
                        value: 8
                    }
                },
                {
                    name: 'sealing',
                    type: {
                        tag: ModelTag.ComponentValTypeType,
                        value: 10
                    }
                }
            ]
        },
        {
            tag: ModelTag.ComponentImport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'import-type-package-info'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 11
                }
            }
        },
        {
            tag: ModelTag.ComponentImport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'import-type-food-info0'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 2
                }
            }
        },
        {
            tag: ModelTag.ComponentImport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'import-type-package-info0'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefType,
                value: {
                    tag: ModelTag.TypeBoundsEq,
                    value: 12
                }
            }
        },
        {
            tag: ModelTag.ComponentTypeFunc,
            'params': [
                {
                    name: 'foodinfo',
                    type: {
                        tag: ModelTag.ComponentValTypeType,
                        value: 13
                    }
                },
                {
                    name: 'packageinfo',
                    type: {
                        tag: ModelTag.ComponentValTypeType,
                        value: 14
                    }
                }
            ],
            'results': {
                tag: ModelTag.ComponentFuncResultNamed,
                'values': []
            }
        },
        {
            tag: ModelTag.ComponentImport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'import-func-feed'
            },
            ty: {
                tag: ModelTag.ComponentTypeRefFunc,
                value: 15
            }
        },
        {
            tag: ModelTag.ComponentExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'food-info'
            },
            kind: ComponentExternalKind.Type,
            index: 2
        },
        {
            tag: ModelTag.ComponentExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'package-info'
            },
            kind: ComponentExternalKind.Type,
            index: 12
        },
        {
            tag: ModelTag.ComponentTypeFunc,
            'params': [
                {
                    name: 'foodinfo',
                    type: {
                        tag: ModelTag.ComponentValTypeType,
                        value: 16
                    }
                },
                {
                    name: 'packageinfo',
                    type: {
                        tag: ModelTag.ComponentValTypeType,
                        value: 17
                    }
                }
            ],
            'results': {
                tag: ModelTag.ComponentFuncResultNamed,
                'values': []
            }
        },
        {
            tag: ModelTag.ComponentExport,
            name: {
                tag: ModelTag.ComponentExternNameKebab,
                name: 'feed'
            },
            kind: ComponentExternalKind.Func,
            index: 0,
            ty: {
                tag: ModelTag.ComponentTypeRefFunc,
                value: 18
            }
        }
    ]
};

export const componentInstance1: ComponentInstanceInstantiate = {
    tag: ModelTag.ComponentInstanceInstantiate,
    component_index: 0,
    args: [
        {
            name: 'import-func-feed',
            kind: ComponentExternalKind.Func,
            index: 4
        },
        {
            name: 'import-type-food-info',
            kind: ComponentExternalKind.Type,
            index: 4
        },
        {
            name: 'import-type-nutrition-type',
            kind: ComponentExternalKind.Type,
            index: 5
        },
        {
            name: 'import-type-nutrition-info',
            kind: ComponentExternalKind.Type,
            index: 6
        },
        {
            name: 'import-type-material-type',
            kind: ComponentExternalKind.Type,
            index: 7
        },
        {
            name: 'import-type-sealing-state',
            kind: ComponentExternalKind.Type,
            index: 8
        },
        {
            name: 'import-type-package-info',
            kind: ComponentExternalKind.Type,
            index: 9
        },
        {
            name: 'import-type-food-info0',
            kind: ComponentExternalKind.Type,
            index: 1
        },
        {
            name: 'import-type-package-info0',
            kind: ComponentExternalKind.Type,
            index: 2
        }
    ]
};

export const componentExport2: ComponentExport = {
    tag: ModelTag.ComponentExport,
    name: { tag: ModelTag.ComponentExternNameInterface, name: 'zoo:food/eater' },
    kind: ComponentExternalKind.Instance,
    index: 1,
    ty: undefined
};

export const customSection: CustomSection = {
    tag: ModelTag.CustomSection,
    name: 'producers'
};

export const expectedModel: WITSection[] = [
    componentTypeInstance0,
    componentImport0,
    coreModule0,
    coreModule1,
    coreModule2,
    coreInstance0,
    aliasCoreExportFunc0,
    aliasCoreExportFunc1,
    aliasCoreExportFunc2,
    aliasCoreExportFunc3,
    coreInstance1,
    coreInstance2,
    aliasCoreExportMemory0,
    aliasCoreExportFunc4,
    aliasCoreExportTable0,
    aliasExport0,
    canonicalFuncLower5,
    aliasExport1,
    canonicalFuncLower6,
    aliasExport2,
    canonicalFuncLower7,
    aliasExport3,
    canonicalFuncLower8,
    coreInstance3,
    coreInstance4,
    aliasExportType1,
    aliasExportType2,
    componentTypeFunc3,
    aliasCoreExportFunc9,
    canonicalFuncLift4,
    aliasExportType4,
    aliasExportType5,
    aliasExportType6,
    aliasExportType7,
    aliasExportType8,
    aliasExportType9,
    componentTypeComponent0,
    componentInstance1,
    componentExport2,
    customSection
];
