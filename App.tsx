import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { LiveApiSource, SimulatedSource, getWeather } from './src/sources';
import { getRiskBand } from './src/risk';
import { loadHistory, saveAlert, saveReading, saveSymptom } from './src/storage';
import { AirReading, HistoryData, SymptomSeverity, WeatherReading } from './src/types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

type Tab = 'Home' | 'History' | 'Settings';
const EMPTY_HISTORY: HistoryData = { readings: [], alerts: [], symptoms: [] };
const SIM_KEY = '@breathesafe/simulation';
const LAST_BAND_KEY = '@breathesafe/last-band';

export default function App() {
  const [tab, setTab] = useState<Tab>('Home');
  const [reading, setReading] = useState<AirReading | null>(null);
  const [weather, setWeather] = useState<WeatherReading | null>(null);
  const [history, setHistory] = useState<HistoryData>(EMPTY_HISTORY);
  const [simulated, setSimulated] = useState(false);
  const [simValue, setSimValue] = useState(20);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [symptomOpen, setSymptomOpen] = useState(false);

  const refreshHistory = useCallback(async () => setHistory(await loadHistory()), []);

  const refresh = useCallback(async (showSpinner = true, sim = simulated, value = simValue) => {
    if (showSpinner) setRefreshing(true);
    setError(null);
    try {
      const source = sim ? new SimulatedSource(value) : new LiveApiSource();
      const [nextReading, nextWeather] = await Promise.all([
        source.getReading(),
        getWeather().catch(() => null),
      ]);
      const band = getRiskBand(nextReading.usAqi);
      await saveReading({ ...nextReading, category: band.category });
      const previousBand = await AsyncStorage.getItem(LAST_BAND_KEY);
      if (band.warning && previousBand !== band.category) {
        await saveAlert({ ts: nextReading.ts, usAqi: nextReading.usAqi, category: band.category });
        try {
          await Notifications.scheduleNotificationAsync({
            content: { title: `⚠️ Air quality is ${band.category}`, body: band.advice },
            trigger: null,
          });
        } catch { /* The in-app warning remains available if OS alerts are disabled. */ }
      }
      await AsyncStorage.setItem(LAST_BAND_KEY, band.category);
      setReading(nextReading);
      if (nextWeather) setWeather(nextWeather);
      await refreshHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update conditions.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshHistory, simulated, simValue]);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(SIM_KEY);
      const prefs = saved ? JSON.parse(saved) : { enabled: false, value: 20 };
      setSimulated(prefs.enabled);
      setSimValue(prefs.value);
      await Notifications.requestPermissionsAsync().catch(() => undefined);
      await refreshHistory();
      await refresh(false, prefs.enabled, prefs.value);
    })();
  }, []); // Intentional one-time initialization.

  useEffect(() => {
    const timer = setInterval(() => refresh(false), 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [refresh]);

  const setSimulation = async (enabled: boolean, value = simValue) => {
    setSimulated(enabled);
    await AsyncStorage.setItem(SIM_KEY, JSON.stringify({ enabled, value }));
    await refresh(true, enabled, value);
  };

  const setSimulationValue = async (value: number, apply = false) => {
    const rounded = Math.round(value);
    setSimValue(rounded);
    await AsyncStorage.setItem(SIM_KEY, JSON.stringify({ enabled: simulated, value: rounded }));
    if (apply && simulated) await refresh(true, true, rounded);
  };

  const logSymptom = async (severity: SymptomSeverity, note: string) => {
    await saveSymptom({ ts: Date.now(), severity, note: note.trim() || undefined });
    await refreshHistory();
    setSymptomOpen(false);
    setTab('History');
  };

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <View style={styles.topBar}>
        <View><Text style={styles.brand}>BreatheSafe</Text><Text style={styles.subtitle}>Air quality and breathing risk</Text></View>
        {simulated && <View style={styles.demoPill}><Text style={styles.demoPillText}>DEMO</Text></View>}
      </View>

      <View style={styles.content}>
        {tab === 'Home' && <HomeScreen reading={reading} weather={weather} loading={loading} error={error} refreshing={refreshing} onRefresh={() => refresh()} onCheckIn={() => setSymptomOpen(true)} />}
        {tab === 'History' && <HistoryScreen history={history} />}
        {tab === 'Settings' && <SettingsScreen simulated={simulated} value={simValue} onToggle={setSimulation} onValue={setSimulationValue} />}
      </View>

      <View style={styles.tabBar}>
        {(['Home', 'History', 'Settings'] as Tab[]).map((name) => (
          <Pressable key={name} onPress={() => setTab(name)} style={styles.tabItem}>
            <Text style={[styles.tabLabel, tab === name && styles.tabActive]}>{name}</Text>
          </Pressable>
        ))}
      </View>
      <SymptomModal visible={symptomOpen} onClose={() => setSymptomOpen(false)} onSave={logSymptom} />
    </SafeAreaView>
  );
}

