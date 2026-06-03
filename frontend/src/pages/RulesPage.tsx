import { useState } from 'react';
import { Link } from 'react-router-dom';

type Lang = 'en' | 'he';

const ENGLISH = [
  {
    icon: '🎯',
    title: 'How predictions work',
    body: (
      <>
        <p>Every match has <b>5 separate things</b> to predict. Get each one right, get points. There is no "all or nothing" — you can be partially right and still score.</p>
        <ol style={{ marginTop: 10, paddingLeft: 20, lineHeight: 1.7 }}>
          <li><b>Match result</b> — Home win / Draw / Away win</li>
          <li><b>Home team goals</b> — exact number (e.g. 2)</li>
          <li><b>Away team goals</b> — exact number (e.g. 1)</li>
          <li><b>First scoring team</b> — Home / Away / None (for 0-0)</li>
          <li><b>Goal difference</b> — exact difference (e.g. 1)</li>
        </ol>
      </>
    ),
  },
  {
    icon: '⚽',
    title: 'Points per correct bet',
    body: (
      <>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginTop: 6 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 4px' }}>Stage</th>
              <th style={{ textAlign: 'right', padding: '6px 4px' }}>Per correct</th>
              <th style={{ textAlign: 'right', padding: '6px 4px' }}>Max</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 4px' }}>Group stage</td>
              <td style={{ textAlign: 'right', padding: '6px 4px' }}><b>2 pts</b></td>
              <td style={{ textAlign: 'right', padding: '6px 4px' }}>10 (perfect ⭐)</td>
            </tr>
            <tr>
              <td style={{ padding: '6px 4px' }}>Knockout (R32 → Final)</td>
              <td style={{ textAlign: 'right', padding: '6px 4px' }}><b>3 pts</b></td>
              <td style={{ textAlign: 'right', padding: '6px 4px' }}>15 (perfect ⭐)</td>
            </tr>
          </tbody>
        </table>
        <p style={{ marginTop: 12, fontSize: 13 }}><b>Perfect match</b> = all 5 bets correct. A ⭐ shows next to your name on the leaderboard.</p>
      </>
    ),
  },
  {
    icon: '🌍',
    title: 'Pre-tournament predictions',
    body: (
      <>
        <p>Before the tournament, you also predict the whole thing. Big points, locked at tournament start.</p>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginTop: 10 }}>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '5px 4px' }}>Tournament winner</td><td style={{ textAlign: 'right', padding: '5px 4px' }}><b>16 pts</b></td></tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '5px 4px' }}>Runner-up</td><td style={{ textAlign: 'right', padding: '5px 4px' }}><b>8 pts</b></td></tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '5px 4px' }}>Top scorer (player name)</td><td style={{ textAlign: 'right', padding: '5px 4px' }}><b>12 pts</b></td></tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '5px 4px' }}>Top assister (player name)</td><td style={{ textAlign: 'right', padding: '5px 4px' }}><b>12 pts</b></td></tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '5px 4px' }}>Each group winner (×12)</td><td style={{ textAlign: 'right', padding: '5px 4px' }}><b>4 pts each</b></td></tr>
            <tr><td style={{ padding: '5px 4px' }}>Each group runner-up (×12)</td><td style={{ textAlign: 'right', padding: '5px 4px' }}><b>4 pts each</b></td></tr>
          </tbody>
        </table>
        <p style={{ marginTop: 12, fontSize: 13 }}>Total possible: <b>132 pts</b>. Editable until the tournament starts.</p>
      </>
    ),
  },
  {
    icon: '⏰',
    title: 'Deadlines',
    body: (
      <ul style={{ paddingLeft: 18, lineHeight: 1.7 }}>
        <li><b>Match prediction</b> locks <b>1 hour before kickoff</b>.</li>
        <li><b>Pre-tournament</b> locks at the tournament start.</li>
        <li><b>If you miss a deadline</b>: a default 0-0 draw is filled in, scored at half rate (1 pt per correct). No perfect ⭐.</li>
      </ul>
    ),
  },
  {
    icon: '📊',
    title: 'Leaderboard',
    body: (
      <ul style={{ paddingLeft: 18, lineHeight: 1.7 }}>
        <li>Updates within ~30 seconds of any match result.</li>
        <li>Shows <b>only your league's members</b>.</li>
        <li>Top 3 get medals 🥇🥈🥉. Everyone else in a table below.</li>
        <li>"Perfect ⭐" count shown for each player.</li>
      </ul>
    ),
  },
];

