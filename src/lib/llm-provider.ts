import OpenAI from "openai";

export type LlmProvider = "openai" | "deepseek";

export const normalizeProvider = (value: unknown): LlmProvider => {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "deepseek" ? "deepseek" : "openai";
};

export const defaultProvider = (): LlmProvider => normalizeProvider(process.env.LLM_PROVIDER || "openai");

export const createLlmClient = (provider?: LlmProvider) => {
  const selected = provider ?? defaultProvider();
  if (selected === "deepseek") {
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) return null;
    const model = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat";
    return {
      provider: "deepseek" as const,
      model,
      client: new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" })
    };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  return {
    provider: "openai" as const,
    model,
    client: new OpenAI({ apiKey })
  };
};