function HomeScreen({ reading, weather, loading, error, refreshing, onRefresh, onCheckIn }: { reading: AirReading | null; weather: WeatherReading | null; loading: boolean; error: string | null; refreshing: boolean; onRefresh: () => void; onCheckIn: () => void }) {
  const band = reading ? getRiskBand(reading.usAqi) : null;
  if (loading && !reading) return <View style={styles.center}><ActivityIndicator size="large" color="#167c72" /><Text style={styles.loadingText}>Loading current conditions…</Text></View>;
  return (
    <ScrollView contentContainerStyle={styles.screen} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#167c72" />}>
      {band?.warning && <View style={[styles.warningBanner, { borderColor: band.color }]}><View style={styles.flex}><Text style={styles.warningTitle}>Air quality warning</Text><Text style={styles.warningText}>{band.category}. Consider limiting time outdoors.</Text></View></View>}
      {error && <Pressable onPress={onRefresh} style={styles.errorBox}><Text style={styles.errorText}>{error} Tap to retry.</Text></Pressable>}
      {reading && band && <>
        <View style={[styles.riskCard, { backgroundColor: band.color }]}>
          <Text style={styles.riskEyebrow}>RESPIRATORY RISK</Text>
          <Text style={styles.riskLevel}>{band.risk}</Text>
          <Text style={styles.category}>{band.category}</Text>
          <View style={styles.divider} />
          <Text style={styles.advice}>{band.advice}</Text>
        </View>
        <View style={styles.metricRow}>
          <Metric label="US AQI" value={`${reading.usAqi}`} detail={band.category} color={band.color} />
          <Metric label="PM2.5" value={reading.pm25.toFixed(1)} detail="µg/m³" color="#167c72" />
        </View>
        <View style={styles.weatherCard}>
          <Text style={styles.sectionTitle}>Weather context</Text>
          {weather ? <View style={styles.weatherRow}>
            <WeatherMetric icon="☀" value={`${Math.round(weather.temperature)}°F`} label="Temperature" />
            <WeatherMetric icon="◉" value={`${Math.round(weather.humidity)}%`} label="Humidity" />
            <WeatherMetric icon="≈" value={`${Math.round(weather.windSpeed)} mph`} label="Wind" />
          </View> : <Text style={styles.muted}>Weather unavailable</Text>}
        </View>
        <Pressable style={styles.checkInButton} onPress={onCheckIn}><View><Text style={styles.checkInTitle}>Log breathing symptoms</Text><Text style={styles.checkInText}>Record severity and an optional note</Text></View><Text style={styles.chevron}>›</Text></Pressable>
        <Text style={styles.updated}>Updated {new Date(reading.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {reading.source === 'simulated' ? 'Simulated data' : 'Open-Meteo near you'}</Text>
        <Text style={styles.disclaimer}>BreatheSafe is an awareness aid, not a medical device. It does not diagnose or replace professional medical advice.</Text>
      </>}
    </ScrollView>
  );
}

function Metric({ label, value, detail, color }: { label: string; value: string; detail: string; color: string }) {
  return <View style={styles.metricCard}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, { color }]}>{value}</Text><Text numberOfLines={2} style={styles.metricDetail}>{detail}</Text></View>;
}

