import { ComponentExternalKind } from '../model/exports';
import { ModelTag } from '../model/tags';
import { jsco_assert } from '../utils/assert';
import { memoizePrepare } from './context';
import { ResolverContext, ImplComponentTypeComponent as ImplComponentSection, JsInterface } from './types';

export function prepareComponentSection(rctx: ResolverContext, componentIndex: number): Promise<ImplComponentSection> {
    const section = rctx.indexes.componentTypes[componentIndex];
    return memoizePrepare<ImplComponentSection>(rctx, section, async () => {
        //console.log('TODO prepareComponentType', section);
        jsco_assert(section.tag === ModelTag.ComponentSection, () => `expected ComponentTypeComponent, got ${section.tag}`);
        const exports: string[] = [];
        const other: any[] = [];
        for (const declaration of section.sections) {
            switch (declaration.tag) {
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
                //case ModelTag.ComponentTypeFunc:
                case ModelTag.ComponentExport: {
                    switch (declaration.kind) {
                        case ComponentExternalKind.Func: {
                            exports.push(declaration.name.name);
                            break;
                        }
                        case ComponentExternalKind.Type:
                            //console.log('TODO ComponentTypeRefType declaration', declaration);
                            break;
                        default:
                            throw new Error(`${declaration.kind} not implemented`);
                    }
                    break;
                }
                case ModelTag.ComponentTypeDefinedRecord:
                case ModelTag.ComponentTypeFunc: {
                    //console.log('TODO ' + declaration.tag, declaration);
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
