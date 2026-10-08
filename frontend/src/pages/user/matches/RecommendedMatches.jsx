/**
 * Phase 8 — Recommended Matches Page.
 *
 * Displays deterministically-ranked candidate recommendations using Phase 7
 * compatibility scores. All compatibility data comes from the API response —
 * no fake percentages are generated client-side.
 *
 * Features:
 *  - Ranked match cards with profile picture, compatibility %, common hobbies, explanation
 *  - "Why This Match?" section backed by real compatibility data
 *  - Match Details modal with score breakdown bars
 *  - Connection request placeholder (Phase 10)
 *  - Pagination controls
 *  - Optional client-side filters (location, age, education, lifestyle)
 *  - Loading / empty / error states
 *  - Profile view interaction logged for Phase 9 ML
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { matchService } from '../../../services/matchService.js';

// ─── Tiny utility ────────────────────────────────────────────────────────────

function scoreColor(score) {
  if (score >= 80) return '#059669';
  if (score >= 60) return '#d97706';
  return '#dc2626';
}

function scoreLabel(score) {
  if (score >= 85) return 'Excellent Match';
  if (score >= 70) return 'Great Match';
  if (score >= 55) return 'Good Match';
  return 'Possible Match';
}

// ─── Reusable Avatar ─────────────────────────────────────────────────────────

function Avatar({ src, name, size = 72 }) {
  const initials = (name || 'U')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: '#c7d2fe',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.floor(size * 0.38),
        fontWeight: 700,
        color: '#3730a3',
        overflow: 'hidden',
        flexShrink: 0,
        border: '3px solid #e0e7ff',
      }}
    >
      {src ? (
        <img
          src={src}
          alt={name || 'Profile'}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        initials
      )}
    </div>
  );
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = scoreColor(score);

  return (
    <div style={{ position: 'relative', width: 68, height: 68, flexShrink: 0 }}>
      <svg width="68" height="68" viewBox="0 0 68 68">
        <circle cx="34" cy="34" r={r} fill="none" stroke="#e5e7eb" strokeWidth="6" />
        <circle
          cx="34"
          cy="34"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeDashoffset={circ / 4}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          fontWeight: 800,
          color,
        }}
      >
        {score}%
      </span>
    </div>
  );
}

// ─── Hobby Pill ───────────────────────────────────────────────────────────────

function HobbyPill({ hobby }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#ede9fe',
        color: '#5b21b6',
        padding: '3px 10px',
        borderRadius: 99,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {hobby}
    </span>
  );
}

// ─── MatchCard ────────────────────────────────────────────────────────────────

function MatchCard({ item, onViewDetails, onConnect, connectionSent, detailsLoading }) {
  const { userId, profile, compatibilityScore, commonHobbies, whyThisMatch } = item;
  const [hovered, setHovered] = useState(false);
  const isSent = connectionSent[userId];

  return (
    <div
      id={`match-card-${userId}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 20,
        boxShadow: hovered
          ? '0 12px 32px rgba(79, 70, 229, 0.15)'
          : '0 2px 12px rgba(0,0,0,0.06)',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'transform 0.25s ease, box-shadow 0.25s ease',
      }}
    >
      {/* Card header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)',
          padding: '20px 20px 16px',
          display: 'flex',
          gap: 14,
          alignItems: 'flex-start',
        }}
      >
        <Avatar src={profile.profilePicture} name={profile.name} size={72} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 700,
              color: '#111827',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {profile.name || 'Anonymous'}
            {profile.age ? (
              <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 15 }}>
                , {profile.age}
              </span>
            ) : null}
          </h3>

          {profile.location && (
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
              📍 {profile.location}
            </p>
          )}
          {(profile.occupation || profile.education) && (
            <p style={{ margin: '2px 0 0', color: '#4b5563', fontSize: 13 }}>
              💼{' '}
              {[profile.occupation, profile.education].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        <ScoreRing score={compatibilityScore} />
      </div>

      {/* Score label strip */}
      <div
        style={{
          padding: '8px 20px',
          backgroundColor: scoreColor(compatibilityScore) + '15',
          borderBottom: `1px solid ${scoreColor(compatibilityScore)}30`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: scoreColor(compatibilityScore),
            letterSpacing: '0.02em',
          }}
        >
          {scoreLabel(compatibilityScore)}
        </span>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>Phase 7 Compatibility</span>
      </div>

      {/* Body */}
      <div
        style={{
          padding: '16px 20px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {/* Common Hobbies */}
        {commonHobbies && commonHobbies.length > 0 && (
          <div>
            <p
              style={{
                margin: '0 0 6px',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#9ca3af',
              }}
            >
              Common Interests
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {commonHobbies.map((h) => (
                <HobbyPill key={h} hobby={h} />
              ))}
            </div>
          </div>
        )}

        {/* Why This Match */}
        {whyThisMatch && whyThisMatch.length > 0 && (
          <div>
            <p
              style={{
                margin: '0 0 6px',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#9ca3af',
              }}
            >
              Why This Match?
            </p>
            <ul
              style={{
                margin: 0,
                paddingLeft: 0,
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {whyThisMatch.slice(0, 4).map((reason, i) => (
                <li
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 6,
                    fontSize: 13,
                    color: '#374151',
                  }}
                >
                  <span style={{ color: '#059669', fontWeight: 700, flexShrink: 0 }}>✓</span>
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Bio snippet */}
        {profile.bio && (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: '#6b7280',
              fontStyle: 'italic',
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            &ldquo;{profile.bio}&rdquo;
          </p>
        )}
      </div>

      {/* Action footer */}
      <div
        style={{
          padding: '14px 20px',
          borderTop: '1px solid #f3f4f6',
          display: 'flex',
          gap: 10,
        }}
      >
        <button
          id={`view-match-${userId}`}
          onClick={() => onViewDetails(userId)}
          disabled={detailsLoading}
          style={{
            flex: 1,
            padding: '9px 12px',
            borderRadius: 10,
            border: '1.5px solid #d1d5db',
            backgroundColor: '#ffffff',
            color: '#374151',
            fontSize: 13,
            fontWeight: 600,
            cursor: detailsLoading ? 'wait' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          View Match
        </button>

        <button
          id={`connect-${userId}`}
          onClick={() => onConnect(userId)}
          disabled={isSent}
          style={{
            flex: 1,
            padding: '9px 12px',
            borderRadius: 10,
            border: 'none',
            backgroundColor: isSent ? '#d1fae5' : '#4f46e5',
            color: isSent ? '#065f46' : '#ffffff',
            fontSize: 13,
            fontWeight: 700,
            cursor: isSent ? 'default' : 'pointer',
            transition: 'background 0.15s, transform 0.1s',
          }}
        >
          {isSent ? '✓ Request Sent' : 'Connect'}
        </button>
      </div>
    </div>
  );
}

// ─── Score Breakdown Bar ──────────────────────────────────────────────────────

function BreakdownBar({ label, contribution, weight }) {
  const pct = weight > 0 ? Math.round((contribution / weight) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 13,
          marginBottom: 4,
          color: '#374151',
        }}
      >
        <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{label}</span>
        <span style={{ color: '#6b7280' }}>
          {contribution} / {weight} pts ({pct}%)
        </span>
      </div>
      <div
        style={{
          height: 8,
          backgroundColor: '#e5e7eb',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
            borderRadius: 4,
            transition: 'width 0.5s ease',
          }}
        />
      </div>
    </div>
  );
}

// ─── Match Details Modal ──────────────────────────────────────────────────────

function MatchDetailsModal({ match, onClose }) {
  const dialogRef = useRef(null);

  // Close on backdrop click
  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const breakdownEntries = Object.entries(match.scoreBreakdown || {}).filter(
    ([, v]) => typeof v === 'object' && v !== null && v.contribution !== undefined
  );

  return (
    <div
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(17, 24, 39, 0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        ref={dialogRef}
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 20,
          maxWidth: 580,
          width: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 24px 48px rgba(0,0,0,0.18)',
        }}
      >
        {/* Modal header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            borderRadius: '20px 20px 0 0',
            padding: '20px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2
              id="match-modal-title"
              style={{ margin: 0, color: '#ffffff', fontSize: 20, fontWeight: 700 }}
            >
              {match.profile?.name || 'User'}
              {match.profile?.age ? `, ${match.profile.age}` : ''}
            </h2>
            {match.profile?.location && (
              <p style={{ margin: '4px 0 0', color: '#c7d2fe', fontSize: 13 }}>
                📍 {match.profile.location}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>
                {match.compatibilityScore}%
              </div>
              <div style={{ fontSize: 11, color: '#c7d2fe', fontWeight: 600 }}>
                {scoreLabel(match.compatibilityScore)}
              </div>
            </div>

            <button
              onClick={onClose}
              aria-label="Close modal"
              style={{
                border: 'none',
                background: 'rgba(255,255,255,0.2)',
                color: '#ffffff',
                width: 32,
                height: 32,
                borderRadius: '50%',
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Profile info */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              marginBottom: 20,
              padding: 16,
              backgroundColor: '#f9fafb',
              borderRadius: 12,
            }}
          >
            <Avatar src={match.profile?.profilePicture} name={match.profile?.name} size={56} />
            <div>
              {match.profile?.education && (
                <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>
                  🎓 {match.profile.education}
                </p>
              )}
              {match.profile?.occupation && (
                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#374151' }}>
                  💼 {match.profile.occupation}
                </p>
              )}
              {match.profile?.lifestyle && (
                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#374151' }}>
                  🌿 {match.profile.lifestyle} lifestyle
                </p>
              )}
              {match.profile?.bio && (
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: 13,
                    color: '#6b7280',
                    fontStyle: 'italic',
                  }}
                >
                  &ldquo;{match.profile.bio}&rdquo;
                </p>
              )}
            </div>
          </div>

          {/* Score breakdown */}
          {breakdownEntries.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ margin: '0 0 14px', fontSize: 15, color: '#111827', fontWeight: 700 }}>
                Score Breakdown
              </h4>
              {breakdownEntries.map(([key, val]) => (
                <BreakdownBar
                  key={key}
                  label={key}
                  contribution={val.contribution}
                  weight={val.weight}
                />
              ))}
            </div>
          )}

          {/* Common hobbies */}
          {match.commonHobbies && match.commonHobbies.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 15, color: '#111827', fontWeight: 700 }}>
                Common Interests ({match.commonHobbies.length})
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {match.commonHobbies.map((h) => (
                  <HobbyPill key={h} hobby={h} />
                ))}
              </div>
            </div>
          )}

          {/* Why this match */}
          {match.whyThisMatch && match.whyThisMatch.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 15, color: '#111827', fontWeight: 700 }}>
                Why You Match
              </h4>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 0,
                  listStyle: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {match.whyThisMatch.map((reason, i) => (
                  <li
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 8,
                      fontSize: 14,
                      color: '#374151',
                      padding: '6px 10px',
                      backgroundColor: '#f0fdf4',
                      borderRadius: 8,
                    }}
                  >
                    <span style={{ color: '#059669', fontWeight: 700 }}>✓</span>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ textAlign: 'right' }}>
            <button
              onClick={onClose}
              style={{
                padding: '9px 22px',
                borderRadius: 10,
                border: '1.5px solid #d1d5db',
                backgroundColor: '#ffffff',
                color: '#374151',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Filter Panel ─────────────────────────────────────────────────────────────

function FilterPanel({ filters, onChange, onReset }) {
  const inp = {
    padding: '7px 12px',
    borderRadius: 8,
    border: '1.5px solid #e5e7eb',
    fontSize: 13,
    color: '#374151',
    backgroundColor: '#f9fafb',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 16,
        border: '1px solid #e5e7eb',
        padding: '16px 20px',
        marginBottom: 24,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 12,
        alignItems: 'end',
      }}
    >
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Location</label>
        <input style={inp} placeholder="City / country…" value={filters.location} onChange={(e) => onChange('location', e.target.value)} />
      </div>
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Min Age</label>
        <input style={inp} type="number" min={18} max={120} placeholder="18" value={filters.minAge} onChange={(e) => onChange('minAge', e.target.value)} />
      </div>
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Max Age</label>
        <input style={inp} type="number" min={18} max={120} placeholder="60" value={filters.maxAge} onChange={(e) => onChange('maxAge', e.target.value)} />
      </div>
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Education</label>
        <input style={inp} placeholder="e.g. Bachelor…" value={filters.education} onChange={(e) => onChange('education', e.target.value)} />
      </div>
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Lifestyle</label>
        <input style={inp} placeholder="Active / Relaxed…" value={filters.lifestyle} onChange={(e) => onChange('lifestyle', e.target.value)} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <button
          onClick={onReset}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 8,
            border: '1.5px solid #d1d5db',
            backgroundColor: '#f9fafb',
            color: '#6b7280',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reset Filters
        </button>
      </div>
    </div>
  );
}

