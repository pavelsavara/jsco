import { ComponentFunction, CoreFunction } from '../model/aliases';
import { CoreFuncIndex, CoreInstanceIndex, CoreModuleIndex, ComponentFuncIndex, ComponentInstanceIndex, ComponentTypeIndex } from '../model/indices';
import { CoreInstance, ComponentInstance } from '../model/instances';
import { ComponentType } from '../model/types';
import { CoreModule } from '../parser/types';
import { jsco_assert } from '../utils/assert';
import { ResolverContext } from './types';

export function getCoreFunction(rctx: ResolverContext, index: CoreFuncIndex): CoreFunction {
    jsco_assert(index >= 0 && index < rctx.indexes.coreFunctions.length,
        () => `CoreFuncIndex ${index} out of bounds (length ${rctx.indexes.coreFunctions.length})`);
    return rctx.indexes.coreFunctions[index];
}

export function getCoreInstance(rctx: ResolverContext, index: CoreInstanceIndex): CoreInstance {
    jsco_assert(index >= 0 && index < rctx.indexes.coreInstances.length,
        () => `CoreInstanceIndex ${index} out of bounds (length ${rctx.indexes.coreInstances.length})`);
    return rctx.indexes.coreInstances[index];
}

export function getCoreModule(rctx: ResolverContext, index: CoreModuleIndex): CoreModule {
    jsco_assert(index >= 0 && index < rctx.indexes.coreModules.length,
        () => `CoreModuleIndex ${index} out of bounds (length ${rctx.indexes.coreModules.length})`);
    return rctx.indexes.coreModules[index];
}

export function getComponentFunction(rctx: ResolverContext, index: ComponentFuncIndex): ComponentFunction {
    jsco_assert(index >= 0 && index < rctx.indexes.componentFunctions.length,
        () => `ComponentFuncIndex ${index} out of bounds (length ${rctx.indexes.componentFunctions.length})`);
    return rctx.indexes.componentFunctions[index];
}

export function getComponentInstance(rctx: ResolverContext, index: ComponentInstanceIndex): ComponentInstance {
    jsco_assert(index >= 0 && index < rctx.indexes.componentInstances.length,
        () => `ComponentInstanceIndex ${index} out of bounds (length ${rctx.indexes.componentInstances.length})`);
    return rctx.indexes.componentInstances[index];
}

export function getComponentType(rctx: ResolverContext, index: ComponentTypeIndex): ComponentType {
    jsco_assert(index >= 0 && index < rctx.indexes.componentTypes.length,
        () => `ComponentTypeIndex ${index} out of bounds (length ${rctx.indexes.componentTypes.length})`);
    return rctx.indexes.componentTypes[index];
}

export type { CoreFuncIndex, CoreInstanceIndex, CoreModuleIndex, ComponentFuncIndex, ComponentInstanceIndex, ComponentTypeIndex } from '../model/indices';
