// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

export default {
    'roots': [
        '<rootDir>/src',
    ],
    'testMatch': [
        '**/?(*.)+(spec|test).+(ts|js)'
    ],
    'transform': {
        //"^.+\\.(ts|tsx)$": "esbuild-jest"
        '^.+\\.(ts|tsx|js|jsx)$': ['@swc/jest'],
        //"^.+\\.(ts|tsx)$": "ts-jest"
    },
    moduleNameMapper: {
        '^env:isDebug$': '<rootDir>/src/__mocks__/env-isDebug.ts',
        '^env:configuration$': '<rootDir>/src/__mocks__/env-configuration.ts',
        '^env:gitHash$': '<rootDir>/src/__mocks__/env-gitHash.ts',
    },
    transformIgnorePatterns: [
        '/node_modules/@bytecodealliance/'
    ],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.test.ts',
        '!src/**/*.spec.ts',
        '!src/__mocks__/**',
        '!src/test-utils/**',
        '!src/**/*.d.ts',
        // Integration-only: resolver orchestration (needs real WASM components)
        '!src/resolver/index.ts',
        '!src/resolver/binding-plan.ts',
        '!src/resolver/component-exports.ts',
        '!src/resolver/component-functions.ts',
        '!src/resolver/component-instances.ts',
        '!src/resolver/component-types.ts',
        '!src/resolver/core-exports.ts',
        '!src/resolver/core-functions.ts',
        '!src/resolver/core-instance.ts',
        '!src/resolver/core-module.ts',
        '!src/resolver/context.ts',
        '!src/resolver/indices.ts',
        // Integration-only: runtime marshalling (needs WASM linear memory / real components)
        '!src/marshal/memory-store.ts',
        '!src/marshal/memory-load.ts',
        '!src/marshal/trampoline-lift.ts',
        '!src/marshal/trampoline-lower.ts',
        '!src/marshal/lift.ts',
        '!src/marshal/lower.ts',
        // Integration-only: WASI host (tested by excluded integration tests)
        '!src/host/**',
        // Integration-only: core module parsing, custom sections, WAT printing
        '!src/parser/module.ts',
        '!src/parser/otherSection.ts',
        '!src/utils/wat-printer.ts',
        // Debug-only: name tables populated only in debug builds
        '!src/utils/debug-names.ts',
        // Test utilities
        '!src/parser/jest-utils.ts',
        '!src/binder/test-helpers.ts',
        // Thin wrappers over platform APIs (node fs, fetch, component import resolution)
        '!src/utils/fetch-like.ts',
        '!src/resolver/component-imports.ts',
        // CLI / dynamic-import entry points (untestable in Jest)
        '!src/index.ts',
        '!src/main.ts',
        '!src/dynamic.ts',
    ],
    coverageReporters: ['text', 'lcov', 'json-summary', 'json'],
    coverageThreshold: {
        global: {
            statements: 92,
            branches: 84,
            functions: 90,
            lines: 93,
        },
    },
    extensionsToTreatAsEsm: ['.ts'],
    testTimeout: 30_000,
    setupFiles: ['<rootDir>/jest.setup.ts'],
};
