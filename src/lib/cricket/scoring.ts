export type ExtraType = "" | "wide" | "no_ball" | "bye" | "leg_bye";
export type NoBallRunsSource = "bat" | "bye" | "leg_bye";

export type NormalizedDeliveryRuns = {
  batterRuns: number;
  wideRuns: number;
  noBallRuns: number;
  byeRuns: number;
  legByeRuns: number;
};

type DeliveryRunInput = {
  batterRuns?: number;
  extraType?: ExtraType | null;
  extraRuns?: number;
  noBallRunsSource?: NoBallRunsSource | null;
};

export function normalizeDeliveryRuns(input: DeliveryRunInput): NormalizedDeliveryRuns {
  const extraType = input.extraType ?? "";
  const batterRunsInput = clampRun(input.batterRuns ?? 0, 6);
  const extraRunsInput = clampRun(input.extraRuns ?? 0, 10);

  if (extraType === "wide") {
    return {
      batterRuns: 0,
      wideRuns: Math.max(1, extraRunsInput || 1),
      noBallRuns: 0,
      byeRuns: 0,
      legByeRuns: 0,
    };
  }

  if (extraType === "no_ball") {
    const source = isNoBallRunsSource(input.noBallRunsSource) ? input.noBallRunsSource : "bat";
    return {
      batterRuns: source === "bat" ? batterRunsInput : 0,
      wideRuns: 0,
      noBallRuns: 1,
      byeRuns: source === "bye" ? batterRunsInput : 0,
      legByeRuns: source === "leg_bye" ? batterRunsInput : 0,
    };
  }

  if (extraType === "bye") {
    return {
      batterRuns: 0,
      wideRuns: 0,
      noBallRuns: 0,
      byeRuns: extraRunsInput,
      legByeRuns: 0,
    };
  }

  if (extraType === "leg_bye") {
    return {
      batterRuns: 0,
      wideRuns: 0,
      noBallRuns: 0,
      byeRuns: 0,
      legByeRuns: extraRunsInput,
    };
  }

  return {
    batterRuns: batterRunsInput,
    wideRuns: 0,
    noBallRuns: 0,
    byeRuns: 0,
    legByeRuns: 0,
  };
}

function clampRun(value: number, max: number) {
  return Math.max(0, Math.min(Number(value) || 0, max));
}

function isNoBallRunsSource(value: unknown): value is NoBallRunsSource {
  return value === "bat" || value === "bye" || value === "leg_bye";
}
