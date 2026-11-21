import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored nsdeploy browser runtime (Apache 2.0), copied unchanged from the
    // agentic-web agentify-website skill, plus the files its build generates.
    "public/agent/runtime/**",
    "public/agent/bridge/action-bridge.html",
  ]),
]);

export default eslintConfig;
