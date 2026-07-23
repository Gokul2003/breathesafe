export interface RiskBand {
  category: string;
  color: string;
  risk: string;
  advice: string;
  warning: boolean;
}

export function getRiskBand(aqi: number): RiskBand {
  if (aqi <= 50) return { category: 'Good', color: '#2ecc71', risk: 'Low', advice: 'Air is clean — good to go.', warning: false };
  if (aqi <= 100) return { category: 'Moderate', color: '#f1c40f', risk: 'Low–Moderate', advice: 'Usually fine; very sensitive users, keep your inhaler handy.', warning: false };
  if (aqi <= 150) return { category: 'Unhealthy for Sensitive Groups', color: '#e67e22', risk: 'Elevated', advice: 'Limit prolonged outdoor exertion. Watch for symptoms.', warning: true };
  if (aqi <= 200) return { category: 'Unhealthy', color: '#e74c3c', risk: 'High', advice: 'Avoid outdoor activity. Keep rescue meds nearby.', warning: true };
  if (aqi <= 300) return { category: 'Very Unhealthy', color: '#8e44ad', risk: 'Very High', advice: 'Stay indoors, windows closed, air purifier if available.', warning: true };
  return { category: 'Hazardous', color: '#7e0023', risk: 'Severe', advice: 'Stay indoors. Seek help if breathing worsens.', warning: true };
}

// EPA PM2.5 AQI breakpoints. Concentrations are truncated to one decimal place.
export function pm25ToAqi(value: number): number {
  const concentration = Math.floor(Math.max(0, value) * 10) / 10;
  const bands = [
    [0, 9, 0, 50], [9.1, 35.4, 51, 100], [35.5, 55.4, 101, 150],
    [55.5, 125.4, 151, 200], [125.5, 225.4, 201, 300],
    [225.5, 325.4, 301, 500], [325.5, 500.4, 501, 999],
  ];
  const band = bands.find(([low, high]) => concentration >= low && concentration <= high) ?? bands[bands.length - 1];
  const [cLow, cHigh, iLow, iHigh] = band;
  return Math.round(((iHigh - iLow) / (cHigh - cLow)) * (Math.min(concentration, cHigh) - cLow) + iLow);
}
