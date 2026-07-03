import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { matchesApi } from '../api';
import { flag, teamColor } from '../utils/flags';
import { Match } from '../types';

// Bracket page: adaptive "Road to the Final" tree.
//
// Layout:
//   - Mobile (portrait ≤ 768px): vertical layout like the reference image —
//     left column of R16 → R16/QF/SF collapsed toward center → right column
//     of R16, with trophy in the middle.
//   - Desktop (landscape): horizontal bracket — R16 far left/right → QF →
//     SF → Final in center. Traditional tournament tree.
//
// Data source: reads matches from the /matches API. Groups by round. Match
// slots are pinned by DB match_number (89-104) so future rounds render even
// when teams are still TBD.
//
// Interactivity: read-only display (per user request). No click-through to
// predict page. Just a visual. Animations: flag flutter on hover, trophy
// shine sweep, per-round staggered fade-in on mount.

// The bracket structure. Numbers are match_number in the DB.
// Grouped by round with left/right side to build the standard tournament
// tree layout. R16 has 8 matches; QF 4; SF 2; Final 1.
//
// Left side (top→bottom): R16 89, 90, 93, 94 → QF 97, 98 → SF 101 → Final 104
// Right side (top→bottom): R16 91, 92, 95, 96 → QF 99, 100 → SF 102 → Final 104
//
// Actually FIFA's bracket doesn't strictly split like this — the seed feeds
// are: W89 W90 → 97; W91 W92 → 98; W93 W94 → 99; W95 W96 → 100.
// SF: W97 W98 → 101; W99 W100 → 102. Final: W101 W102 → 104. 3rd place: L101 L102 → 103.
const BRACKET = {
  leftR16:   [89, 90, 91, 92],  // top half of tree
  rightR16:  [93, 94, 95, 96],  // bottom half of tree
  leftQF:    [97, 98],
  rightQF:   [99, 100],
  leftSF:    [101],
  rightSF:   [102],
  final:     [104],
  thirdPlace: [103],
};

// Extract just the team display or the round-name placeholder.
function teamLabel(name: string | null | undefined): string {
  if (!name) return '';
  if (name.startsWith('TBD')) return '';
  return name;
}

function TeamCell({ team, dim, big, side }: { team: string; dim?: boolean; big?: boolean; side?: 'left' | 'right' }) {
  const clr = team ? teamColor(team) : '#334';
  const size = big ? 40 : 32;
  const font = big ? 22 : 18;
  return (
    <div
      className={team ? 'bracket-flag' : ''}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexDirection: side === 'right' ? 'row-reverse' : 'row',
        opacity: dim ? 0.4 : 1,
        transition: 'opacity 0.4s',
      }}
    >
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: clr,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: font,
        boxShadow: team ? '0 2px 6px rgba(0,0,0,0.4)' : 'none',
        border: '2px solid rgba(255,255,255,0.15)',
        overflow: 'hidden',
      }}>
        {team ? flag(team) : '?'}
      </div>
      {big && (
        <div style={{
          fontSize: 12, fontWeight: 700, color: 'white',
          textAlign: side === 'right' ? 'right' : 'left',
          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{team || 'TBD'}</div>
      )}
    </div>
  );
}

// A match slot showing home + away with a divider. Used in the vertical layout.
function MatchSlot({ match, side, isFinished }: {
  match?: Match; side: 'left' | 'right'; isFinished?: boolean;
}) {
  const home = teamLabel(match?.home_team);
  const away = teamLabel(match?.away_team);
  return (
    <div
      className="bracket-match"
      style={{
        display: 'flex',
        flexDirection: side === 'right' ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 3,
        padding: '4px 6px',
        background: 'rgba(255,255,255,0.06)',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.10)',
        minWidth: 46,
      }}>
        <TeamCell team={home} side={side} dim={isFinished && match?.home_score !== null && match?.away_score !== null && match!.home_score! < match!.away_score!} />
        <TeamCell team={away} side={side} dim={isFinished && match?.home_score !== null && match?.away_score !== null && match!.away_score! < match!.home_score!} />
      </div>
      {/* Optional score/status pill */}
      {isFinished && match?.home_score !== null && match?.away_score !== null && (
        <div style={{
          fontSize: 10, fontWeight: 800,
          color: 'rgba(255,255,255,0.75)',
          background: 'rgba(0,0,0,0.4)',
          borderRadius: 4, padding: '2px 5px',
          whiteSpace: 'nowrap',
        }}>{match!.home_score}–{match!.away_score}</div>
      )}
    </div>
  );
}

