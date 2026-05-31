export const TEAM_FLAGS: Record<string, string> = {
  'Argentina': '🇦🇷',
  'Australia': '🇦🇺',
  'Austria': '🇦🇹',
  'Belgium': '🇧🇪',
  'Brazil': '🇧🇷',
  'Cameroon': '🇨🇲',
  'Canada': '🇨🇦',
  'Chile': '🇨🇱',
  'China': '🇨🇳',
  'Colombia': '🇨🇴',
  'Costa Rica': '🇨🇷',
  'Croatia': '🇭🇷',
  'Cuba': '🇨🇺',
  'Denmark': '🇩🇰',
  'Ecuador': '🇪🇨',
  'Egypt': '🇪🇬',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'France': '🇫🇷',
  'Germany': '🇩🇪',
  'Ghana': '🇬🇭',
  'Honduras': '🇭🇳',
  'Iran': '🇮🇷',
  'Italy': '🇮🇹',
  'Ivory Coast': '🇨🇮',
  'Japan': '🇯🇵',
  'Mexico': '🇲🇽',
  'Morocco': '🇲🇦',
  'Netherlands': '🇳🇱',
  'New Zealand': '🇳🇿',
  'Nigeria': '🇳🇬',
  'Panama': '🇵🇦',
  'Paraguay': '🇵🇾',
  'Poland': '🇵🇱',
  'Portugal': '🇵🇹',
  'Saudi Arabia': '🇸🇦',
  'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Senegal': '🇸🇳',
  'Serbia': '🇷🇸',
  'South Korea': '🇰🇷',
  'Spain': '🇪🇸',
  'Switzerland': '🇨🇭',
  'Turkey': '🇹🇷',
  'Uruguay': '🇺🇾',
  'USA': '🇺🇸',
  'Venezuela': '🇻🇪',
  'Algeria': '🇩🇿',
};

export function flag(team: string): string {
  return TEAM_FLAGS[team] ?? '🏳️';
}

/** Dominant color per nation for the color bar under the flag */
export const TEAM_COLORS: Record<string, string> = {
  'Argentina': '#74acdf',
  'Australia': '#00843d',
  'Austria': '#ed2939',
  'Belgium': '#000000',
  'Brazil': '#009c3b',
  'Cameroon': '#007a5e',
  'Canada': '#ff0000',
  'Chile': '#d52b1e',
  'China': '#de2910',
  'Colombia': '#fcd116',
  'Costa Rica': '#002b7f',
  'Croatia': '#ff0000',
  'Cuba': '#002a8f',
  'Denmark': '#c60c30',
  'Ecuador': '#ffd100',
  'Egypt': '#ce1126',
  'England': '#cf142b',
  'France': '#002395',
  'Germany': '#000000',
  'Ghana': '#006b3f',
  'Honduras': '#0073cf',
  'Iran': '#239f40',
  'Italy': '#009246',
  'Ivory Coast': '#f77f00',
  'Japan': '#bc002d',
  'Mexico': '#006847',
  'Morocco': '#c1272d',
  'Netherlands': '#ff6600',
  'New Zealand': '#00247d',
  'Nigeria': '#008751',
  'Panama': '#da121a',
  'Paraguay': '#d52b1e',
  'Poland': '#dc143c',
  'Portugal': '#006600',
  'Saudi Arabia': '#006c35',
  'Scotland': '#0065bd',
  'Senegal': '#00853f',
  'Serbia': '#c6363c',
  'South Korea': '#cd2e3a',
  'Spain': '#aa151b',
  'Switzerland': '#ff0000',
  'Turkey': '#e30a17',
  'Uruguay': '#5aaee3',
  'USA': '#b22234',
  'Venezuela': '#cf142b',
  'Algeria': '#006233',
};

export function teamColor(team: string): string {
  return TEAM_COLORS[team] ?? '#862633';
}

// ── Avatar palette ──────────────────────────────────────────────────────────
// Brighter, more saturated colors that pop on the dark WC gradient background.
export const AVATAR_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#84cc16', // lime
];

export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

/**
 * Short label for the user's local timezone, e.g. "GMT+3" or "PDT".
 * Browser may return either depending on locale; we normalize to "GMT±N" where possible.
 */
export function localTimezoneLabel(): string {
  try {
    const offset = -new Date().getTimezoneOffset() / 60;
    const sign = offset >= 0 ? '+' : '-';
    const abs = Math.abs(offset);
    return `GMT${sign}${Number.isInteger(abs) ? abs : abs.toFixed(1)}`;
  } catch {
    return 'local';
  }
}
