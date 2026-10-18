// All detector and poller thresholds. Starting values; tune on recorded data.
// Detectors must read numbers from here, never hard-code them.

export interface Thresholds {
  poll: {
    intervalMs: number;
    timeoutMs: number;
    maxBackoffMs: number;
    downAfterFailures: number;
    radiusNm: number;
    centre: { lat: number; lon: number };
  };
  buffer: { keepSec: number };
  writer: { flushMs: number; maxRows: number };
  sse: { heartbeatMs: number; maxBufferedBytes: number };
  overview: {
    intervalMs: number;
    timeoutMs: number;
    maxBackoffMs: number;
    bbox: { lamin: number; lomin: number; lamax: number; lomax: number };
  };
  follow: { maxFollowed: number; intervalMs: number; afterLandingSec: number; maxAgeSec: number };
  display: {
    interpolateMaxSec: number;
    sourceUpdateMs: number;
    staleAfterSec: number;
    altitudeBandsFt: readonly [number, number];
    levelRateFpm: number;
  };
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
  takeoffLanding: {
    confirmObs: number;
    minClimbFt: number;
    maxTouchdownAltFt: number;
    airportRadiusKm: number;
    nearAirportKm: number;
  };
  gap: { thresholdSec: number };
  signalLost: { afterSec: number };
  lifecycle: { closeAfterSec: number; reopenCooldownSec: number };
  retention: { intervalMs: number; keepPositionsSec: number };
  alerts: { backfillSec: number; placeWithinKm: number; toastMs: number; maxToasts: number };
}

export const THRESHOLDS = {
  poll: {
    intervalMs: 10000, // 10 s: adsb.lol rate-limits faster polling (see SPEC 5.1)
    // 8 s, not 5: from Railway (US West) adsb.lol took 5.6 s on 2026-10-18. Still well inside the 10 s poll.
    timeoutMs: 8000,
    maxBackoffMs: 60000, // exponential backoff cap after failures
    downAfterFailures: 3, // one missed poll is "degraded"; three in a row (~1 min) is "down"
    radiusNm: 60,
    centre: { lat: -33.9, lon: 151.0 },
  },
  buffer: { keepSec: 900 }, // also: drop an aircraft this long after its last position
  writer: { flushMs: 5000, maxRows: 500 }, // batch positions, whichever comes first
  sse: { heartbeatMs: 15000, maxBufferedBytes: 1_000_000 }, // drop clients that fall this far behind
  overview: {
    intervalMs: 90_000, // OpenSky: Australia bbox costs 4 credits; 4,000 a day allows one poll per ~86 s
    timeoutMs: 15_000,
    maxBackoffMs: 900_000, // after failures, wait up to 15 min rather than burn credits
    bbox: { lamin: -44, lomin: 112, lamax: -10, lomax: 154 }, // mainland Australia and Tasmania
  },
  follow: {
    maxFollowed: 10, // shared by all viewers
    intervalMs: 30_000, // one adsb.lol request for every followed aircraft
    afterLandingSec: 900, // stop following 15 min after an observed landing
    maxAgeSec: 86_400, // and never longer than 24 h
  },
  display: {
    interpolateMaxSec: 15, // dead-reckon at most this far past the last fix
    sourceUpdateMs: 100, // map source updates at most 10 times per second
    staleAfterSec: 30, // badge turns amber / aircraft dims after this long without news
    altitudeBandsFt: [10000, 25000], // colour bands: low < 10,000 ≤ mid < 25,000 ≤ high
    levelRateFpm: 100, // vertical rates this small read as "Level" in the details panel
  },
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
  takeoffLanding: {
    confirmObs: 3, // reports needed after a ground/airborne change before we believe it
    minClimbFt: 200, // altitude gained after take-off, to ignore flickering ground flags
    maxTouchdownAltFt: 2000, // a "ground" report from higher than this is not a landing
    airportRadiusKm: 5, // "near {airport}" for take-off and landing
    nearAirportKm: 20, // "last seen about N km from {airport}" for lost signals
  },
  gap: { thresholdSec: 60 },
  signalLost: { afterSec: 60 },
  lifecycle: { closeAfterSec: 60, reopenCooldownSec: 120 },
  // SPEC 11.5: live positions are kept for a day. Recordings are copied into their own rows, and sightings are kept separately.
  retention: { intervalMs: 30 * 60 * 1000, keepPositionsSec: 24 * 60 * 60 },
  // Flight alerts (alerts design spec): ignore events older than 2 min when watching starts or the page loads.
  alerts: { backfillSec: 120, placeWithinKm: 60, toastMs: 8000, maxToasts: 3 },
} as const satisfies Thresholds;