// A column of match slots for one round on one side.
function RoundColumn({ matchNumbers, matches, side, delay }: {
  matchNumbers: number[]; matches: Match[]; side: 'left' | 'right'; delay: number;
}) {
  return (
    <div
      className="bracket-round-col"
      style={{
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-around',
        gap: 12, flex: 1,
        animation: `bracket-fade-in 0.6s ease-out ${delay}s both`,
      }}
    >
      {matchNumbers.map(mn => {
        const m = matches.find(x => x.match_number === mn);
        const isFinished = m?.status === 'finished';
        return <MatchSlot key={mn} match={m} side={side} isFinished={isFinished} />;
      })}
    </div>
  );
}

// Small "Final" pill in the center.
function FinalPill({ match }: { match?: Match }) {
  const home = teamLabel(match?.home_team);
  const away = teamLabel(match?.away_team);
  const isFinished = match?.status === 'finished';
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontSize: 12, fontWeight: 800, color: '#66e0a5',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        marginBottom: 8,
      }}>Final</div>
      <div style={{
        background: 'linear-gradient(180deg, rgba(102,224,165,0.15), rgba(102,224,165,0.05))',
        border: '1.5px solid rgba(102,224,165,0.4)',
        borderRadius: 12,
        padding: '8px 10px',
        display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center',
      }}>
        <TeamCell team={home} big />
        <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>vs</span>
        <TeamCell team={away} big side="right" />
      </div>
      {isFinished && match?.home_score != null && match?.away_score != null && (
        <div style={{ marginTop: 6, fontSize: 15, fontWeight: 900, color: '#66e0a5' }}>
          {match!.home_score}–{match!.away_score}
        </div>
      )}
    </div>
  );
}

