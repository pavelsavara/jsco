import { ModelTag } from '../model/tags';
import { jsco_assert } from '../utils/assert';
import { memoizePrepare } from './context';
import { ResolverContext, ImplComponentTypeComponent, JsInterface } from './types';

export function prepareComponentTypeComponent(rctx: ResolverContext, componentIndex: number): Promise<ImplComponentTypeComponent> {
    const section = rctx.indexes.componentTypes[componentIndex];
    return memoizePrepare<ImplComponentTypeComponent>(rctx, section, async () => {
        //console.log('TODO prepareComponentType', section);
        jsco_assert(section.tag === ModelTag.ComponentTypeComponent, () => `expected ComponentTypeComponent, got ${section.tag}`);
        const exports: string[] = [];
        const other: any[] = [];
        for (const declaration of section.declarations) {
            switch (declaration.tag) {
                case ModelTag.ComponentTypeDeclarationType:
                    //console.log('TODO ComponentTypeDeclarationType', declaration);
                    other.push(declaration.value.tag);
                    break;
                case ModelTag.ComponentImport: {
                    /*
                    const importName = declaration.name.name;//TODO name
                    switch (declaration.ty.tag) {
                        case ModelTag.ComponentTypeRefType: {
                            //console.log('TODO ComponentImport', declaration);
                            break;
                        }
                        case ModelTag.ComponentTypeRefFunc: {
                            //console.log('TODO ComponentImport', declaration);
                            break;
                        }
                        case ModelTag.ComponentTypeRefModule:
                        case ModelTag.ComponentTypeRefValue:
                        case ModelTag.ComponentTypeRefInstance:
                        case ModelTag.ComponentTypeRefComponent:
                        default:
                            throw new Error(`${declaration.ty.tag} not implemented`);
                    }
                    //await prepareComponentImport(rctx, declaration.ty);
                    */
                    break;
                }
                case ModelTag.ComponentTypeDeclarationExport: {
                    switch (declaration.ty.tag) {
                        case ModelTag.ComponentTypeRefFunc: {
                            exports.push(declaration.name.name);
                            break;
                        }
                        case ModelTag.ComponentTypeRefType:
                            //console.log('TODO ComponentTypeRefType declaration', declaration);
                            break;
                        default:
                            throw new Error(`${declaration.ty.tag} not implemented`);
                    }
                    break;
                }
                default:
                    throw new Error(`${declaration.tag} not implemented`);
            }
        }

        return async (ctx, args) => {
            //console.log('createComponentType', ctx.debugStack?.join(' > '));
            const ifc: JsInterface = {
                TODO: section.tag,
                args,
                other,
            } as any;


            // TODO: this is very fake!
            /*const fakeRun = () => {
                const fakeMessage = 'Welcome to Prague, we invite you for a drink!';
                ctx.rootImports['hello:city/city'].sendMessage(fakeMessage);
            };*/
            const fakeRun = args[0];

            for (const exportName of exports) {
                //console.log('createComponentType', exportName);
                ifc[exportName] = fakeRun;
            }

            //console.log(JSON.stringify(args, null, 2));
            return ifc;
        };
    });
}

