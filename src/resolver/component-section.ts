import { ModelTag } from '../model/tags';
import { jsco_assert } from '../utils/assert';
import { prepareComponentExport } from './component-exports';
import { memoizePrepare } from './context';
import { ImplFactory, NamedImplFactory, ResolverContext, } from './types';

export function prepareComponentSection(rctx: ResolverContext, componentIndex: number): Promise<ImplFactory> {
    const section = rctx.indexes.componentTypes[componentIndex];
    return memoizePrepare<ImplFactory>(rctx, section, async () => {
        //console.log('TODO prepareComponentType', section);
        jsco_assert(section.tag === ModelTag.ComponentSection, () => `expected ComponentTypeComponent, got ${section.tag}`);
        const exportFactories: NamedImplFactory[] = [];
        const importNames: string[] = [];
        const other: string[] = [];
        for (const declaration of section.sections) {
            switch (declaration.tag) {
                case ModelTag.ComponentImport: {
                    const importName = declaration.name.name;//TODO name type
                    importNames.push(importName);
                    break;
                }
                case ModelTag.ComponentExport: {
                    const factory = await prepareComponentExport(rctx, declaration);
                    exportFactories.push(factory);
                    break;
                }
                case ModelTag.ComponentTypeDefinedRecord:
                case ModelTag.ComponentTypeFunc: {
                    other.push('TODO ' + declaration.tag);
                    break;
                }
                default:
                    throw new Error(`${declaration.tag} not implemented`);
            }
        }

        return async (ctx, imports) => {
            const exports = {} as any;
            for (const { name, factory } of exportFactories) {
                const ifc = await factory(ctx, imports ?? {});
                exports[name] = ifc as any;
            }

            const component: any = {
                importNames,
                imports,
                exports,
            };

            return component;
        };
    });
}
