import { NextResponse } from 'next/server'

function wmoToWeather(code: number): 'sunny' | 'cloudy' | 'rainy' | 'windy' | 'snowy' {
  if (code === 0 || code === 1) return 'sunny'
  if (code === 2 || code === 3) return 'cloudy'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) return 'rainy'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snowy'
  return 'cloudy'
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'address is required' }, { status: 400 })

  // Extract city/location for geocoding (use first part of address)
  const city = address.split(',')[0].trim()

  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
  )
  if (!geoRes.ok) return NextResponse.json({ error: 'Geocoding failed' }, { status: 502 })

  const geoData = await geoRes.json()
  const result = geoData.results?.[0]
  if (!result) return NextResponse.json({ error: `Could not geocode address: ${address}` }, { status: 404 })

  const { latitude, longitude } = result

  const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode&temperature_unit=fahrenheit&timezone=auto`
  )
  if (!weatherRes.ok) return NextResponse.json({ error: 'Weather fetch failed' }, { status: 502 })

  const weatherData = await weatherRes.json()
  const current = weatherData.current
  if (!current) return NextResponse.json({ error: 'No current weather data' }, { status: 502 })

  const weatherCode: number = current.weathercode ?? current.weather_code ?? 0
  const tempF: number = Math.round(current.temperature_2m)
  const weather = wmoToWeather(weatherCode)

  return NextResponse.json({ weather, temp_f: tempF })
}
