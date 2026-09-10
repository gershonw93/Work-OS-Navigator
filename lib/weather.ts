// ─────────────────────────────────────────────────────────────────────────────
// What the sky was doing, and the icon that says so.
//
// THE BUG. The client portal printed a sun beside every daily log - the
// character `☀`, hardcoded, next to whatever weather had actually been
// recorded. So a log filed on a rainy day showed the client a sun over the word
// "rainy", and a snowy one showed a sun over "snowy". On the page a customer
// reads, which is the page that is meant to be evidence.
//
// The daily-logs screen inside the app had the table all along and the portal
// never got it. Two screens showing one field, one of them making it up.
//
// AND IT IS AN ICON, NOT A CHARACTER. `☀` renders in whatever font the platform
// hands it - a thin outline on one machine, a colour emoji on a phone - at a
// size and weight nothing here controls. Every other icon in the app is a
// lucide component, sized and coloured by the same classes as the text beside
// it. That was the visible half of the same mistake.
// ─────────────────────────────────────────────────────────────────────────────

import { Sun, Cloud, CloudRain, CloudSnow, Wind, type LucideIcon } from 'lucide-react'

export interface WeatherOption {
  value: string
  label: string
  icon: LucideIcon
}

export const WEATHER_OPTIONS: WeatherOption[] = [
  { value: 'sunny',  label: 'Sunny',  icon: Sun },
  { value: 'cloudy', label: 'Cloudy', icon: Cloud },
  { value: 'rainy',  label: 'Rainy',  icon: CloudRain },
  { value: 'snowy',  label: 'Snowy',  icon: CloudSnow },
  { value: 'windy',  label: 'Windy',  icon: Wind },
]

export function weatherOption(condition: string | null | undefined): WeatherOption | null {
  if (!condition) return null
  return WEATHER_OPTIONS.find(o => o.value === condition) ?? null
}

/**
 * NULL FOR A CONDITION NOBODY RECOGNISES, deliberately.
 *
 * A weather value typed by the field app, or one added to the list later, must
 * come back as no icon rather than as a default one - a wrong picture beside
 * the right word is worse than the word on its own, and that is exactly what
 * the hardcoded sun was.
 */
export function weatherIcon(condition: string | null | undefined): LucideIcon | null {
  return weatherOption(condition)?.icon ?? null
}
