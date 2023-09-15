import { ModelTag } from '../model/tags';
import { jsco_assert } from '../utils/assert';
import { prepareComponentExport } from './component-exports';
import { prepareComponentTypeRef } from './component-type-ref';
import { memoizePrepare } from './context';
import { ImplFactory, NamedImplFactory, ResolverContext, } from './types';

export function prepareComponentSection(rctx: ResolverContext, componentIndex: number): Promise<ImplFactory> {
    const section = rctx.indexes.componentTypes[componentIndex];
    return memoizePrepare<ImplFactory>(rctx, section, async () => {
        //console.log('TODO prepareComponentType', section);
        jsco_assert(section.tag === ModelTag.ComponentSection, () => `expected ComponentTypeComponent, got ${section.tag}`);
        const exportFactories: NamedImplFactory[] = [];
        const importFactories: NamedImplFactory[] = [];
        const __other: string[] = [];
        for (const declaration of section.sections) {
            switch (declaration.tag) {
                case ModelTag.ComponentImport: {
                    const importFactory = await prepareComponentTypeRef(rctx, declaration.ty);
                    importFactories.push({ name: declaration.name.name, factory: importFactory });//TODO name type
                    break;
                }
                case ModelTag.ComponentExport: {
                    const factory = await prepareComponentExport(rctx, declaration);
                    exportFactories.push(factory);
                    break;
                }
                case ModelTag.ComponentTypeDefinedRecord:
                case ModelTag.ComponentTypeFunc: {
                    __other.push('TODO ' + declaration.tag);
                    break;
                }
                default:
                    throw new Error(`${declaration.tag} not implemented`);
            }
        }

        return async (ctx, args) => {
            const componentArgs = {} as any;
            for (const { name, factory } of importFactories) {
                const ifc = await factory(ctx, args);
                componentArgs[name] = ifc as any;
            }
            const exports = {} as any;
            for (const { name, factory } of exportFactories) {
                const ifc = await factory(ctx, args);
                exports[name] = ifc as any;
            }

            const component: any = {
                imports: args,
                args: componentArgs,
                exports,
                __other,
            };

            return component;
        };
    });
}
