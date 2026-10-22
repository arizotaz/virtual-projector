import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: "node22",
  clean: true,
  // The shared package ships raw TypeScript, so bundle it into the server output.
  noExternal: ["@virtual-projector/shared"],
  // Bundled CommonJS deps (cookie-parser -> cookie-signature) call require("crypto"),
  // which doesn't exist in ESM. Provide a real require().
  banner: {
    js: `import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);`,
  },
});