export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`
}

export function formatNumber(n: number): string {
  return n.toLocaleString()
}

export function formatTime(seconds: number): string {
  if (seconds <= 0) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m === 0) return `${s}s`
  if (m < 60) return `${m}m ${s}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export function formatSpeed(filesPerSecond: number): string {
  const perHour = Math.round(filesPerSecond * 3600)
  return `${perHour.toLocaleString()} files/hour`
}

/** Format ISO date string to localized date (e.g. "2025년 4월 19일") */
export function formatDateLine(isoString: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(isoString))
  } catch {
    return isoString
  }
}

/** Format ISO date string to localized time (e.g. "14:30" or "2:30 PM") */
export function formatTimeLine(isoString: string, use24Hour: boolean): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: !use24Hour,
    }).format(new Date(isoString))
  } catch {
    return ''
  }
}

/** Format ISO date string to compact date+time (e.g. "4월 19일 14:30") */
export function formatDateCompact(isoString: string, use24Hour: boolean): string {
  try {
    const d = new Date(isoString)
    const date = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(d)
    const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: !use24Hour }).format(d)
    return `${date} ${time}`
  } catch {
    return isoString
  }
}

/** Format ISO date string to date with time (e.g. "2025년 4월 19일 14:30") */
export function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

/** Format duration in seconds to human-readable string */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  if (mins < 60) return `${mins}m ${secs}s`
  const hrs = Math.floor(mins / 60)
  const remainMins = mins % 60
  return `${hrs}h ${remainMins}m`
}
