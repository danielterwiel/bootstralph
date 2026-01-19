import { rm, cp } from "node:fs/promises";

// Clean dist directory
await rm("./dist", { recursive: true, force: true });

// Build ESM
await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  format: "esm",
  target: "node",
  sourcemap: "external",
  minify: false,
  splitting: false,
  naming: "[dir]/[name].js",
});

// Build CJS
await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  format: "cjs",
  target: "node",
  sourcemap: "external",
  minify: false,
  splitting: false,
  naming: "[dir]/[name].cjs",
});

// Add shebang to the ESM output (CLI entry point)
const esmFile = Bun.file("./dist/index.js");
const esmContent = await esmFile.text();
if (!esmContent.startsWith("#!/usr/bin/env")) {
  await Bun.write("./dist/index.js", `#!/usr/bin/env node\n${esmContent}`);
}

// Copy templates and data to dist
await cp("./templates", "./dist/templates", { recursive: true });
await cp("./data", "./dist/data", { recursive: true });

console.log("Build complete!");
