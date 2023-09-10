export default {
    "roots": [
        "<rootDir>/src"
    ],
    "testMatch": [
        "**/?(*.)+(spec|test).+(ts|js)"
    ],
    "transform": {
    //"^.+\\.(ts|tsx)$": "esbuild-jest"
        "^.+\\.(ts|tsx)$": ["@swc/jest"],
    //"^.+\\.(ts|tsx)$": "ts-jest"
    },
    extensionsToTreatAsEsm: [".ts"],
};
