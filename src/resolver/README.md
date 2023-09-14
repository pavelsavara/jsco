https://github.com/bytecodealliance/wasm-tools/blob/main/crates/wit-component/src/decoding.rs
https://github.com/bytecodealliance/wasm-tools/blob/main/crates/wit-component/src/linking.rs


## Index spaces
From https://github.com/bytecodealliance/wasm-interface-types/blob/main/BINARY.md

Like WebAssembly the wasm interface types section has its own sets of index
spaces. The two currently are:

* Types - indexed in order of their appearance in the type subsection
* Functions - indexed with imports first and then function definitions next

Note that these index spaces are intended to be separate from the core wasm
index spaces.

# Semantics of WebAssembly Interface Types
From https://github.com/bytecodealliance/wasm-interface-types/blob/main/SEMANTICS.md

This is intended largely to be a document of notes for the implemented and/or
envisioned semantics of the wasm interface types section.

This is pretty unstructured, so beware.

* There's a wasm interface types type index space. It's separate from the core
  wasm index space.

* There's a wasm interface types function index space. It's separate from the
  core wasm function space.

* The presence of the wasm interface types section means that the core module's
  `export` section is basically ignored for semantic reasons. The exports of the
  module are exclusively looked up through the wasm interface types section.

* The imports of a module with wasm interface types is the set of imports from
  the wasm interface types section, plus the set of imports from the core wasm
  module, minus the set of `implements` items in the wasm interface types
  section.

* References to the core module are done through indices which are resolved
  relative the to the core module's index spaces.

* Can't implement the same function twice in the `implement` subsection

* Currently the `s32` type matches the `i32` type in wasm, same for `s64` and
  `i64`. This is used during validation when adapters hook up to core functions.
