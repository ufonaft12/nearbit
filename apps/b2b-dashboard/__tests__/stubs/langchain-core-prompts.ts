// Stub for @langchain/core/prompts — used only in tests via vitest.config.ts alias.
// vi.mock("@langchain/core/prompts") overrides this in tests that exercise the LLM path.
export const PromptTemplate = { fromTemplate: () => ({ pipe: () => ({}) }) };
