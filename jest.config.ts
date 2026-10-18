import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  // tests import modules directly; the package entry point would load the stream engine for them
  setupFiles: ['<rootDir>/src/stream/StreamSupport.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/interfaces/**'],
  coverageThreshold: {
    global: { statements: 95, lines: 95, functions: 95, branches: 90 },
  },
};

export default config;
