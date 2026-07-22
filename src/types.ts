export type ReadingSource = 'live' | 'simulated' | 'sensor';

export interface AirReading {
  ts: number;
  pm25: number;
  usAqi: number;
  source: ReadingSource;
}

export interface StoredReading extends AirReading {
  category: string;
}

export interface AlertEntry {
  ts: number;
  usAqi: number;
  category: string;
}

export type SymptomSeverity = 'none' | 'mild' | 'moderate' | 'severe';

export interface SymptomEntry {
  ts: number;
  severity: SymptomSeverity;
  note?: string;
}

export interface WeatherReading {
  temperature: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
}

export interface AirQualitySource {
  getReading(): Promise<AirReading>;
}

export interface HistoryData {
  readings: StoredReading[];
  alerts: AlertEntry[];
  symptoms: SymptomEntry[];
}
