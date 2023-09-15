import { ComponentExternalKind } from '../model/exports';
import { ModelTag } from '../model/tags';
import { jsco_assert } from '../utils/assert';
import { prepareComponentFunction } from './component-functions';
import { prepareComponentImport } from './component-imports';
import { memoizePrepare } from './context';
import { ResolverContext, ImplComponentTypeComponent as ImplComponentSection, JsInterface } from './types';

export function prepareComponentSection(rctx: ResolverContext, componentIndex: number): Promise<ImplComponentSection> {
    const section = rctx.indexes.componentTypes[componentIndex];
    return memoizePrepare<ImplComponentSection>(rctx, section, async () => {
        //console.log('TODO prepareComponentType', section);
        jsco_assert(section.tag === ModelTag.ComponentSection, () => `expected ComponentTypeComponent, got ${section.tag}`);
        const exports: string[] = [];
        const imports: string[] = [];
        const other: any[] = [];
        for (const declaration of section.sections) {
            switch (declaration.tag) {
                case ModelTag.ComponentImport: {
                    const importName = declaration.name.name;//TODO name type
                    imports.push(importName);
                    break;
                }
                //case ModelTag.ComponentTypeFunc:
                case ModelTag.ComponentExport: {
                    switch (declaration.kind) {
                        case ComponentExternalKind.Func: {
                            //const type = declaration.ty?.value;
                            const fnFactory = prepareComponentFunction(rctx, declaration.index);
                            /*const functionSection = rctx.indexes.componentFunctions[declaration.index];
                            console.log(declaration.kind, functionSection);
                            const instanceSection = rctx.indexes.componentInstances[functionSection.];
                            */

                            exports.push(declaration.name.name);
                            break;
                        }
                        case ComponentExternalKind.Type:
                            exports.push(declaration.name.name);
                            break;
                        default:
                            throw new Error(`${declaration.kind} not implemented`);
                    }
                    break;
                }
                case ModelTag.ComponentTypeFunc: {
                    //console.log('TODO ' + declaration.tag, declaration.params);
                    break;
                }
                case ModelTag.ComponentTypeDefinedRecord: {
                    //console.log('TODO ' + declaration.tag, declaration);
                    break;
                } default:
                    throw new Error(`${declaration.tag} not implemented`);
            }
        }

        return async (ctx, args) => {
            //console.log('createComponentType', ctx.debugStack?.join(' > '));
            const component: any = {
                imports,
                exports,
                args,
            };


            // TODO: this is very fake!
            /*
            const fakeRun = args[0];
            console.log('createComponentType ', exports, imports, args);

            for (const exportName of exports) {
                //console.log('createComponentType', exportName);
                component[exportName] = fakeRun;
            }
*/
            console.log(section.tag, component);
            return component;
        };
    });
}
