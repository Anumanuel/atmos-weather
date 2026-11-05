import { getCodeInfo } from './weather-codes.js';
import { dayIndexFor, sunState } from './astro.js';
import {
  DAY_MS, HOUR_MS, compass, formatDuration, formatHour, formatPrecip, formatTemp, formatTempDelta, formatTime, formatWind, isNum, startOfDay,
} from './format.js';

export function currentHourIndex(hourly, nowWall) {
  if (!Array.isArray(hourly) || !hourly.length) return -1;
  const hourStart = Math.floor(nowWall / HOUR_MS) * HOUR_MS;
  let index = -1;
  for (let i = 0; i < hourly.length; i += 1) {
    if (hourly[i].time <= hourStart) index = i;
    else break;
  }
  if (index === -1 && hourly[0].time > hourStart) return 0;
  return index;
}

export function hoursForDay(hourly, dayStart) {
  return hourly.filter((hour) => hour.time >= dayStart && hour.time < dayStart + DAY_MS);
}

const wetHour = (hour) => {
  const info = getCodeInfo(hour.code);
  return Boolean(info.precip) || (isNum(hour.precip) && hour.precip >= 0.2);
};

const likelyWet = (hour) => wetHour(hour) && (!isNum(hour.pop) || hour.pop >= 40);

function precipNoun(hour) {
  const info = getCodeInfo(hour.code);
  if (info.precip === 'snow' || info.precip === 'grains') return 'Snow';
  if (info.group === 'storm') return 'Thunderstorms';
  if (info.group === 'drizzle') return 'Drizzle';
  return 'Rain';
}

export function rainOutlook(weather, nowWall) {
  const start = currentHourIndex(weather.hourly, nowWall);
  if (start < 0) return null;
  const hours = weather.hourly.slice(start, start + 24);
  if (!hours.length) return null;
  const nowInfo = getCodeInfo(weather.current.code, weather.current.cloud);
  const wetNow = Boolean(nowInfo.precip);

  if (wetNow) {
    const dryIndex = hours.findIndex((hour, i) => i > 0 && !wetHour(hour) && (!isNum(hour.pop) || hour.pop < 35));
    const noun = nowInfo.precip === 'snow' || nowInfo.precip === 'grains' ? 'Snow' : nowInfo.group === 'storm' ? 'The storm' : nowInfo.group === 'drizzle' ? 'Drizzle' : 'Rain';
    if (dryIndex === -1) return { kind: 'ongoing', text: `${noun} is expected to continue for the next 24 hours.` };
    return { kind: 'easing', time: hours[dryIndex].time, text: `${noun} should ease around ${formatHour(hours[dryIndex].time)}.` };
  }

  const wetIndex = hours.findIndex((hour) => likelyWet(hour));
  if (wetIndex === -1) {
    const peak = hours.reduce((max, hour) => (isNum(hour.pop) && hour.pop > max ? hour.pop : max), 0);
    let text = 'No precipitation expected in the next 24 hours.';
    if (peak >= 40) text = `A passing shower can’t be ruled out (up to ${Math.round(peak)}% chance), but little or nothing is expected to fall.`;
    else if (peak >= 20) text = `Mostly dry for the next 24 hours, with at most a ${Math.round(peak)}% chance of precipitation.`;
    return { kind: 'dry', peak, text };
  }
  const hour = hours[wetIndex];
  const pop = isNum(hour.pop) ? ` (${Math.round(hour.pop)}% chance)` : '';
  const when = wetIndex <= 1 ? 'within the hour' : `around ${formatHour(hour.time)}`;
  return { kind: 'starting', time: hour.time, text: `${precipNoun(hour)} likely ${when}${pop}.` };
}

export function uvCategory(uv) {
  if (!isNum(uv)) return { label: 'Unavailable', color: 'var(--ink-3)', level: 0 };
  if (uv < 3) return { label: 'Low', color: 'var(--good)', level: 0 };
  if (uv < 6) return { label: 'Moderate', color: 'var(--fair)', level: 1 };
  if (uv < 8) return { label: 'High', color: 'var(--warn)', level: 2 };
  if (uv < 11) return { label: 'Very high', color: 'var(--poor)', level: 3 };
  return { label: 'Extreme', color: 'var(--severe)', level: 4 };
}

export function uvWindow(weather, nowWall) {
  const index = dayIndexFor(weather.daily, nowWall);
  if (index < 0) return null;
  const day = weather.daily[index];
  const hours = hoursForDay(weather.hourly, day.date).filter((hour) => isNum(hour.uv));
  const strong = hours.filter((hour) => hour.uv >= 3);
  const max = isNum(day.uvMax) ? day.uvMax : hours.reduce((m, hour) => Math.max(m, hour.uv), 0);
  if (!strong.length) {
    return { max, text: `UV stays low today (peak ${Math.round(max)}). No special sun protection needed.` };
  }
  const from = strong[0].time;
  const to = strong[strong.length - 1].time + HOUR_MS;
  const finished = nowWall > to;
  const text = finished
    ? `Today’s strong UV has passed. It peaked at ${Math.round(max)} (${uvCategory(max).label.toLowerCase()}).`
    : `UV is 3 or higher from ${formatTime(from)} to ${formatTime(to)}, peaking at ${Math.round(max)}. Use sun protection during those hours.`;
  return { max, from, to, text };
}

