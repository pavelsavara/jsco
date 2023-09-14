import { BindingContext } from '../binding/types';
import { ComponentExternalKind } from '../model/exports';
import { ModelTag } from '../model/tags';
import { prepareComponentFunction } from './component-functions';
import { prepareComponentTypeComponent } from './component-type-component';
import { cacheFactory } from './context';
import { ResolverContext, JsInterface, ImplComponentInstance } from './types';

export function prepareComponentInstance(rctx: ResolverContext, componentInstanceIndex: number): ImplComponentInstance {
    //console.log('prepareComponentInstance', componentInstanceIndex);
    async function createComponentInstance(ctx: BindingContext, componentType: JsInterface): Promise<JsInterface> {
        //console.log('createComponentInstance', index, section);
        return componentType;
    }

    let factory: ImplComponentInstance;
    const section = rctx.indexes.componentInstances[componentInstanceIndex];
    switch (section.tag) {
        case ModelTag.ComponentInstanceInstantiate: {
            section.component_index;
            const typeFactory = prepareComponentTypeComponent(rctx, section.component_index);
            const argFactories: ((ctx: BindingContext) => Promise<any>)[] = [];
            for (const arg of section.args) {
                switch (arg.kind) {
                    case ComponentExternalKind.Func: {
                        const func = prepareComponentFunction(rctx, arg.index);
                        argFactories.push(func);
                        break;
                    }
                    case ComponentExternalKind.Type:
                        //prepareDefinedType(arg.index);
                        break;
                    case ComponentExternalKind.Component:
                    default:
                        throw new Error(`"${arg.kind}" not implemented`);
                }
            }
            factory = cacheFactory(rctx.implComponentInstance, componentInstanceIndex, () => async (ctx) => {
                const args = [];
                for (const argFactory of argFactories) {
                    const arg = argFactory(ctx);
                    args.push(arg);
                }
                const componentType = await typeFactory(ctx, args);
                return createComponentInstance(ctx, componentType);
            });
            break;
        }
        case ModelTag.ComponentInstanceFromExports:
        default:
            throw new Error(`${section.tag} not implemented`);
    }
    return factory;
}

