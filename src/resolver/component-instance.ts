import { BindingContext } from '../binding/types';
import { ComponentExternalKind } from '../model/exports';
import { ModelTag } from '../model/tags';
import { prepareComponentTypeComponent } from './component-type-component';
import { cacheFactory } from './context';
import { ResolverContext, JsInterface, ImplComponentInstance } from './types';

export function prepareComponentInstance(rctx: ResolverContext, componentInstanceIndex: number): ImplComponentInstance {
    //console.log('prepareComponentInstance', componentInstanceIndex);
    function createComponentInstance(ctx: BindingContext, index: number, componentType: JsInterface): JsInterface {
        //console.log('createComponentInstance', index, section);
        return componentType;
    }

    let factory: ImplComponentInstance;
    const section = rctx.componentInstances[componentInstanceIndex];
    switch (section.tag) {
        case ModelTag.ComponentInstanceInstantiate: {
            section.component_index;
            const typeFactory = prepareComponentTypeComponent(rctx, section.component_index);
            const args = [];
            for (const arg of section.args) {
                switch (arg.kind) {
                    case ComponentExternalKind.Func:
                        //prepareFunctionType(arg.index);
                        console.log('ComponentExternalKind.Func', arg);
                        break;
                    case ComponentExternalKind.Component:
                        //prepareComponentType(arg.index);
                        break;
                    case ComponentExternalKind.Type:
                        //prepareDefinedType(arg.index);
                        break;
                    default:
                        throw new Error(`"${arg.kind}" not implemented`);
                }
            }
            factory = cacheFactory(rctx.implComponentInstance, componentInstanceIndex, () => (ctx) => {
                const componentType = typeFactory(ctx);
                return createComponentInstance(ctx, componentInstanceIndex, componentType);
            });
            break;
        }
        case ModelTag.ComponentInstanceFromExports:
        default:
            throw new Error(`${section.tag} not implemented`);
    }
    return factory;
}

