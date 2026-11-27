import { getSupabaseServiceClient } from "@/lib/supabase/server";

export function monthlyBudgetMicros() {
  const configured = Number(process.env.AI_MONTHLY_BUDGET_USD ?? "10");
  const dollars = Number.isFinite(configured) && configured > 0 ? configured : 10;
  return Math.round(dollars * 1_000_000);
}

export async function getCurrentMonthUsageMicros() {
  const supabase = getSupabaseServiceClient();
  const monthStart = new Date().toISOString().slice(0, 7) + "-01";
  const { data, error } = await supabase.from("ai_usage_monthly").select("estimated_cost_micros").eq("month_start", monthStart).maybeSingle();
  if (error) throw error;
  return data?.estimated_cost_micros ?? 0;
}

export async function recordAiUsage(input: {
  status: "success" | "error";
  errorCategory: string | null;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostMicros?: number;
}) {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.rpc("record_ai_usage", {
    p_status: input.status,
    p_error_category: input.errorCategory,
    p_duration_ms: Math.max(0, Math.round(input.durationMs)),
    p_input_tokens: Math.max(0, input.inputTokens ?? 0),
    p_output_tokens: Math.max(0, input.outputTokens ?? 0),
    p_estimated_cost_micros: Math.max(0, input.estimatedCostMicros ?? 0),
  });
  if (error) throw error;
}