export function beaufort(kmh) {
  if (!isNum(kmh)) return '';
  const scale = [[1, 'Calm'], [6, 'Light air'], [12, 'Light breeze'], [20, 'Gentle breeze'], [29, 'Moderate breeze'], [39, 'Fresh breeze'], [50, 'Strong breeze'], [62, 'Near gale'], [75, 'Gale'], [89, 'Strong gale'], [103, 'Storm'], [118, 'Violent storm']];
  const match = scale.find(([limit]) => kmh < limit);
  return match ? match[1] : 'Hurricane force';
}

export function comfort(dewPoint) {
  if (!isNum(dewPoint)) return '';
  if (dewPoint < 5) return 'Dry air';
  if (dewPoint < 12) return 'Comfortable';
  if (dewPoint < 16) return 'Pleasant';
  if (dewPoint < 19) return 'Slightly humid';
  if (dewPoint < 22) return 'Humid';
  return 'Muggy and oppressive';
}

export function visibilityLabel(meters) {
  if (!isNum(meters)) return '';
  if (meters >= 20000) return 'Excellent';
  if (meters >= 10000) return 'Good';
  if (meters >= 4000) return 'Moderate';
  if (meters >= 1000) return 'Poor';
  return 'Very poor (fog)';
}

export function cloudLabel(percent) {
  if (!isNum(percent)) return '';
  if (percent < 10) return 'Clear skies';
  if (percent < 35) return 'Mostly clear';
  if (percent < 65) return 'Partly cloudy';
  if (percent < 90) return 'Mostly cloudy';
  return 'Fully overcast';
}

export function pressureTrend(weather, nowWall) {
  const index = currentHourIndex(weather.hourly, nowWall);
  if (index < 0) return null;
  const now = weather.hourly[index];
  const later = weather.hourly[index + 3];
  if (!now || !later || !isNum(now.pressure) || !isNum(later.pressure)) return null;
  const delta = later.pressure - now.pressure;
  if (delta > 1) return { trend: 'rising', delta, text: `Rising ${delta.toFixed(1)} hPa over the next 3 hours, usually a sign of settling weather.` };
  if (delta < -1) return { trend: 'falling', delta, text: `Falling ${Math.abs(delta).toFixed(1)} hPa over the next 3 hours, which often means unsettled weather ahead.` };
  return { trend: 'steady', delta, text: 'Steady over the next 3 hours.' };
}

export function pressureLabel(hpa) {
  if (!isNum(hpa)) return '';
  if (hpa < 1000) return 'Low pressure';
  if (hpa > 1025) return 'High pressure';
  return 'Normal';
}

export function aqiCategory(us) {
  if (!isNum(us)) return null;
  if (us <= 50) return { label: 'Good', color: 'var(--good)', advice: 'Air quality is good, with little or no health risk.' };
  if (us <= 100) return { label: 'Moderate', color: 'var(--fair)', advice: 'Acceptable. Unusually sensitive people may want to limit long outdoor exertion.' };
  if (us <= 150) return { label: 'Unhealthy for sensitive groups', color: 'var(--warn)', advice: 'Sensitive groups should reduce prolonged or heavy outdoor exertion.' };
  if (us <= 200) return { label: 'Unhealthy', color: 'var(--poor)', advice: 'Everyone may begin to feel effects. Limit time outdoors if you can.' };
  if (us <= 300) return { label: 'Very unhealthy', color: 'var(--bad)', advice: 'Health alert. Avoid prolonged outdoor activity.' };
  return { label: 'Hazardous', color: 'var(--severe)', advice: 'Serious health risk for everyone. Stay indoors where possible.' };
}