export function BracketPage() {
  const { data: matches, isLoading } = useQuery({
    queryKey: ['matches'],
    queryFn: matchesApi.all,
  });
  const [hasAnimated, setHasAnimated] = useState(false);
  useEffect(() => { setHasAnimated(true); }, []);

  if (isLoading || !matches) return <div className="loading"><div className="spinner" /></div>;

  const finalMatch = matches.find(m => m.match_number === 104);
  const thirdMatch = matches.find(m => m.match_number === 103);

  return (
    <div className="page bracket-page">
      <style>{`
        @keyframes bracket-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes trophy-shine {
          0%   { filter: drop-shadow(0 0 8px rgba(255,215,0,0.4)) drop-shadow(0 0 20px rgba(255,215,0,0.15)); }
          50%  { filter: drop-shadow(0 0 18px rgba(255,215,0,0.8)) drop-shadow(0 0 32px rgba(255,215,0,0.35)); }
          100% { filter: drop-shadow(0 0 8px rgba(255,215,0,0.4)) drop-shadow(0 0 20px rgba(255,215,0,0.15)); }
        }
        @keyframes flag-flutter {
          0%, 100% { transform: rotate(0deg); }
          25%      { transform: rotate(-4deg); }
          75%      { transform: rotate(4deg); }
        }
        .bracket-flag:hover > div:first-child {
          animation: flag-flutter 0.5s ease-in-out;
        }
        .bracket-trophy {
          animation: trophy-shine 3s ease-in-out infinite;
        }
        .bracket-page {
          background: linear-gradient(180deg, #0f2438 0%, #14284a 50%, #172a58 100%);
          min-height: 100vh;
          padding: 20px 12px 40px;
        }
        .bracket-title {
          text-align: center;
          font-size: 30px;
          font-weight: 900;
          color: white;
          letter-spacing: -0.02em;
          margin-bottom: 4px;
        }
        .bracket-subtitle {
          text-align: center;
          font-size: 12px;
          color: rgba(255,255,255,0.5);
          text-transform: uppercase;
          letter-spacing: 0.14em;
          margin-bottom: 22px;
        }

        /* Desktop layout (landscape). Horizontal tree. */
        .bracket-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr auto 1fr 1fr 1fr;
          gap: 8px;
          max-width: 1200px;
          margin: 0 auto;
          align-items: center;
        }
        .bracket-round-label {
          text-align: center;
          font-size: 10px;
          font-weight: 700;
          color: rgba(255,255,255,0.4);
          text-transform: uppercase;
          letter-spacing: 0.12em;
          margin-bottom: 6px;
        }

        /* Mobile layout (portrait). Vertical tree — flags on left/right edges,
           bracket lines curving inward to center trophy. */
        @media (max-width: 768px) {
          .bracket-grid {
            grid-template-columns: 1fr 1fr;
            gap: 4px;
          }
          .bracket-mid-col, .bracket-round-label {
            display: none;
          }
          .bracket-mobile-center {
            grid-column: 1 / -1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px 0;
          }
        }
        @media (min-width: 769px) {
          .bracket-mobile-center {
            display: none;
          }
        }
      `}</style>

      <div className="bracket-title" style={{ animation: hasAnimated ? 'bracket-fade-in 0.6s both' : undefined }}>
        Road to the Final
      </div>
      <div className="bracket-subtitle" style={{ animation: hasAnimated ? 'bracket-fade-in 0.6s 0.1s both' : undefined }}>
        World Cup 2026 · Knockout Stage
      </div>

      <div className="bracket-grid">
        {/* Round headers (desktop only, per column) */}
        <div className="bracket-round-label">R16</div>
        <div className="bracket-round-label">QF</div>
        <div className="bracket-round-label">SF</div>
        <div style={{ minWidth: 140 }} />
        <div className="bracket-round-label">SF</div>
        <div className="bracket-round-label">QF</div>
        <div className="bracket-round-label">R16</div>

        {/* LEFT half */}
        <RoundColumn matchNumbers={BRACKET.leftR16} matches={matches} side="left" delay={0.15} />
        <RoundColumn matchNumbers={BRACKET.leftQF}  matches={matches} side="left" delay={0.35} />
        <RoundColumn matchNumbers={BRACKET.leftSF}  matches={matches} side="left" delay={0.55} />

        {/* CENTER (Final + trophy + 3rd place) */}
        <div className="bracket-mid-col" style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '0 12px',
          animation: hasAnimated ? 'bracket-fade-in 0.6s 0.7s both' : undefined,
        }}>
          <FinalPill match={finalMatch} />
          <div className="bracket-trophy" style={{ fontSize: 64, lineHeight: 1 }}>🏆</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
            }}>3rd Place</div>
            <div style={{
              display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.05)', padding: '6px 10px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.10)',
            }}>
              <TeamCell team={teamLabel(thirdMatch?.home_team)} />
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>vs</span>
              <TeamCell team={teamLabel(thirdMatch?.away_team)} side="right" />
            </div>
          </div>
        </div>

        {/* RIGHT half */}
        <RoundColumn matchNumbers={BRACKET.rightSF}  matches={matches} side="right" delay={0.55} />
        <RoundColumn matchNumbers={BRACKET.rightQF}  matches={matches} side="right" delay={0.35} />
        <RoundColumn matchNumbers={BRACKET.rightR16} matches={matches} side="right" delay={0.15} />

        {/* Mobile-only trophy row (spans full width) */}
        <div className="bracket-mobile-center">
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
            animation: hasAnimated ? 'bracket-fade-in 0.6s 0.7s both' : undefined,
          }}>
            <FinalPill match={finalMatch} />
            <div className="bracket-trophy" style={{ fontSize: 72, lineHeight: 1 }}>🏆</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)',
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
              }}>3rd Place</div>
              <div style={{
                display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.05)', padding: '6px 10px', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.10)',
              }}>
                <TeamCell team={teamLabel(thirdMatch?.home_team)} />
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>vs</span>
                <TeamCell team={teamLabel(thirdMatch?.away_team)} side="right" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 30 }}>
        <Link to="/predict" style={{
          display: 'inline-block',
          background: 'var(--primary)',
          color: 'white',
          padding: '10px 20px',
          borderRadius: 20,
          textDecoration: 'none',
          fontWeight: 700,
          fontSize: 13,
        }}>
          Predict upcoming matches →
        </Link>
      </div>
    </div>
  );
}
