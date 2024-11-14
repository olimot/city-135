import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  base: `/${pkg.name}`,
  root: "src",
  build: {
    target: "esnext",
    outDir: "../dist",
    emptyOutDir: true,
  },
});
