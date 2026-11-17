/**
 * Formats a Date object into a readable 12-hour time string with AM/PM (e.g. 08:34:12 AM)
 */
export function formatTo12HourTime(date: Date = new Date()): string {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const ampm = hours >= 12 ? "PM" : "AM";
  
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  
  const paddedHours = hours < 10 ? `0${hours}` : hours;
  const paddedMinutes = minutes < 10 ? `0${minutes}` : minutes;
  const paddedSeconds = seconds < 10 ? `0${seconds}` : seconds;
  
  return `${paddedHours}:${paddedMinutes}:${paddedSeconds} ${ampm}`;
}

/**
 * Checks if a time string (12-hour AM/PM or 24-hour format) is after 6:30 AM
 */
export function isAfter630AM(timeStr?: string): boolean {
  if (!timeStr) return false;
  
  // Parse format with potential AM/PM designation (e.g., "08:34:12 AM" or "06:31 PM")
  const match = timeStr.match(/(\d+):(\d+):?(\d+)?\s*(AM|PM)?/i);
  if (!match) return false;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[4] ? match[4].toUpperCase() : null;

  if (ampm) {
    if (ampm === "PM" && hours < 12) {
      hours += 12;
    } else if (ampm === "AM" && hours === 12) {
      hours = 0;
    }
  }

  const minutesSinceMidnight = hours * 60 + minutes;
  const cutOffMinutes = 6 * 60 + 30; // 6:30 AM is 390 minutes

  return minutesSinceMidnight > cutOffMinutes;
}

