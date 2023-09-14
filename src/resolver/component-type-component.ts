import { BindingContext } from '../binding/types';
import { ModelTag } from '../model/tags';
import { jsco_assert } from '../utils/assert';
import { cacheFactory } from './context';
import { ResolverContext, ImplComponentTypeComponent, JsInterface } from './types';

export function prepareComponentTypeComponent(rctx: ResolverContext, componentIndex: number): ImplComponentTypeComponent {
    async function createComponentType(ctx: BindingContext, args: any[], exports: string[]): Promise<JsInterface> {
        //console.log('createComponentType', index, section);
        const ifc: JsInterface = {} as any;

        // TODO: this is very fake!
        const fakeRun = () => {
            const fakeMessage = 'Welcome to Prague, we invite you for a drink!';
            ctx.imports['hello:city/city'].sendMessage(fakeMessage);
        };

        for (const exportName of exports) {
            //console.log('createComponentType', exportName);
            ifc[exportName] = fakeRun;
        }

        return ifc;
    }

    const section = rctx.indexes.componentTypes[componentIndex];
    ///console.log('prepareComponentType', section);
    jsco_assert(section.tag === ModelTag.ComponentTypeComponent, () => `expected ComponentTypeComponent, got ${section.tag}`);
    const exports: string[] = [];
    for (const declaration of section.declarations) {
        switch (declaration.tag) {
            case ModelTag.ComponentTypeDeclarationType:
                //console.log('ComponentTypeDeclarationType', declaration);
                break;
            case ModelTag.ComponentImport:
                //console.log('ComponentImport', declaration);
                break;
            case ModelTag.ComponentTypeDeclarationExport:
                switch (declaration.ty.tag) {
                    case ModelTag.ComponentTypeRefType:
                        // TODO console.log('prepareComponentType declaration', declaration);
                        break;
                    case ModelTag.ComponentTypeRefFunc:
                        exports.push(declaration.name.name);
                        //rctx.prepareFunctionType(declaration.ty.value);
                        break;
                    default:
                        throw new Error(`${declaration.ty.tag} not implemented`);
                }
                break;
            default:
                throw new Error(`${declaration.tag} not implemented`);
        }
    }

    const factory: ImplComponentTypeComponent = cacheFactory<ImplComponentTypeComponent>(rctx.implComponentTypes, componentIndex, () => async (ctx, args) => {
        return createComponentType(ctx, args, exports);
    });

    return factory;
}

