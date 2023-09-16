import { ComponentExport } from '../model/exports';
import { ModelTag, WITSection } from '../model/tags';
import { ComponentType } from '../model/types';
import { ComponentSection } from '../parser/types';
import { debugStack, isDebug, jsco_assert } from '../utils/assert';
import { resolveComponentExport } from './component-exports';
import { resolveComponentAliasInstanceExport } from './component-functions';
import { BinderRes, Resolver, ResolverRes } from './types';

export const resolveComponentType: Resolver<ComponentType, any, any> = (rctx, rargs) => {
    const coreInstance = rargs.element;
    switch (coreInstance.tag) {
        case ModelTag.ComponentSection: return resolveComponentSection(rctx, rargs as any);
        case ModelTag.ComponentAliasInstanceExport: return resolveComponentAliasInstanceExport(rctx, rargs as any);
        default: throw new Error(`"${(coreInstance as any).tag}" not implemented`);
    }
};

export const resolveComponentSection: Resolver<ComponentSection, any, any> = (rctx, rargs) => {
    const componentSection = rargs.element;
    jsco_assert(componentSection && componentSection.tag == ModelTag.ComponentSection, () => `Wrong element type '${componentSection?.tag}'`);

    const exportResolutions: ResolverRes<WITSection, any, any>[] = [];
    // const importResolutions: ResolverRes<WITSection, any, any>[] = [];
    for (const declaration of componentSection.sections) {
        switch (declaration.tag) {
            case ModelTag.ComponentExport: {
                const exportResolution = resolveComponentExport(rctx, { element: declaration, callerElement: declaration });
                exportResolutions.push(exportResolution);
                break;
            }
            case ModelTag.ComponentImport: {
                /* TODO types ?
                const importResolution = resolveComponentImport(rctx, { element: declaration, callerElement: declaration });
                importResolutions.push(importResolution);
                */
                break;
            }
            case ModelTag.ComponentTypeFunc:
            case ModelTag.ComponentTypeDefinedRecord:
                // TODO types
                break;
            default:
                throw new Error(`${declaration.tag} not implemented`);
        }
    }

    return {
        callerElement: rargs.callerElement,
        element: componentSection,
        binder: async (bctx, bargs) => {
            const exports = {} as any;
            for (const exportResolution of exportResolutions) {
                const callerElement = exportResolution.callerElement as ComponentExport;
                const args = {
                    arguments: bargs.arguments,
                    callerArgs: bargs,
                    debugSource: callerElement.tag + ':' + callerElement.name.name
                };
                debugStack(bargs, args, rargs.element.tag + ':' + rargs.element.selfSortIndex);
                debugStack(args, args, callerElement.tag + ':' + callerElement.name.name);

                const argResult = await exportResolution.binder(bctx, args);
                exports[callerElement.name.name] = argResult.result as any;
            }
            /* TODO types ?
            const imports = {} as any;
            for (const importResolution of importResolutions) {
                const callerElement = importResolution.callerElement as ComponentImport;
                const args = {
                    arguments: bargs.arguments,
                    callerArgs: bargs,
                };
                debugStack(bargs, args, rargs.element.tag + ':' + rargs.element.selfSortIndex);
                debugStack(args, args, callerElement.tag + ':' + callerElement.name.name);

                const argResult = await importResolution.binder(bctx, args);
                imports[callerElement.name.name] = argResult.result as any;
            }
            */
            const binderResult: BinderRes<any> = {
                result: {
                    ...exports
                } as any
            };
            if (isDebug) (binderResult as any)['arguments'] = bargs;
            return binderResult;
        }
    };
};


