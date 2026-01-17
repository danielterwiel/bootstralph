import * as p from "@clack/prompts";

async function main(): Promise<void> {
  p.intro("bootstralph - Ralph-powered project scaffolding");

  p.outro("Setup complete!");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
