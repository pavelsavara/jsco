import { BindingContext } from '../binding/types';
import { ComponentExternalKind } from '../model/exports';
import { ModelTag } from '../model/tags';
import { prepareComponentTypeComponent } from './component-type-component';
import { ResolverContext, JsInterface, ImplComponentInstance } from './types';

export function prepareComponentInstance(rctx: ResolverContext, componentInstanceIndex: number): ImplComponentInstance {
    //console.log('prepareComponentInstance', componentInstanceIndex);
    function createComponentInstance(index: number, componentType: any, ctx: BindingContext): JsInterface {
        //console.log('createComponentInstance', index, section);
        const ifc: JsInterface = {} as any;
        // TODO: this is very fake!
        ifc['run'] = () => {
            const fakeMessage = 'Welcome toPrague, we invite you for a drink!';
            ctx.imports['hello:city/city'].sendMessage(fakeMessage);
        };
        return ifc;
    }

    let factory: ImplComponentInstance;
    const section = rctx.componentInstances[componentInstanceIndex];
    switch (section.tag) {
        case ModelTag.ComponentInstanceInstantiate: {
            section.component_index;
            const typeFactory = prepareComponentTypeComponent(rctx, section.component_index);

            factory = cacheFactory(rctx, componentInstanceIndex, () => (ctx) => {
                const componentType = typeFactory(ctx);
                return createComponentInstance(componentInstanceIndex, componentType, ctx);
            });
            rctx.implComponentInstance[componentInstanceIndex] = factory;
            for (const arg of section.args) {
                /*
                switch (arg.kind) {
                    case ComponentExternalKind.Func:
                        rctx.prepareFunctionType(arg.index);
                        break;
                    case ComponentExternalKind.Component:
                        rctx.prepareComponentType(arg.index);
                        break;
                    case ComponentExternalKind.Type:
                        rctx.prepareDefinedType(arg.index);
                        break;
                    default:
                        throw new Error(`"${arg.kind}" not implemented`);
                }*/
            }
            break;
        }
        case ModelTag.ComponentInstanceFromExports:
        default:
            throw new Error(`${section.tag} not implemented`);
    }
    return factory;
}

function cacheFactory(rctx: ResolverContext, cacheIndex: number, ff: () => ImplComponentInstance): ImplComponentInstance {
    const cache = rctx.implComponentInstance;
    if (cache[cacheIndex] !== undefined) {
        return cache[cacheIndex];
    }
    const factory = ff();
    cache[cacheIndex] = factory;
    return factory;
}