const HEBREW = [
  {
    icon: '🎯',
    title: 'איך עובדים החיזויים',
    body: (
      <>
        <p>כל משחק כולל <b>5 ניחושים נפרדים</b>. צודקים בכל אחד = נקודות. אין "הכל או כלום" — אפשר לצדוק חלקית ועדיין לקבל נקודות.</p>
        <ol style={{ marginTop: 10, paddingRight: 20, lineHeight: 1.7 }}>
          <li><b>תוצאת המשחק</b> — ניצחון בית / תיקו / ניצחון חוץ</li>
          <li><b>שערי קבוצת בית</b> — מספר מדויק (למשל 2)</li>
          <li><b>שערי קבוצת חוץ</b> — מספר מדויק (למשל 1)</li>
          <li><b>הקבוצה שכבשה ראשונה</b> — בית / חוץ / אף אחת</li>
          <li><b>הפרש שערים</b> — מספר מדויק (למשל 1)</li>
        </ol>
      </>
    ),
  },
  {
    icon: '⚽',
    title: 'נקודות לכל ניחוש נכון',
    body: (
      <>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginTop: 6 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'right', padding: '6px 4px' }}>שלב</th>
              <th style={{ textAlign: 'left', padding: '6px 4px' }}>לכל נכון</th>
              <th style={{ textAlign: 'left', padding: '6px 4px' }}>מקסימום</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>שלב הבתים</td>
              <td style={{ textAlign: 'left', padding: '6px 4px' }}><b>2 נק'</b></td>
              <td style={{ textAlign: 'left', padding: '6px 4px' }}>10 (מושלם ⭐)</td>
            </tr>
            <tr>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>נוקאאוט (R32 → גמר)</td>
              <td style={{ textAlign: 'left', padding: '6px 4px' }}><b>3 נק'</b></td>
              <td style={{ textAlign: 'left', padding: '6px 4px' }}>15 (מושלם ⭐)</td>
            </tr>
          </tbody>
        </table>
        <p style={{ marginTop: 12, fontSize: 13 }}><b>משחק מושלם</b> = כל 5 הניחושים נכונים. ⭐ מופיע ליד השם שלך בטבלה.</p>
      </>
    ),
  },
  {
    icon: '🌍',
    title: 'חיזויי טרום-טורניר',
    body: (
      <>
        <p>לפני שהטורניר מתחיל אתה גם מנחש את כל המונדיאל. הימורים גדולים, ננעלים עם הפתיחה.</p>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginTop: 10 }}>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '5px 4px', textAlign: 'right' }}>אלוף הטורניר</td><td style={{ textAlign: 'left', padding: '5px 4px' }}><b>16 נק'</b></td></tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '5px 4px', textAlign: 'right' }}>סגן אלוף</td><td style={{ textAlign: 'left', padding: '5px 4px' }}><b>8 נק'</b></td></tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '5px 4px', textAlign: 'right' }}>מלך השערים (שם שחקן)</td><td style={{ textAlign: 'left', padding: '5px 4px' }}><b>12 נק'</b></td></tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '5px 4px', textAlign: 'right' }}>מלך הבישולים (שם שחקן)</td><td style={{ textAlign: 'left', padding: '5px 4px' }}><b>12 נק'</b></td></tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '5px 4px', textAlign: 'right' }}>מנצח בית (×12)</td><td style={{ textAlign: 'left', padding: '5px 4px' }}><b>4 נק' לכל אחד</b></td></tr>
            <tr><td style={{ padding: '5px 4px', textAlign: 'right' }}>סגן מנצח בית (×12)</td><td style={{ textAlign: 'left', padding: '5px 4px' }}><b>4 נק' לכל אחד</b></td></tr>
          </tbody>
        </table>
        <p style={{ marginTop: 12, fontSize: 13 }}>סה"כ אפשרי: <b>132 נק'</b>. ניתן לעריכה עד פתיחת הטורניר.</p>
      </>
    ),
  },
  {
    icon: '⏰',
    title: 'דדליינים',
    body: (
      <ul style={{ paddingRight: 18, lineHeight: 1.7 }}>
        <li><b>חיזוי משחק</b> ננעל <b>שעה לפני השריקה</b>.</li>
        <li><b>חיזוי טרום-טורניר</b> ננעל עם פתיחת הטורניר.</li>
        <li><b>אם פספסת דדליין</b>: ממולא תיקו 0-0, בחצי נקודות (1 נק' לכל ניחוש נכון). בלי ⭐.</li>
      </ul>
    ),
  },
  {
    icon: '📊',
    title: 'הטבלה',
    body: (
      <ul style={{ paddingRight: 18, lineHeight: 1.7 }}>
        <li>מתעדכנת תוך ~30 שניות מכל תוצאת משחק.</li>
        <li>רואים <b>רק את חברי הליגה שלך</b>.</li>
        <li>3 ראשונים מקבלים מדליות 🥇🥈🥉. השאר בטבלה למטה.</li>
        <li>כמות "מושלמים ⭐" מוצגת ליד כל שחקן.</li>
      </ul>
    ),
  },
];

export function RulesPage() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('rules-lang') as Lang) || 'en');
  const sections = lang === 'he' ? HEBREW : ENGLISH;

  function setLangPersist(l: Lang) {
    setLang(l);
    localStorage.setItem('rules-lang', l);
  }

  const dir = lang === 'he' ? 'rtl' : 'ltr';

  return (
    <div className="page" dir={dir}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'white' }}>
          {lang === 'he' ? '📖 חוקים ושאלות נפוצות' : '📖 Rules & FAQ'}
        </h1>
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.15)', padding: 3, borderRadius: 999 }}>
          <button
            onClick={() => setLangPersist('en')}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              border: 'none',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              background: lang === 'en' ? 'white' : 'transparent',
              color: lang === 'en' ? 'var(--primary)' : 'white',
            }}
          >EN</button>
          <button
            onClick={() => setLangPersist('he')}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              border: 'none',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              background: lang === 'he' ? 'white' : 'transparent',
              color: lang === 'he' ? 'var(--primary)' : 'white',
            }}
          >עב</button>
        </div>
      </div>

      {sections.map(({ icon, title, body }) => (
        <div key={title} className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{icon}</span>
            <span>{title}</span>
          </h3>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>{body}</div>
        </div>
      ))}

      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <Link to="/" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textDecoration: 'underline' }}>
          {lang === 'he' ? '← חזרה לדף הבית' : '← Back to home'}
        </Link>
      </div>
    </div>
  );
}
