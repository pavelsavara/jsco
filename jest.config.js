// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

export default {
    'roots': [
        '<rootDir>/src',
        '<rootDir>/tests',
    ],
    'testMatch': [
        '**/?(*.)+(test).+(ts|js)'
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
        '!src/**/*.d.ts',
    ],
    coverageReporters: ['text', 'lcov', 'json-summary', 'json'],
    coverageThreshold: {
        global: {
            statements: 74,
            branches: 63,
            functions: 71,
            lines: 76,
        },
    },
    extensionsToTreatAsEsm: ['.ts'],
    testPathIgnorePatterns: [
        'tests/browser/',
    ],
    testTimeout: 30_000,
    setupFiles: ['<rootDir>/jest.setup.ts'],
};
