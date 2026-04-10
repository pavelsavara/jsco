# jsco Copilot Instructions

## Coding Conventions

- **Always use numeric `const enum`** — never string-valued enum members. Numeric enums inline to integer literals in the bundle, saving significant minified code size. String enums emit string comparisons and string literals that cannot be minified.
