import { defineConfig } from "tsup";
import babel from "esbuild-plugin-babel";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  minify: false,
  target: "node18",
  outDir: "dist",
  banner: {
    js: "#!/usr/bin/env node",
  },
  esbuildPlugins: [
    babel({
      filter: /\.tsx$/,
      config: {
        presets: [
          ["@babel/preset-typescript", { isTSX: true, allExtensions: true }],
          "babel-preset-solid",
        ],
      },
    }),
  ],
});
