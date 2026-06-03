/**
 * Generate an iCalendar (.ics) file for a match prediction reminder.
 * Compatible with Apple Calendar, Google Calendar, Outlook, every modern client.
 *
 * The user picks how many minutes BEFORE the deadline (kickoff − 1h) they
 * want to be reminded. We model the prediction as a calendar event AT the
 * deadline, with a VALARM offset = -minutesBeforeDeadline.
 */

interface BuildIcsOpts {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string; // ISO string
  minutesBeforeDeadline: number;
}

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }

function toIcsDate(d: Date): string {
  // YYYYMMDDTHHMMSSZ in UTC
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) + 'Z'
  );
}

export function buildIcs({ matchId, homeTeam, awayTeam, kickoffUtc, minutesBeforeDeadline }: BuildIcsOpts): string {
  const kickoff = new Date(kickoffUtc);
  // Deadline = kickoff − 1h
  const deadline = new Date(kickoff.getTime() - 60 * 60 * 1000);
  // Event spans 30 minutes leading up to deadline so users have a clear window
  const eventStart = new Date(deadline.getTime() - 30 * 60 * 1000);

  const uid = `wc2026-match-${matchId}@mondo-2026-two.vercel.app`;
  const dtstamp = toIcsDate(new Date());
  const dtstart = toIcsDate(eventStart);
  const dtend = toIcsDate(deadline);

  const summary = `Predict: ${homeTeam} vs ${awayTeam}`;
  const description =
    `Submit your prediction before ${deadline.toUTCString()}. ` +
    `Kickoff at ${kickoff.toUTCString()}. ` +
    `https://mondo-2026-two.vercel.app/predict/${matchId}`;

  // Trigger offset relative to event START
  const triggerMinutes = Math.max(0, minutesBeforeDeadline - 30);
  const trigger = `-PT${triggerMinutes}M`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//mondo-2026//WC2026 Predictions//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
    `URL:https://mondo-2026-two.vercel.app/predict/${matchId}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${summary}`,
    `TRIGGER:${trigger}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadIcs(opts: BuildIcsOpts) {
  const ics = buildIcs(opts);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wc2026-${opts.homeTeam}-vs-${opts.awayTeam}.ics`.replace(/\s+/g, '-');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
