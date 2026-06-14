import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/integration/**/*.test.ts", "**/__tests__/worker/load.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  globalSetup: "<rootDir>/__tests__/integration/setup.ts",
  globalTeardown: "<rootDir>/__tests__/integration/teardown.ts",
  testTimeout: 30_000,
  forceExit: true,
};

export default createJestConfig(config);