// ─── Skeleton Card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 20,
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
      }}
    >
      <style>{`@keyframes shimmer { 0%{opacity:1} 50%{opacity:0.45} 100%{opacity:1} }`}</style>
      {[140, 50, 90, 90, 60].map((h, i) => (
        <div
          key={i}
          style={{
            height: h,
            backgroundColor: '#f3f4f6',
            margin: i === 0 ? 0 : '0 20px 12px',
            borderRadius: i === 0 ? 0 : 8,
            animation: 'shimmer 1.4s ease-in-out infinite',
          }}
        />
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const EMPTY_FILTERS = { location: '', minAge: '', maxAge: '', education: '', lifestyle: '' };

export default function RecommendedMatches() {
  const [recommendations, setRecommendations] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedMatch, setSelectedMatch] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [connectionSent, setConnectionSent] = useState({});
  const [connectionError, setConnectionError] = useState(null);

  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);

  const fetchRecommendations = useCallback(async (page = 1, activeFilters = appliedFilters) => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: 12 };
      if (activeFilters.location) params.location = activeFilters.location;
      if (activeFilters.minAge) params.minAge = activeFilters.minAge;
      if (activeFilters.maxAge) params.maxAge = activeFilters.maxAge;
      if (activeFilters.education) params.education = activeFilters.education;
      if (activeFilters.lifestyle) params.lifestyle = activeFilters.lifestyle;

      const res = await matchService.getRecommendations(params);
      if (res.data) {
        setRecommendations(res.data.recommendations || []);
        if (res.data.pagination) setPagination(res.data.pagination);
      }
    } catch (err) {
      setError(err.message || 'Unable to load recommendations. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    fetchRecommendations(1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApplyFilters = () => {
    setAppliedFilters({ ...filters });
    fetchRecommendations(1, filters);
  };

  const handleResetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    fetchRecommendations(1, EMPTY_FILTERS);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchRecommendations(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleViewDetails = async (candidateId) => {
    setDetailsLoading(true);
    try {
      // Fire-and-forget profile_view event for Phase 9 ML (handled by the backend on GET /matches/:id)
      const res = await matchService.getMatchDetails(candidateId);
      if (res.data) setSelectedMatch(res.data);
    } catch (err) {
      alert(err.message || 'Failed to fetch match details');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleConnect = async (candidateId) => {
    setConnectionError(null);
    try {
      await matchService.sendConnectionRequest(candidateId);
      setConnectionSent((prev) => ({ ...prev, [candidateId]: true }));
    } catch (err) {
      setConnectionError(err.message || 'Failed to send connection request. Please try again.');
      setTimeout(() => setConnectionError(null), 5000);
    }
  };

  const handleCloseModal = useCallback(() => setSelectedMatch(null), []);

  const hasActiveFilters = Object.values(appliedFilters).some(Boolean);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 16px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
      `}</style>

      {/* Page header */}
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 id="matches-heading" style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#111827' }}>
            Recommended Matches
          </h1>
          <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 15 }}>
            Ranked by your Phase 7 compatibility score · highest first
            {hasActiveFilters && (
              <span style={{ marginLeft: 8, backgroundColor: '#eef2ff', color: '#4f46e5', padding: '2px 8px', borderRadius: 99, fontSize: 12, fontWeight: 600 }}>
                Filters active
              </span>
            )}
          </p>
        </div>

        <button
          id="toggle-filters-btn"
          onClick={() => setShowFilters((v) => !v)}
          style={{
            padding: '9px 18px',
            borderRadius: 10,
            border: '1.5px solid #d1d5db',
            backgroundColor: showFilters ? '#4f46e5' : '#ffffff',
            color: showFilters ? '#ffffff' : '#374151',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {showFilters ? '✕ Hide Filters' : '⚙ Filters'}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div>
          <FilterPanel
            filters={filters}
            onChange={(key, val) => setFilters((prev) => ({ ...prev, [key]: val }))}
            onReset={handleResetFilters}
          />
          <div style={{ marginBottom: 20, textAlign: 'right' }}>
            <button
              id="apply-filters-btn"
              onClick={handleApplyFilters}
              style={{
                padding: '9px 22px',
                borderRadius: 10,
                border: 'none',
                backgroundColor: '#4f46e5',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* Connection error toast */}
      {connectionError && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 16px', marginBottom: 16, color: '#991b1b', fontSize: 14, fontWeight: 500 }}>
          {connectionError}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div>
          <p style={{ textAlign: 'center', color: '#6b7280', marginBottom: 20, fontSize: 15 }}>
            🔍 Finding your best matches…
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
            {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 16,
            padding: '32px 24px',
            textAlign: 'center',
            color: '#991b1b',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>
            Unable to Load Recommendations
          </h3>
          <p style={{ margin: '0 0 16px', fontSize: 14 }}>{error}</p>
          <button
            onClick={() => fetchRecommendations(pagination.page)}
            style={{
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '9px 20px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && recommendations.length === 0 && (
        <div
          style={{
            backgroundColor: '#f9fafb',
            border: '2px dashed #e5e7eb',
            borderRadius: 20,
            padding: '56px 24px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 52, marginBottom: 16 }}>💫</div>
          <h3 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#111827' }}>
            No Suitable Matches Found
          </h3>
          <p style={{ color: '#6b7280', fontSize: 15, maxWidth: 440, margin: '0 auto 16px' }}>
            {hasActiveFilters
              ? 'No matches meet your current filters. Try broadening them.'
              : 'Complete your profile and preferences to unlock compatibility matches.'}
          </p>
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              style={{ padding: '9px 22px', borderRadius: 10, border: 'none', backgroundColor: '#4f46e5', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Match cards grid */}
      {!loading && !error && recommendations.length > 0 && (
        <>
          <p style={{ margin: '0 0 18px', fontSize: 13, color: '#9ca3af', fontWeight: 500 }}>
            Showing {recommendations.length} of {pagination.total} matches (Page {pagination.page} of {pagination.totalPages})
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
            {recommendations.map((item) => (
              <MatchCard
                key={item.userId}
                item={item}
                onViewDetails={handleViewDetails}
                onConnect={handleConnect}
                connectionSent={connectionSent}
                detailsLoading={detailsLoading}
              />
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 8,
                marginTop: 36,
                flexWrap: 'wrap',
              }}
            >
              <button
                id="pagination-prev"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                style={{
                  padding: '8px 18px',
                  borderRadius: 10,
                  border: '1.5px solid #e5e7eb',
                  backgroundColor: pagination.page <= 1 ? '#f9fafb' : '#ffffff',
                  color: pagination.page <= 1 ? '#d1d5db' : '#374151',
                  fontWeight: 600,
                  cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                }}
              >
                ← Previous
              </button>

              {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                const pg = i + Math.max(1, pagination.page - 2);
                if (pg > pagination.totalPages) return null;
                return (
                  <button
                    key={pg}
                    id={`pagination-page-${pg}`}
                    onClick={() => handlePageChange(pg)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 10,
                      border: '1.5px solid',
                      borderColor: pg === pagination.page ? '#4f46e5' : '#e5e7eb',
                      backgroundColor: pg === pagination.page ? '#4f46e5' : '#ffffff',
                      color: pg === pagination.page ? '#ffffff' : '#374151',
                      fontWeight: pg === pagination.page ? 700 : 500,
                      cursor: 'pointer',
                      fontSize: 14,
                      minWidth: 40,
                    }}
                  >
                    {pg}
                  </button>
                );
              })}

              <button
                id="pagination-next"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                style={{
                  padding: '8px 18px',
                  borderRadius: 10,
                  border: '1.5px solid #e5e7eb',
                  backgroundColor: pagination.page >= pagination.totalPages ? '#f9fafb' : '#ffffff',
                  color: pagination.page >= pagination.totalPages ? '#d1d5db' : '#374151',
                  fontWeight: 600,
                  cursor: pagination.page >= pagination.totalPages ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* Match details modal */}
      {selectedMatch && <MatchDetailsModal match={selectedMatch} onClose={handleCloseModal} />}
    </div>
  );
}
