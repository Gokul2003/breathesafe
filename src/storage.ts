import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertEntry, HistoryData, StoredReading, SymptomEntry } from './types';

const KEYS = { readings: '@breathesafe/readings', alerts: '@breathesafe/alerts', symptoms: '@breathesafe/symptoms' };
const MAX_ITEMS = 200;

async function readList<T>(key: string): Promise<T[]> {
  try { return JSON.parse((await AsyncStorage.getItem(key)) ?? '[]'); } catch { return []; }
}

async function prepend<T>(key: string, item: T): Promise<T[]> {
  const next = [item, ...(await readList<T>(key))].slice(0, MAX_ITEMS);
  await AsyncStorage.setItem(key, JSON.stringify(next));
  return next;
}

export const loadHistory = async (): Promise<HistoryData> => ({
  readings: await readList<StoredReading>(KEYS.readings),
  alerts: await readList<AlertEntry>(KEYS.alerts),
  symptoms: await readList<SymptomEntry>(KEYS.symptoms),
});

export const saveReading = (item: StoredReading) => prepend(KEYS.readings, item);
export const saveAlert = (item: AlertEntry) => prepend(KEYS.alerts, item);
export const saveSymptom = (item: SymptomEntry) => prepend(KEYS.symptoms, item);