function WeatherMetric({ icon, value, label }: { icon: string; value: string; label: string }) {
  return <View style={styles.weatherMetric}><Text style={styles.weatherIcon}>{icon}</Text><Text style={styles.weatherValue}>{value}</Text><Text style={styles.weatherLabel}>{label}</Text></View>;
}

function HistoryScreen({ history }: { history: HistoryData }) {
  const events = useMemo(() => [
    ...history.readings.map(item => ({ type: 'reading' as const, ...item })),
    ...history.alerts.map(item => ({ type: 'alert' as const, ...item })),
    ...history.symptoms.map(item => ({ type: 'symptom' as const, ...item })),
  ].sort((a, b) => b.ts - a.ts), [history]);
  return <ScrollView contentContainerStyle={styles.screen}>
    <Text style={styles.pageTitle}>Your history</Text><Text style={styles.pageIntro}>Readings, warnings, and check-ins are stored only on this device.</Text>
    {events.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No activity yet</Text><Text style={styles.muted}>Refresh the dashboard or log a check-in.</Text></View> : events.map((event, index) => {
      const date = new Date(event.ts);
      const title = event.type === 'alert' ? `Air quality warning` : event.type === 'symptom' ? `${event.severity[0].toUpperCase() + event.severity.slice(1)} symptoms` : `${event.category} air quality`;
      const detail = event.type === 'alert' ? `${event.category} · AQI ${event.usAqi}` : event.type === 'symptom' ? (event.note || 'No note added') : `AQI ${event.usAqi} · PM2.5 ${event.pm25.toFixed(1)} · ${event.source}`;
      const color = event.type === 'alert' ? '#e74c3c' : event.type === 'symptom' ? '#167c72' : getRiskBand(event.usAqi).color;
      return <View style={styles.timelineRow} key={`${event.type}-${event.ts}-${index}`}><View style={styles.timelineTrack}><View style={[styles.timelineDot, { backgroundColor: color }]} />{index < events.length - 1 && <View style={styles.timelineLine} />}</View><View style={styles.timelineCard}><View style={styles.historyTop}><Text style={styles.historyType}>{event.type.toUpperCase()}</Text><Text style={styles.historyTime}>{date.toLocaleDateString([], { month: 'short', day: 'numeric' })} · {date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text></View><Text style={styles.historyTitle}>{title}</Text><Text style={styles.historyDetail}>{detail}</Text></View></View>;
    })}
  </ScrollView>;
}

function SettingsScreen({ simulated, value, onToggle, onValue }: { simulated: boolean; value: number; onToggle: (v: boolean) => void; onValue: (v: number, apply?: boolean) => void }) {
  const presets = [{ name: 'Good', value: 20, color: '#2ecc71' }, { name: 'USG', value: 120, color: '#e67e22' }, { name: 'Unhealthy', value: 175, color: '#e74c3c' }, { name: 'Hazardous', value: 350, color: '#7e0023' }];
  return <ScrollView contentContainerStyle={styles.screen}>
    <Text style={styles.pageTitle}>Settings</Text><Text style={styles.pageIntro}>Control data used throughout BreatheSafe.</Text>
    <View style={styles.settingCard}><View style={styles.settingHeader}><View style={styles.flex}><Text style={styles.settingTitle}>Use simulated data</Text><Text style={styles.settingText}>Override live air data for interface testing.</Text></View><Switch value={simulated} onValueChange={onToggle} trackColor={{ false: '#ccd6d3', true: '#7dc1b8' }} thumbColor={simulated ? '#167c72' : '#fff'} /></View>
      <View style={[styles.simControls, !simulated && styles.disabled]} pointerEvents={simulated ? 'auto' : 'none'}>
        <View style={styles.sliderHeader}><Text style={styles.sliderLabel}>Simulated PM2.5</Text><Text style={styles.sliderValue}>{value} <Text style={styles.sliderUnit}>µg/m³</Text></Text></View>
        <Slider minimumValue={0} maximumValue={400} step={1} value={value} onValueChange={v => onValue(v)} onSlidingComplete={v => onValue(v, true)} minimumTrackTintColor="#167c72" maximumTrackTintColor="#dce5e3" thumbTintColor="#167c72" />
        <View style={styles.scale}><Text style={styles.mutedSmall}>0</Text><Text style={styles.mutedSmall}>400</Text></View>
        <Text style={styles.presetLabel}>QUICK PRESETS</Text><View style={styles.presetRow}>{presets.map(p => <Pressable key={p.name} onPress={() => onValue(p.value, true)} style={[styles.preset, value === p.value && { borderColor: p.color, backgroundColor: `${p.color}16` }]}><View style={[styles.presetDot, { backgroundColor: p.color }]} /><Text style={styles.presetName}>{p.name}</Text><Text style={styles.presetValue}>{p.value}</Text></Pressable>)}</View>
        <Text style={styles.demoNote}>For repeatable tests, demo PM2.5 values also drive the displayed AQI band.</Text>
      </View>
    </View>
    <View style={styles.settingCard}><Text style={styles.settingTitle}>Live data source</Text><Text style={styles.settingText}>Air quality and weather come from Open-Meteo using your approximate GPS location. Atlanta is used if location access is unavailable.</Text><View style={styles.sourcePill}><View style={styles.onlineDot} /><Text style={styles.sourceText}>Open-Meteo · No API key</Text></View></View>
    <View style={styles.settingCard}><Text style={styles.settingTitle}>About this prototype</Text><Text style={styles.settingText}>Built for CS 7470 Team #36. Data stays locally on your phone. Future Arduino PM2.5 support is stubbed in the source layer.</Text></View>
  </ScrollView>;
}

function SymptomModal({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (severity: SymptomSeverity, note: string) => void }) {
  const [severity, setSeverity] = useState<SymptomSeverity>('none');
  const [note, setNote] = useState('');
  const options: SymptomSeverity[] = ['none', 'mild', 'moderate', 'severe'];
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Pressable style={styles.modalDismiss} onPress={onClose} /><View style={styles.modalSheet}><View style={styles.modalHandle} /><Text style={styles.modalTitle}>Breathing check-in</Text><Text style={styles.modalIntro}>How difficult is breathing right now?</Text><View style={styles.severityRow}>{options.map(option => <Pressable key={option} onPress={() => setSeverity(option)} style={[styles.severityButton, severity === option && styles.severitySelected]}><Text style={[styles.severityText, severity === option && styles.severityTextSelected]}>{option[0].toUpperCase() + option.slice(1)}</Text></Pressable>)}</View><Text style={styles.noteLabel}>NOTE (OPTIONAL)</Text><TextInput value={note} onChangeText={setNote} multiline placeholder="What were you doing? Any triggers?" placeholderTextColor="#87938f" style={styles.noteInput} /><Pressable style={styles.saveButton} onPress={() => { onSave(severity, note); setSeverity('none'); setNote(''); }}><Text style={styles.saveText}>Save check-in</Text></Pressable><Pressable onPress={onClose}><Text style={styles.cancelText}>Cancel</Text></Pressable></View></KeyboardAvoidingView></Modal>;
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: '#f2f2f7' }, content: { flex: 1 }, flex: { flex: 1 }, topBar: { height: 64, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#c6c6c8', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 }, brand: { color: '#1c1c1e', fontSize: 20, fontWeight: '700' }, subtitle: { color: '#6e6e73', fontSize: 11, marginTop: 1 }, demoPill: { marginLeft: 'auto', backgroundColor: '#f2e7d5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }, demoPillText: { color: '#8a5100', fontWeight: '700', fontSize: 10, letterSpacing: 0.5 }, screen: { padding: 16, paddingBottom: 28 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }, loadingText: { color: '#636366' }, warningBanner: { backgroundColor: '#fff', borderLeftWidth: 4, borderRadius: 8, padding: 13, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }, warningTitle: { fontWeight: '700', color: '#1c1c1e', fontSize: 14 }, warningText: { color: '#636366', fontSize: 12, marginTop: 2 }, errorBox: { backgroundColor: '#fbe9e7', padding: 12, borderRadius: 8, marginBottom: 12 }, errorText: { color: '#a7372c', fontSize: 13 }, riskCard: { borderRadius: 12, padding: 20, minHeight: 210 }, riskEyebrow: { color: '#fff', opacity: 0.9, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 }, riskLevel: { color: '#fff', fontSize: 38, fontWeight: '700', marginTop: 13 }, category: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 3 }, divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#fff', opacity: 0.45, marginVertical: 16 }, advice: { color: '#fff', fontSize: 15, lineHeight: 21, fontWeight: '500' }, metricRow: { flexDirection: 'row', gap: 10, marginTop: 10 }, metricCard: { flex: 1, minHeight: 123, backgroundColor: '#fff', padding: 15, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: '#d1d1d6' }, metricLabel: { color: '#6e6e73', fontSize: 11, fontWeight: '600' }, metricValue: { fontSize: 32, fontWeight: '700', marginTop: 7 }, metricDetail: { color: '#636366', fontSize: 11, marginTop: 2, lineHeight: 14 }, weatherCard: { marginTop: 10, backgroundColor: '#fff', padding: 16, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: '#d1d1d6' }, sectionTitle: { color: '#1c1c1e', fontWeight: '700', fontSize: 15 }, weatherRow: { flexDirection: 'row', marginTop: 14 }, weatherMetric: { flex: 1, alignItems: 'center' }, weatherIcon: { color: '#167c72', fontSize: 17, marginBottom: 4 }, weatherValue: { color: '#1c1c1e', fontSize: 16, fontWeight: '600' }, weatherLabel: { color: '#8e8e93', fontSize: 10, marginTop: 2 }, muted: { color: '#8e8e93', fontSize: 13, marginTop: 8 }, checkInButton: { backgroundColor: '#fff', borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: '#d1d1d6', padding: 16, marginTop: 10, flexDirection: 'row', alignItems: 'center' }, checkInTitle: { color: '#1c1c1e', fontWeight: '600', fontSize: 15 }, checkInText: { color: '#6e6e73', fontSize: 11, marginTop: 2 }, chevron: { marginLeft: 'auto', color: '#8e8e93', fontSize: 24 }, updated: { textAlign: 'center', color: '#8e8e93', fontSize: 11, marginTop: 15 }, disclaimer: { color: '#8e8e93', textAlign: 'center', fontSize: 10, lineHeight: 14, paddingHorizontal: 8, marginTop: 10 }, tabBar: { height: 52, backgroundColor: '#fff', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#c6c6c8', flexDirection: 'row' }, tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' }, tabLabel: { color: '#8e8e93', fontWeight: '500', fontSize: 12 }, tabActive: { color: '#167c72', fontWeight: '700' }, pageTitle: { color: '#1c1c1e', fontSize: 28, fontWeight: '700' }, pageIntro: { color: '#6e6e73', lineHeight: 19, marginTop: 4, marginBottom: 18 }, empty: { backgroundColor: '#fff', borderRadius: 10, alignItems: 'center', padding: 32, marginTop: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: '#d1d1d6' }, emptyTitle: { color: '#1c1c1e', fontWeight: '600', fontSize: 16 }, timelineRow: { flexDirection: 'row' }, timelineTrack: { width: 25, alignItems: 'center' }, timelineDot: { width: 11, height: 11, borderRadius: 6, marginTop: 19, zIndex: 1, borderWidth: 2, borderColor: '#f2f2f7' }, timelineLine: { width: 1, flex: 1, backgroundColor: '#c7c7cc' }, timelineCard: { flex: 1, backgroundColor: '#fff', borderRadius: 9, padding: 14, marginBottom: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: '#d1d1d6' }, historyTop: { flexDirection: 'row', justifyContent: 'space-between' }, historyType: { fontSize: 9, color: '#6e6e73', letterSpacing: 0.7, fontWeight: '700' }, historyTime: { color: '#8e8e93', fontSize: 10 }, historyTitle: { color: '#1c1c1e', fontSize: 15, fontWeight: '600', marginTop: 7 }, historyDetail: { color: '#6e6e73', fontSize: 12, marginTop: 3 }, settingCard: { backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: '#d1d1d6', borderRadius: 10, padding: 16, marginBottom: 12 }, settingHeader: { flexDirection: 'row', alignItems: 'center', gap: 15 }, settingTitle: { color: '#1c1c1e', fontSize: 16, fontWeight: '600' }, settingText: { color: '#6e6e73', fontSize: 12, lineHeight: 18, marginTop: 4 }, simControls: { marginTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#d1d1d6', paddingTop: 16 }, disabled: { opacity: 0.4 }, sliderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }, sliderLabel: { color: '#3a3a3c', fontWeight: '500', fontSize: 13 }, sliderValue: { color: '#167c72', fontWeight: '700', fontSize: 23 }, sliderUnit: { fontSize: 11, color: '#6e6e73' }, scale: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 7, marginTop: -3 }, mutedSmall: { color: '#8e8e93', fontSize: 9 }, presetLabel: { marginTop: 17, color: '#6e6e73', fontSize: 9, fontWeight: '600', letterSpacing: 0.6 }, presetRow: { flexDirection: 'row', gap: 6, marginTop: 8 }, preset: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: '#c7c7cc', borderRadius: 7, paddingVertical: 9, alignItems: 'center' }, presetDot: { width: 7, height: 7, borderRadius: 4, marginBottom: 4 }, presetName: { color: '#3a3a3c', fontSize: 9, fontWeight: '500' }, presetValue: { color: '#1c1c1e', fontSize: 13, fontWeight: '700', marginTop: 1 }, demoNote: { color: '#6e6e73', fontSize: 10, lineHeight: 14, marginTop: 12 }, sourcePill: { alignSelf: 'flex-start', backgroundColor: '#edf7f4', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 6, marginTop: 12 }, onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2ecc71' }, sourceText: { color: '#366b64', fontSize: 10, fontWeight: '600' }, modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' }, modalDismiss: { flex: 1 }, modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: 20, paddingBottom: 28 }, modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#c7c7cc', alignSelf: 'center', marginBottom: 17 }, modalTitle: { fontSize: 23, fontWeight: '700', color: '#1c1c1e' }, modalIntro: { color: '#6e6e73', marginTop: 4 }, severityRow: { flexDirection: 'row', gap: 6, marginTop: 17 }, severityButton: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: '#c7c7cc', borderRadius: 7, paddingVertical: 11, alignItems: 'center' }, severitySelected: { backgroundColor: '#167c72', borderColor: '#167c72' }, severityText: { color: '#3a3a3c', fontSize: 11, fontWeight: '500' }, severityTextSelected: { color: '#fff' }, noteLabel: { color: '#6e6e73', fontSize: 9, fontWeight: '600', letterSpacing: 0.6, marginTop: 20, marginBottom: 7 }, noteInput: { height: 82, borderWidth: StyleSheet.hairlineWidth, borderColor: '#c7c7cc', borderRadius: 7, padding: 11, textAlignVertical: 'top', color: '#1c1c1e', fontSize: 14 }, saveButton: { backgroundColor: '#167c72', borderRadius: 8, alignItems: 'center', padding: 14, marginTop: 15 }, saveText: { color: '#fff', fontWeight: '600', fontSize: 15 }, cancelText: { color: '#6e6e73', textAlign: 'center', fontWeight: '500', paddingTop: 14 },
});
