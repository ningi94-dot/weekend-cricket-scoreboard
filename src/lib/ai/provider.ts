import { GeminiProvider } from "@/lib/ai/gemini-provider";
import { OpenAiProvider } from "@/lib/ai/openai-provider";
import type { AiProvider } from "@/lib/ai/types";

export function getAiProvider(): AiProvider {
  const provider = (process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY ? "gemini" : "openai")).toLowerCase();
  if (provider === "gemini") return new GeminiProvider();
  if (provider === "openai") return new OpenAiProvider();
  throw new Error(`AI provider '${provider}' is not supported by this deployment.`);
}
