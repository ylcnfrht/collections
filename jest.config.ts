import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': 'ts-jest', // TypeScript dosyalarını ts-jest ile işleyin
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  testMatch: [
    '**/tests/**/*.test.ts', // `tests` klasöründeki `.test.ts` dosyalarını bulur
    '**/tests/**/*.test.js', // `tests` klasöründeki `.test.js` dosyalarını bulur
  ],
  transformIgnorePatterns: [
    '/node_modules/', // `node_modules` klasörünü göz ardı eder
  ],
};

export default config;
