import { BindingContext } from '../binding/types';
import { ComponentInstance } from '../model/instances';
import { ModelTag } from '../model/tags';
import { ResolverContext, JsInterface, InstanceFactory } from './types';

export function prepareComponentInstance(rctx: ResolverContext, componentInstanceIndex: number): InstanceFactory {
    function createComponentInstance(index: number, section: ComponentInstance, ctx: BindingContext): JsInterface {
        console.log('createComponentInstance', index, section);
        const ifc: JsInterface = {} as any;
        // TODO: this is very fake!
        ifc['run'] = () => {
            const fakeMessage = 'Welcome in Prague, we invite you for a drink!';
            ctx.imports['hello:city/city'].sendMessage(fakeMessage);
        };
        return ifc;
    }

    let factory: InstanceFactory;
    const section = rctx.componentInstances[componentInstanceIndex];
    switch (section.tag) {
        case ModelTag.ComponentInstanceInstantiate:
            factory = cacheFactory(rctx, componentInstanceIndex, () => (ctx) => createComponentInstance(componentInstanceIndex, section, ctx));
            rctx.componentInstanceFactories[componentInstanceIndex] = factory;
            for (const arg of section.args) {
                //TODO rctx.prepareComponentInstance(section.exports);
            }
            break;
        case ModelTag.ComponentInstanceFromExports:
        default:
            throw new Error(`${section.tag} not implemented`);
    }
    return factory;
}

function cacheFactory(rctx: ResolverContext, cacheIndex: number, ff: () => InstanceFactory): InstanceFactory {
    const cache = rctx.componentInstanceFactories;
    if (cache[cacheIndex] !== undefined) {
        return cache[cacheIndex];
    }
    const factory = ff();
    cache[cacheIndex] = factory;
    return factory;
}