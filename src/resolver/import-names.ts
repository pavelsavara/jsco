// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

// wit-component (wasm-tools crate) generates synthetic prefixed names for
// component instantiation arguments and imports to disambiguate kinds in the
// flat namespace. The prefixes are defined in:
// https://github.com/bytecodealliance/wasm-tools/blob/main/crates/wit-component/src/encoding.rs
//
// import_func_name() produces:
//   'import-func-{name}'         — freestanding functions
//   'import-method-{obj}-{name}' — [method]obj.name
//   'import-constructor-{name}'  — [constructor]name
//   'import-static-{obj}-{name}' — [static]obj.name
//
// unique_import_name() produces:
//   'import-type-{name}'         — type imports into nested shim components

const importPrefixes = [
    'import-func-',
    'import-method-',
    'import-constructor-',
    'import-static-',
    'import-type-',
] as const;

export function stripImportPrefix(name: string): string {
    for (const prefix of importPrefixes) {
        if (name.startsWith(prefix)) {
            return name.substring(prefix.length);
        }
    }
    return name;
}
