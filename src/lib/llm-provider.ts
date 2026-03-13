import OpenAI from "openai";

export type LlmProvider = "openai";

export const normalizeProvider = (_value: unknown): LlmProvider => "openai";

export const defaultProvider = (): LlmProvider => normalizeProvider(process.env.LLM_PROVIDER || "openai");

export const createLlmClient = (provider?: LlmProvider) => {
  const selected = provider ?? defaultProvider();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  return {
    provider: selected,
    model,
    client: new OpenAI({ apiKey })
  };
};
