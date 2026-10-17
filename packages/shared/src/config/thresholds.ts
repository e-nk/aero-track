// All detector and poller thresholds. Starting values; tune on recorded data.
// Detectors must read numbers from here, never hard-code them.

export interface Thresholds {
  poll: { intervalMs: number; radiusNm: number; centre: { lat: number; lon: number } };
  buffer: { keepSec: number };
  hygiene: {
    maxImpliedGsKt: number;
    minPoints: number;
    minSpanSec: number;
  };
  climbDescent: {
    minNetFt: number;
    minSpanSec: number;
    minObs: number;
    monotonicShare: number;
    baroRateFpm: number;
  };
  turn: {
    windowSec: number;
    minCumulativeDeg: number;
    ignoreStepBelowDeg: number;
  };
  circling: {
    windowSec: number;
    minCumulativeDeg: number;
    sameDirectionShare: number;
  };
  rapidDescent: {
    minRateFpm: number;
    minConsecutiveObs: number;
    minSpanSec: number;
  };
  glitch: {
    spikeRateFpm: number;
    revertWithinSamples: number;
    revertToleranceFt: number;
  };
  gap: { thresholdSec: number };
  signalLost: { afterSec: number };
  lifecycle: { closeAfterSec: number; reopenCooldownSec: number };
}

export const THRESHOLDS = {
  poll: { intervalMs: 7000, radiusNm: 60, centre: { lat: -33.9, lon: 151.0 } },
  buffer: { keepSec: 900 },
  hygiene: {
    maxImpliedGsKt: 1000, // drop position jumps faster than this
    minPoints: 4,
    minSpanSec: 60,
  },
  climbDescent: {
    minNetFt: 1000,
    minSpanSec: 60,
    minObs: 4,
    monotonicShare: 0.7, // share of steps in the same direction
    baroRateFpm: 500, // alternative trigger: sustained |baro_rate|
  },
  turn: {
    windowSec: 90,
    minCumulativeDeg: 30,
    ignoreStepBelowDeg: 5,
  },
  circling: {
    windowSec: 360,
    minCumulativeDeg: 300,
    sameDirectionShare: 0.8,
  },
  rapidDescent: {
    minRateFpm: 5000,
    minConsecutiveObs: 3,
    minSpanSec: 30,
  },
  glitch: {
    spikeRateFpm: 20000,
    revertWithinSamples: 2,
    revertToleranceFt: 300,
  },
  gap: { thresholdSec: 60 },
  signalLost: { afterSec: 60 },
  lifecycle: { closeAfterSec: 60, reopenCooldownSec: 120 },
} as const satisfies Thresholds;
