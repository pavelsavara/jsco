export default {
    'roots': [
        '<rootDir>/src'
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
    extensionsToTreatAsEsm: ['.ts'],
    testTimeout: 30_000,
    setupFiles: ['<rootDir>/jest.setup.ts'],
};
