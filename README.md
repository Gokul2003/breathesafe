# BreatheSafe

BreatheSafe is an Expo/React Native prototype for CS 7470 Team #36. It turns local PM2.5 and US AQI data into plain-language respiratory-risk guidance for people with asthma or COPD. It includes local warnings, symptom check-ins, persistent history, and a simulated-data mode for repeatable user tests.

This is an awareness aid, not a diagnostic or medical device.

## Run on an iPhone with Expo Go

Requirements: Node.js 20 or newer, npm, an iPhone with the current Expo Go app, and both devices on the same network.

```bash
npm install
npx expo start
```

Scan the QR code with the iPhone camera or Expo Go. Accept location and notification permissions. No Apple Developer account, API key, backend, or hosting is needed. If location is denied or unavailable, the live source falls back to Atlanta (33.75, -84.39).

## Demo path

1. Open Home and pull to refresh the live Open-Meteo reading.
2. Open Settings and enable **Use simulated data**.
3. Tap Good (20), then USG (120), Unhealthy (175), and Hazardous (350). The risk card, banner, local alert, and history respond to each band transition.
4. On Home, tap **How is your breathing?**, save a severity and optional note, then show it in History.
5. Restart the app to demonstrate locally persisted readings, alerts, symptoms, and simulation settings.

The simulated control intentionally maps its test value directly to the displayed AQI as well as PM2.5. This makes the required 20/120/175/350 classroom presets land predictably in their named US-AQI bands. Live readings always prefer Open-Meteo's `us_aqi`; if it is missing, the app computes AQI from PM2.5 with EPA breakpoints.

## Architecture

- `src/sources.ts`: the `AirQualitySource` implementations (`LiveApiSource`, `SimulatedSource`, and an Arduino-ready `SensorSource` stub)
- `src/risk.ts`: six exact AQI bands and EPA PM2.5-to-AQI fallback
- `src/storage.ts`: AsyncStorage persistence, capped at 200 entries per collection
- `App.tsx`: dashboard, history timeline, settings, warning transitions, notification flow, and symptom modal

The app refreshes on launch, on pull-to-refresh, after simulation changes, and every ten minutes while running. A warning is recorded and scheduled only when entering a different warning band, not on every poll.

## Changes from the original proposal

The original proposal included heart rate from a wearable and Arduino multi-sensor fusion. For this demo, wearable/heart-rate support was dropped. The prototype instead uses phone GPS plus keyless Open-Meteo air-quality/weather data. The Arduino PM2.5 integration remains as a documented source stub; BLE would require a custom Expo development build, while an ESP-hosted HTTP endpoint could retain Expo Go compatibility.

Symptom logging, risk awareness, warnings, and local history remain in scope. These changes keep the prototype free, reliable, and demoable in Expo Go without paid accounts.

## Data and privacy

Air and weather queries are sent to Open-Meteo with approximate coordinates. Readings, warning records, symptoms, notes, and settings remain in AsyncStorage on the device. There are no accounts and no cloud database.
