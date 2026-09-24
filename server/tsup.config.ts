import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: "node22",
  clean: true,
  // The shared package ships raw TypeScript, so bundle it into the server output.
  noExternal: ["@virtual-projector/shared"],
});
