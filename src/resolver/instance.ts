import { BindingContext } from '../binding/types';
import { ComponentInstance } from '../model/instances';
import { ModelTag } from '../model/tags';
import { ResolverContext, JsInterface } from './types';

export function prepareComponentInstance(rctx: ResolverContext, componentInstanceIndex: number): void {
    function createComponentInstance(index: number, section: ComponentInstance, ctx: BindingContext): JsInterface {
        const ifc: JsInterface = {} as any;
        // TODO: this is very fake!
        ifc['run'] = () => {
            const fakeMessage = 'Welcome in Prague, we invite you for a drink!';
            ctx.imports['hello:city/city'].sendMessage(fakeMessage);
        };
        return ifc;
    }

    const section = rctx.componentInstances[componentInstanceIndex];
    switch (section.tag) {
        case ModelTag.ComponentInstanceInstantiate:
            rctx.componentInstanceFactories[componentInstanceIndex] = (ctx) => createComponentInstance(componentInstanceIndex, section, ctx);
            for (const arg of section.args) {
                //TODO rctx.prepareComponentInstance(section.exports);
            }
            break;
        case ModelTag.ComponentInstanceFromExports:
        default:
            throw new Error(`${section.tag} not implemented`);
    }
}
