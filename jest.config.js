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
    ],
    coverageReporters: ['text', 'lcov', 'json-summary', 'json'],
    coverageThreshold: {
        global: {
            statements: 81,
            branches: 71,
            functions: 77,
            lines: 83,
        },
    },
    extensionsToTreatAsEsm: ['.ts'],
    testTimeout: 30_000,
    setupFiles: ['<rootDir>/jest.setup.ts'],
};
