// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import isDebug from 'env:isDebug';
import { ComponentFunction, CoreFunction } from '../model/aliases';
import { CoreFuncIndex, CoreInstanceIndex, CoreModuleIndex, ComponentFuncIndex, ComponentInstanceIndex, ComponentTypeIndex } from '../model/indices';
import { CoreInstance, ComponentInstance } from '../model/instances';
import { ComponentType } from '../model/types';
import { CoreModule } from '../parser/types';
import { jsco_assert } from '../utils/assert';
import { modelTagName } from '../utils/debug-names';
import { ResolverContext } from './types';

export function getCoreFunction(rctx: ResolverContext, index: CoreFuncIndex): CoreFunction {
    jsco_assert(index >= 0 && index < rctx.indexes.coreFunctions.length,
        () => `CoreFuncIndex ${index} out of bounds [0..${rctx.indexes.coreFunctions.length}).` +
            (isDebug ? ` Available: [${rctx.indexes.coreFunctions.map((f, i) => `${i}:${modelTagName(f.tag)}`).join(', ')}]` : ''));
    const result = rctx.indexes.coreFunctions[index];
    if (!result) throw new Error(`CoreFuncIndex ${index} out of bounds`);
    return result;
}

export function getCoreInstance(rctx: ResolverContext, index: CoreInstanceIndex): CoreInstance {
    jsco_assert(index >= 0 && index < rctx.indexes.coreInstances.length,
        () => `CoreInstanceIndex ${index} out of bounds [0..${rctx.indexes.coreInstances.length}).` +
            (isDebug ? ` Available: [${rctx.indexes.coreInstances.map((i2, idx) => `${idx}:${modelTagName(i2.tag)}`).join(', ')}]` : ''));
    const result = rctx.indexes.coreInstances[index];
    if (!result) throw new Error(`CoreInstanceIndex ${index} out of bounds`);
    return result;
}

export function getCoreModule(rctx: ResolverContext, index: CoreModuleIndex): CoreModule {
    jsco_assert(index >= 0 && index < rctx.indexes.coreModules.length,
        () => `CoreModuleIndex ${index} out of bounds [0..${rctx.indexes.coreModules.length})`);
    const result = rctx.indexes.coreModules[index];
    if (!result) throw new Error(`CoreModuleIndex ${index} out of bounds`);
    return result;
}

export function getComponentFunction(rctx: ResolverContext, index: ComponentFuncIndex): ComponentFunction {
    jsco_assert(index >= 0 && index < rctx.indexes.componentFunctions.length,
        () => `ComponentFuncIndex ${index} out of bounds [0..${rctx.indexes.componentFunctions.length}).` +
            (isDebug ? ` Available: [${rctx.indexes.componentFunctions.map((f, i) => `${i}:${modelTagName(f.tag)}`).join(', ')}]` : ''));
    const result = rctx.indexes.componentFunctions[index];
    if (!result) throw new Error(`ComponentFuncIndex ${index} out of bounds`);
    // Array holds ComponentFunction | ComponentExport; callers dispatch on .tag
    return result as ComponentFunction;
}

export function getComponentInstance(rctx: ResolverContext, index: ComponentInstanceIndex): ComponentInstance {
    jsco_assert(index >= 0 && index < rctx.indexes.componentInstances.length,
        () => `ComponentInstanceIndex ${index} out of bounds [0..${rctx.indexes.componentInstances.length}).` +
            (isDebug ? ` Available: [${rctx.indexes.componentInstances.map((i2, idx) => `${idx}:${modelTagName(i2.tag)}`).join(', ')}]` : ''));
    const result = rctx.indexes.componentInstances[index];
    if (!result) throw new Error(`ComponentInstanceIndex ${index} out of bounds`);
    // Array holds ComponentInstance | ComponentExport; callers dispatch on .tag
    return result as ComponentInstance;
}

export function getComponentType(rctx: ResolverContext, index: ComponentTypeIndex): ComponentType {
    jsco_assert(index >= 0 && index < rctx.indexes.componentTypes.length,
        () => `ComponentTypeIndex ${index} out of bounds [0..${rctx.indexes.componentTypes.length}).` +
            (isDebug ? ` Available: [${rctx.indexes.componentTypes.map((t, i) => `${i}:${modelTagName(t.tag)}`).join(', ')}]` : ''));
    const result = rctx.indexes.componentTypes[index];
    if (!result) throw new Error(`ComponentTypeIndex ${index} out of bounds`);
    // Array holds ComponentType | ComponentExport; callers dispatch on .tag
    return result as ComponentType;
}

export type { CoreFuncIndex, CoreInstanceIndex, CoreModuleIndex, ComponentFuncIndex, ComponentInstanceIndex, ComponentTypeIndex } from '../model/indices';
