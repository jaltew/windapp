import type { AnalysisCompletionPayload } from "../pages/AnalysisLoadingPage";

export const DEFAULT_DEV_STEP3_PAYLOAD: AnalysisCompletionPayload = {
  location: {
    id: "dev-step3-skane",
    name: "Skane test site",
    region: "Skane County",
    country: "Sweden",
    latitude: 55.84718859617866,
    longitude: 13.090667667904688,
    source: "search"
  },
  mapView: {
    latitude: 55.84718859617866,
    longitude: 13.090667667904688,
    zoom: 16,
    bearing: 0,
    pitch: 0
  },
  buildingsGeoJson: null,
  treesGeoJson: null,
  landcoverPreview: null,
  result: {
    shareToken: "dev-step3-token",
    meanWindSpeed: 6.8,
    aepKwh: 43501,
    monthlyProductionKwh: [4180, 4020, 3810, 3450, 3180, 2850, 2640, 2720, 3310, 3920, 4310, 4110],
    directionalProductionKwh: [3750, 4520, 5100, 4620, 3900, 3410, 2980, 2760, 3050, 3370, 3540, 3501],
    potentialAepKwh: 55800,
    potentialMonthlyProductionKwh: [5310, 5160, 4870, 4410, 4020, 3560, 3270, 3340, 4170, 5010, 5570, 5110],
    potentialDirectionalProductionKwh: [4800, 5780, 6490, 5920, 4990, 4360, 3820, 3540, 3890, 4300, 4500, 3410],
    windRosePercentages: [8, 10, 11, 10, 8, 7, 6, 6, 7, 8, 9, 10],
    potentialWindRosePercentages: [9, 11, 12, 11, 9, 8, 7, 6, 7, 8, 9, 10],
    windResourceScore: 74,
    siteUtilizationScore: 68
  }
};
