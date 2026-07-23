import * as Location from 'expo-location';
import { AirQualitySource, AirReading, WeatherReading } from './types';
import { pm25ToAqi } from './risk';

const ATLANTA = { latitude: 33.75, longitude: -84.39 };
const REQUEST_TIMEOUT_MS = 12_000;

async function coordinates() {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return ATLANTA;
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return position.coords;
  } catch { return ATLANTA; }
}

async function fetchJson(url: string, unavailableMessage: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(unavailableMessage);
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The data service timed out. Pull down to retry.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export class LiveApiSource implements AirQualitySource {
  async getReading(): Promise<AirReading> {
    const { latitude, longitude } = await coordinates();
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=pm2_5,pm10,us_aqi,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide&timezone=auto`;
    const data = await fetchJson(url, 'Air-quality service is unavailable.');
    const pm25 = Number(data.current?.pm2_5);
    if (!Number.isFinite(pm25)) throw new Error('No PM2.5 reading was returned.');
    const providedAqi = Number(data.current?.us_aqi);
    return { pm25, usAqi: Number.isFinite(providedAqi) ? Math.round(providedAqi) : pm25ToAqi(pm25), source: 'live', ts: Date.now() };
  }
}

export class SimulatedSource implements AirQualitySource {
  constructor(private value: number) {}
  async getReading(): Promise<AirReading> {
    // The demo control intentionally uses one value for PM2.5 and US AQI so the
    // required 20/120/175/350 presets land in their named risk bands.
    return { pm25: this.value, usAqi: Math.round(this.value), source: 'simulated', ts: Date.now() };
  }
}

export class SensorSource implements AirQualitySource {
  async getReading(): Promise<AirReading> {
    // TODO: wire Adam's sensor here. Expected: { pm25, usAqi, source: 'sensor', ts }.
    // BLE requires a custom Expo dev build; an ESP HTTP endpoint can preserve Expo Go.
    throw new Error('Sensor source is not connected yet.');
  }
}

export async function getWeather(): Promise<WeatherReading> {
  const { latitude, longitude } = await coordinates();
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
  const current = (await fetchJson(url, 'Weather service is unavailable.')).current;
  return { temperature: current.temperature_2m, humidity: current.relative_humidity_2m, windSpeed: current.wind_speed_10m, weatherCode: current.weather_code };
}
