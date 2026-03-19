import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Stubs for optional LLM deps that aren't installed — vi.mock() overrides in tests
      "@langchain/openai": path.resolve(__dirname, "__tests__/stubs/langchain-openai.ts"),
      "@langchain/core/prompts": path.resolve(__dirname, "__tests__/stubs/langchain-core-prompts.ts"),
    },
  },
});
