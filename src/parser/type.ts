import { SyncSource } from '../utils/streaming';
import { ParserContext } from './types';
import { readU32 } from './values';
import { parseAlias } from './alias';
import { ComponentType, ComponentTypeDefinedPrimitive, PrimitiveValType, ComponentTypeInstance, InstanceTypeDeclaration, InstanceTypeDeclarationAlias, InstanceTypeDeclarationType, ComponentTypeDefined } from '../model/types';

export function parseSectionType(
    ctx: ParserContext,
    src: SyncSource,
): ComponentType[] {
    const sections: ComponentType[] = [];
    const count = readU32(src);
    for (let i = 0; i < count; i++) {
        const section = parseType(src);
        sections.push(section);
    }
    return sections;
}

function parseType(
    src: SyncSource
): ComponentType {
    const b1 = readU32(src);
    if (b1 == 0x40) {
        // functype
        throw new Error('functype not yet implemented');
    } else if (b1 == 0x41) {
        // componenttype
        throw new Error('componenttype not yet implemented');
    } else if (b1 == 0x42) {
        return parseInstanceType(src);
    } else if (0x68 <= b1 && b1 <= 0x7f) {
        // defvaltype
        if (b1 >= 0x73) {
            return {
                value: asPrimitiveType(b1)
            } as ComponentTypeDefinedPrimitive;
        }
        return parseDefNonPrimitiveType(src, b1);
    } else {
        throw new Error(`unknown type: ${b1}`);
    }
}

function parseDefNonPrimitiveType(
    src: SyncSource,
    type: number
) : ComponentTypeDefined {
    switch (type) {
        case 0x72: // lt*:vec(<labelvaltype>)            => (record (field lt)*)    (if |lt*| > 0)
            throw new Error('not yet implemented');
        case 0x71: // case*:vec(<case>)                  => (variant case*)
            throw new Error('not yet implemented');
        case 0x70: // t:<valtype>                        => (list t)
            throw new Error('not yet implemented');
        case 0x6f: // t*:vec(<valtype>)                  => (tuple t+)    (if |t*| > 0)
            throw new Error('not yet implemented');
        case 0x6e: // l*:vec(<label>)                    => (flags l+)    (if |l*| > 0)
            throw new Error('not yet implemented');
        case 0x6d: // l*:vec(<label>)                    => (enum l*)
            throw new Error('not yet implemented');
        case 0x6b: // t:<valtype>                        => (option t)
            throw new Error('not yet implemented');
        case 0x6a: // t?:<valtype>? u?:<valtype>?        => (result t? (error u)?)
            throw new Error('not yet implemented');
        case 0x69: // i:<typeidx>                        => (own i)
            throw new Error('not yet implemented');
        case 0x68: // i:<typeidx>                        => (borrow i)
            throw new Error('not yet implemented');
        default:
            throw new Error(`unknown default type: ${type}`);
    }
}

function asPrimitiveType(b1: number) : PrimitiveValType {
    switch (b1) {
        case 0x7f: return PrimitiveValType.Bool;
        case 0x7e: return PrimitiveValType.S8;
        case 0x7d: return PrimitiveValType.U8;
        case 0x7c: return PrimitiveValType.S16;
        case 0x7b: return PrimitiveValType.U16;
        case 0x7a: return PrimitiveValType.S32;
        case 0x79: return PrimitiveValType.U32;
        case 0x78: return PrimitiveValType.S64;
        case 0x77: return PrimitiveValType.U64;
        case 0x76: return PrimitiveValType.Float32;
        case 0x75: return PrimitiveValType.Float64;
        case 0x74: return PrimitiveValType.Char;
        case 0x73: return PrimitiveValType.String;
        default:
            throw new Error(`unknown primitive type: ${b1}`);
    }
}

function parseInstanceType(src: SyncSource): ComponentTypeInstance {
    const decls: InstanceTypeDeclaration[] = [];
    const count = readU32(src);
    for (let i = 0; i < count; i++) {
        const decl: InstanceTypeDeclaration = (() => {
            const instType = readU32(src);
            switch (instType) {
                case 0x00:
                    throw new Error('not yet implememented');
                case 0x01:
                    return {
                        value: parseType(src)
                    } as InstanceTypeDeclarationType;
                case 0x02:
                    return {
                        value: parseAlias(src)
                    } as InstanceTypeDeclarationAlias;
                case 0x04:
                    throw new Error('not yet implememented');
                default: throw new Error(`unknown instance type: ${instType}`);
            }
        })();
        decls.push(decl);
    }
    return {
        declarations: decls
    } as ComponentTypeInstance;
}
