import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import { load } from "js-yaml";

/** Lets the app import the YAML files in /data as plain JavaScript values. */
function yamlPlugin(): Plugin {
  return {
    name: "yaml",
    transform(code, id) {
      if (!id.endsWith(".yaml")) return null;
      return { code: `export default ${JSON.stringify(load(code) ?? null)};`, map: null };
    },
  };
}

export default defineConfig({
  // Relative base so the build works both on GitHub Pages (/resource_visualizer/) and locally.
  base: "./",
  plugins: [yamlPlugin()],
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});
