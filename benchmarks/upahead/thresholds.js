export const UPAHEAD_BENCHMARK_THRESHOLDS = {
  offline: {
    plannerPrecision: 0.0,
    plannerRecall: 0.0,
    plannerF1: 0.0,
    upAheadPrecision: 0.80,
    upAheadRecall: 0.75,
    duplicateLeakRate: 0.03,
    falseLocationAcceptance: 0.05,
    maxExecutionMs: 1500
  },
  online: {
    upAheadPrecision: 0.82,
    upAheadRecall: 0.72,
    airlinePrecision: 0.88,
    shoppingPrecision: 0.82,
    maxExecutionMs: 1500
  }
};
