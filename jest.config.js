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
    transformIgnorePatterns: [
        '/node_modules/@bytecodealliance/'
    ],
    extensionsToTreatAsEsm: ['.ts'],
    testTimeout: 30_000,
    setupFiles: ['<rootDir>/jest.setup.ts'],
};