export function describeNow(weather, prefs) {
  const c = weather.current;
  const info = getCodeInfo(c.code, c.cloud);
  const parts = [];
  if (isNum(c.windSpeed)) {
    if (c.windSpeed < 2) {
      parts.push('The air is calm.');
    } else {
      const from = isNum(c.windDir) ? ` from the ${compass(c.windDir, 'long')}` : '';
      const gust = isNum(c.gusts) && c.gusts - c.windSpeed >= 10 ? `, gusting to ${formatWind(c.gusts, prefs.wind)}` : '';
      parts.push(`${beaufort(c.windSpeed)}${from} at ${formatWind(c.windSpeed, prefs.wind)}${gust}.`);
    }
  }
  if (isNum(c.feels) && isNum(c.temp)) {
    const delta = c.feels - c.temp;
    if (Math.abs(delta) >= 2) {
      let cause = '';
      if (delta < 0 && isNum(c.windSpeed) && c.windSpeed >= 8) cause = ' thanks to the wind';
      else if (delta < 0 && isNum(c.humidity) && c.humidity >= 80) cause = ' in the damp air';
      else if (delta > 0 && isNum(c.humidity) && c.humidity >= 60) cause = ' because of the humidity';
      else if (delta > 0 && c.isDay) cause = ' in the sunshine';
      parts.push(`It feels ${formatTempDelta(delta, prefs.unit)} ${delta < 0 ? 'colder' : 'warmer'} than the actual temperature${cause}.`);
    } else {
      parts.push('It feels close to the actual temperature.');
    }
  }
  if (info.precip && isNum(c.precip) && c.precip > 0) {
    parts.push(`${formatPrecip(c.precip)} fell in the last ${Math.round((c.interval || 900) / 60)} minutes.`);
  }
  return parts.slice(0, 2).join(' ');
}

export function heroInsight(weather, nowWall, prefs) {
  const outlook = rainOutlook(weather, nowWall);
  if (outlook && (outlook.kind === 'starting' || outlook.kind === 'easing') && outlook.time - nowWall < 6 * HOUR_MS) return outlook.text;

  const sun = sunState(weather, nowWall);
  if (sun.mode === 'day' && sun.remaining < 75 * 60000) return `Sunset in ${formatDuration(sun.remaining)}, at ${formatTime(sun.sunset)}.`;
  if ((sun.mode === 'before-sunrise' || sun.mode === 'after-sunset') && sun.untilSunrise < 75 * 60000) {
    return `Sunrise in ${formatDuration(sun.untilSunrise)}.`;
  }

  const index = currentHourIndex(weather.hourly, nowWall);
  if (index >= 0 && isNum(weather.current.temp)) {
    const window = weather.hourly.slice(index + 1, index + 7).filter((hour) => isNum(hour.temp));
    if (window.length) {
      const extreme = window.reduce((best, hour) => (Math.abs(hour.temp - weather.current.temp) > Math.abs(best.temp - weather.current.temp) ? hour : best));
      const delta = extreme.temp - weather.current.temp;
      if (Math.abs(delta) >= 3) {
        return `${delta > 0 ? 'Warming' : 'Cooling'} to ${formatTemp(extreme.temp, prefs.unit)} by ${formatHour(extreme.time)}.`;
      }
    }
  }
  if (outlook && outlook.kind === 'dry') return outlook.text;
  return '';
}

export function daySummary(weather, dayIndex, prefs) {
  const day = weather.daily[dayIndex];
  if (!day) return '';
  const info = getCodeInfo(day.code);
  const hours = hoursForDay(weather.hourly, day.date);
  const parts = [`${info.label}.`];
  if (isNum(day.max) && isNum(day.min)) {
    const warmest = hours.filter((hour) => isNum(hour.temp)).reduce((best, hour) => (!best || hour.temp > best.temp ? hour : best), null);
    parts.push(`Ranging from ${formatTemp(day.min, prefs.unit)} to ${formatTemp(day.max, prefs.unit)}${warmest ? `, warmest around ${formatHour(warmest.time)}` : ''}.`);
  }
  if (isNum(day.popMax) && day.popMax >= 30) {
    const wet = hours.filter((hour) => isNum(hour.pop) && hour.pop >= 40);
    const end = wet.length ? wet[wet.length - 1].time + HOUR_MS : 0;
    const endLabel = end && new Date(end).getUTCHours() === 0 ? 'midnight' : formatHour(end);
    const window = wet.length ? ` between ${formatHour(wet[0].time)} and ${endLabel}` : '';
    const amount = isNum(day.precipSum) && day.precipSum > 0 ? `, about ${formatPrecip(day.precipSum)} in total` : '';
    parts.push(`${Math.round(day.popMax)}% chance of precipitation${window}${amount}.`);
  } else if (isNum(day.popMax)) {
    parts.push('Little chance of precipitation.');
  }
  if (isNum(day.windMax) && day.windMax >= 30) {
    parts.push(`Breezy, with winds up to ${formatWind(day.windMax, prefs.wind)}${isNum(day.windDir) ? ` from the ${compass(day.windDir, 'long')}` : ''}.`);
  }
  if (isNum(day.uvMax) && day.uvMax >= 6) parts.push(`UV reaches ${Math.round(day.uvMax)}, ${uvCategory(day.uvMax).label.toLowerCase()}.`);
  return parts.join(' ');
}

export function todaySummary(weather, nowWall, prefs) {
  const index = dayIndexFor(weather.daily, nowWall);
  if (index < 0) return '';
  return daySummary(weather, index, prefs);
}

export { startOfDay };
