/**
 * Recommended matches (Phase 8, refined in Phase 15).
 *
 * Everything shown comes from GET /matches and GET /matches/:userId — no
 * score is computed or invented here. Two different numbers exist and are
 * kept apart on screen:
 *  - compatibilityScore (0–100): the Phase 7 rule-based score from both
 *    profiles and preferences, with its breakdown. This is the % on each card.
 *  - recommendationScore: the order of the list. Once a Phase 9 model is
 *    trained, the server blends compatibility with the model's prediction
 *    (mlPrediction ≠ null); before that it equals the compatibility score.
 *
 * ?view=<userId> opens that user's details (used by the Connections pages).
 * Opening details records a profile view on the server (Phase 9 feedback).
 */
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { matchService } from '../../../services/matchService.js';
import ConnectionButton from '../../../components/connections/ConnectionButton.jsx';
import SafetyActions from '../../../components/safety/SafetyActions.jsx';
import Avatar from '../../../components/profile/Avatar.jsx';
import useDialog from '../../../hooks/useDialog.js';
import { useTilt } from '../../../hooks/useMotion.js';
import Icon from '../../../components/common/Icon.jsx';

const PAGE_SIZE = 12;
const EMPTY_FILTERS = { location: '', minAge: '', maxAge: '', education: '', lifestyle: '' };

const BREAKDOWN_LABELS = {
  location: 'Location',
  age: 'Age',
  education: 'Education',
  occupation: 'Occupation',
  lifestyle: 'Lifestyle',
  food: 'Food preference',
  hobbies: 'Shared hobbies',
  quiz: 'Quiz answers',
};

function scoreTone(score) {
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

function scoreLabel(score) {
  if (score >= 85) return 'Excellent match';
  if (score >= 70) return 'Great match';
  if (score >= 55) return 'Good match';
  return 'Possible match';
}

const usesModel = (item) => item?.mlPrediction !== null && item?.mlPrediction !== undefined;

function ScoreRing({ score }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circ;
  return (
    <div className={`score-ring score-ring--${scoreTone(score)}`} role="img" aria-label={`Compatibility ${score}%`}>
      <svg width="68" height="68" viewBox="0 0 68 68" aria-hidden="true">
        <circle cx="34" cy="34" r={r} className="score-ring__track" />
        <circle
          cx="34"
          cy="34"
          r={r}
          className="score-ring__value"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeDashoffset={circ / 4}
        />
      </svg>
      <span aria-hidden="true">{score}%</span>
    </div>
  );
}

function MatchCard({ item, onViewDetails, detailsLoading, featured = false }) {
  const { userId, profile, compatibilityScore, commonHobbies, whyThisMatch } = item;
  const subtitle = [profile.occupation, profile.education].filter(Boolean).join(' · ');
  const tiltRef = useTilt({ max: featured ? 3 : 6 });

  return (
    <article
      ref={tiltRef}
      id={`match-card-${userId}`}
      className={`match-card${featured ? ' match-card--featured' : ''}`}
      aria-labelledby={`match-name-${userId}`}
    >
      <header className="match-card__media">
        <Avatar src={profile.profilePicture} name={profile.name} size="cover" />
        <div className="match-card__score">
          <ScoreRing score={compatibilityScore} />
        </div>
        <div className="match-card__overlay">
          {featured && (
            <p className="match-card__eyebrow">
              <Icon name="sparkles" size={14} /> Top of your list
            </p>
          )}
          <h2 id={`match-name-${userId}`} className="match-card__name">
            {profile.name || 'Member'}
            {profile.age ? <span className="muted">, {profile.age}</span> : null}
          </h2>
          {profile.location && <p className="match-card__meta">{profile.location}</p>}
          {subtitle && <p className="match-card__meta">{subtitle}</p>}
        </div>
      </header>

      <p className={`match-card__label match-card__label--${scoreTone(compatibilityScore)}`}>
        <strong>{scoreLabel(compatibilityScore)}</strong>
        <span>Compatibility score</span>
      </p>

      <div className="match-card__body">
        {commonHobbies?.length > 0 && (
          <div>
            <h3 className="match-card__section">Common interests</h3>
            <ul className="chips" aria-label="Common interests">
              {commonHobbies.map((h) => (
                <li key={h} className="chip">
                  {h}
                </li>
              ))}
            </ul>
          </div>
        )}

        {whyThisMatch?.length > 0 && (
          <div>
            <h3 className="match-card__section">Why this match?</h3>
            <ul className="match-reasons">
              {whyThisMatch.slice(0, 4).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        {profile.bio && <p className="match-card__bio">&ldquo;{profile.bio}&rdquo;</p>}
      </div>

      <footer className="match-card__actions">
        <button
          type="button"
          id={`view-match-${userId}`}
          className="btn"
          onClick={() => onViewDetails(userId)}
          aria-busy={detailsLoading || undefined}
          aria-label={`View match details for ${profile.name || 'this member'}`}
        >
          View match
        </button>
        <div id={`connect-${userId}`}>
          <ConnectionButton userId={userId} />
        </div>
      </footer>
    </article>
  );
}

function BreakdownBar({ label, contribution, weight }) {
  const pct = weight > 0 ? Math.round((contribution / weight) * 100) : 0;
  return (
    <li className="breakdown">
      <div className="breakdown__label">
        <span>{label}</span>
        <span className="muted">
          {contribution} / {weight} pts
        </span>
      </div>
      <div className="breakdown__track" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

function MatchDetailsModal({ match, onClose, onBlocked }) {
  const dialogRef = useDialog(onClose);
  const breakdown = Object.entries(match.scoreBreakdown || {}).filter(
    ([, v]) => typeof v === 'object' && v !== null && v.contribution !== undefined
  );
  const profile = match.profile || {};
  const facts = [
    ['Location', profile.location],
    ['Education', profile.education],
    ['Occupation', profile.occupation],
    ['Lifestyle', profile.lifestyle],
  ].filter(([, v]) => v);

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="dialog dialog--wide card match-details"
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-modal-title"
        tabIndex={-1}
      >
        <header className="match-details__header">
          <Avatar src={profile.profilePicture} name={profile.name} size="small" />
          <div className="match-details__who">
            <h2 id="match-modal-title">
              {profile.name || 'Member'}
              {profile.age ? `, ${profile.age}` : ''}
            </h2>
            <p className="muted">
              {scoreLabel(match.compatibilityScore)} · {match.compatibilityScore}% compatibility
            </p>
          </div>
          <button type="button" className="btn btn--small" onClick={onClose} aria-label="Close match details">
            Close
          </button>
        </header>

        {facts.length > 0 && (
          <dl className="details">
            {facts.map(([k, v]) => (
              <Fragment key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </Fragment>
            ))}
          </dl>
        )}
        {profile.bio && <p className="match-card__bio">&ldquo;{profile.bio}&rdquo;</p>}

        <div className="match-details__actions">
          <ConnectionButton userId={match.userId} />
          <SafetyActions user={{ userId: match.userId, name: profile.name || 'this user' }} onBlocked={onBlocked} />
        </div>

        {breakdown.length > 0 && (
          <section aria-labelledby="breakdown-title">
            <h3 id="breakdown-title">How the compatibility score is made</h3>
            <ul className="breakdown-list">
              {breakdown.map(([key, val]) => (
                <BreakdownBar key={key} label={BREAKDOWN_LABELS[key] || key} contribution={val.contribution} weight={val.weight} />
              ))}
            </ul>
          </section>
        )}

        {match.commonHobbies?.length > 0 && (
          <section aria-labelledby="hobbies-title">
            <h3 id="hobbies-title">Common interests ({match.commonHobbies.length})</h3>
            <ul className="chips">
              {match.commonHobbies.map((h) => (
                <li key={h} className="chip">
                  {h}
                </li>
              ))}
            </ul>
          </section>
        )}

        {match.whyThisMatch?.length > 0 && (
          <section aria-labelledby="why-title">
            <h3 id="why-title">Why you match</h3>
            <ul className="match-reasons">
              {match.whyThisMatch.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="ranking-title" className="match-details__ranking">
          <h3 id="ranking-title">Where this match sits in your list</h3>
          {usesModel(match) ? (
            <p className="muted">
              Ranking score {Math.round(match.recommendationScore)} / 100. It combines the {match.compatibilityScore}%
              compatibility score with a recommendation model trained on how members respond to suggestions (its
              estimate of a positive response: {Math.round(match.mlPrediction * 100)}%). The model affects the order
              only — it does not change the compatibility score.
            </p>
          ) : (
            <p className="muted">Ranked by the compatibility score. No recommendation model is in use yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function FilterPanel({ filters, onChange, onApply, onReset }) {
  const field = (key, label, props = {}) => (
    <div className="field">
      <label htmlFor={`match-filter-${key}`}>{label}</label>
      <input id={`match-filter-${key}`} value={filters[key]} onChange={(e) => onChange(key, e.target.value)} {...props} />
    </div>
  );
  return (
    <form
      className="card match-filters"
      aria-label="Filter matches"
      onSubmit={(e) => {
        e.preventDefault();
        onApply();
      }}
    >
      {field('location', 'Location', { placeholder: 'City or country', maxLength: 100 })}
      {field('minAge', 'Min age', { type: 'number', min: 18, max: 120, inputMode: 'numeric', placeholder: '18' })}
      {field('maxAge', 'Max age', { type: 'number', min: 18, max: 120, inputMode: 'numeric', placeholder: '60' })}
      {field('education', 'Education', { placeholder: 'e.g. Bachelor', maxLength: 150 })}
      {field('lifestyle', 'Lifestyle', { placeholder: 'e.g. Active', maxLength: 100 })}
      <div className="match-filters__actions">
        <button type="submit" id="apply-filters-btn" className="btn btn--primary">
          Apply filters
        </button>
        <button type="button" className="btn" onClick={onReset}>
          Reset
        </button>
      </div>
    </form>
  );
}

function SkeletonCard() {
  return (
    <div className="match-card match-card--skeleton" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function filterError(f) {
  const min = f.minAge === '' ? null : Number(f.minAge);
  const max = f.maxAge === '' ? null : Number(f.maxAge);
  for (const v of [min, max]) {
    if (v !== null && (!Number.isInteger(v) || v < 18 || v > 120)) return 'Ages must be whole numbers from 18 to 120.';
  }
  if (min !== null && max !== null && min > max) return 'Min age cannot be greater than max age.';
  return null;
}

export default function RecommendedMatches() {
  const [recommendations, setRecommendations] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedMatch, setSelectedMatch] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const viewUserId = searchParams.get('view');

  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [filterMessage, setFilterMessage] = useState(null);

  const fetchRecommendations = useCallback(
    async (page = 1, activeFilters = appliedFilters) => {
      setLoading(true);
      setError(null);
      try {
        const res = await matchService.getRecommendations({ page, limit: PAGE_SIZE, ...activeFilters });
        setRecommendations(res.data?.recommendations || []);
        if (res.data?.pagination) setPagination(res.data.pagination);
      } catch (err) {
        setError(err.message || 'Unable to load recommendations. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [appliedFilters]
  );

  useEffect(() => {
    fetchRecommendations(1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApplyFilters = () => {
    const problem = filterError(filters);
    setFilterMessage(problem);
    if (problem) return;
    const trimmed = Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, String(v).trim()]));
    setAppliedFilters(trimmed);
    fetchRecommendations(1, trimmed);
  };

  const handleResetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setFilterMessage(null);
    fetchRecommendations(1, EMPTY_FILTERS);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages && newPage !== pagination.page) {
      fetchRecommendations(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Not a disabled button: disabling the focused button would drop keyboard
  // focus, and the dialog could not give it back on close.
  const detailsInFlight = useRef(false);
  const handleViewDetails = async (candidateId) => {
    if (detailsInFlight.current) return;
    detailsInFlight.current = true;
    setDetailsLoading(true);
    setDetailsError(null);
    try {
      const res = await matchService.getMatchDetails(candidateId);
      if (res.data) setSelectedMatch(res.data);
    } catch (err) {
      setDetailsError(
        err.status === 403 || err.status === 404
          ? 'This profile is not available.'
          : err.message || 'Unable to load match details. Please try again.'
      );
    } finally {
      detailsInFlight.current = false;
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    if (viewUserId) handleViewDetails(viewUserId);
  }, [viewUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCloseModal = useCallback(() => {
    setSelectedMatch(null);
    if (searchParams.has('view')) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const hasActiveFilters = Object.values(appliedFilters).some(Boolean);
  const rankedByModel = recommendations.some(usesModel);
  const firstPage = Math.max(1, Math.min(pagination.page - 2, pagination.totalPages - 4));
  const pages = Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => firstPage + i);

  return (
    <div className="matches">
      <header className="matches__header">
        <div>
          <p className="eyebrow">Discover</p>
          <h1 id="matches-heading">Recommended matches</h1>
          <p className="muted" id="matches-ranking-note">
            {rankedByModel
              ? 'Ordered by a personalised ranking that combines compatibility with a recommendation model. The % on each card is the compatibility score.'
              : 'Ordered by compatibility score, highest first.'}
            {hasActiveFilters && <span className="status-pill">Filters active</span>}
          </p>
        </div>
        <button
          type="button"
          id="toggle-filters-btn"
          className={`btn${showFilters ? ' btn--primary' : ''}`}
          aria-expanded={showFilters}
          aria-controls="match-filters"
          onClick={() => setShowFilters((v) => !v)}
        >
          <Icon name="filter" size={18} />
          {showFilters ? 'Hide filters' : 'Filters'}
        </button>
      </header>

      {showFilters && (
        <div id="match-filters">
          <FilterPanel
            filters={filters}
            onChange={(key, val) => setFilters((prev) => ({ ...prev, [key]: val }))}
            onApply={handleApplyFilters}
            onReset={handleResetFilters}
          />
          {filterMessage && (
            <p className="alert alert--error" role="alert">
              {filterMessage}
            </p>
          )}
        </div>
      )}

      {detailsError && (
        <p className="alert alert--error" role="alert">
          {detailsError}
        </p>
      )}

      {loading && (
        <div role="status" aria-live="polite">
          <p className="muted">Finding your best matches…</p>
          <div className="match-grid">
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      )}

      {!loading && error && (
        <section className="card empty-state" role="alert">
          <h2>Unable to load recommendations</h2>
          <p className="muted">{error}</p>
          <button type="button" className="btn btn--primary" onClick={() => fetchRecommendations(pagination.page)}>
            Try again
          </button>
        </section>
      )}

      {!loading && !error && recommendations.length === 0 && (
        <section className="card empty-state">
          <h2>No suitable matches found</h2>
          <p className="muted">
            {hasActiveFilters
              ? 'No matches meet your current filters. Try broadening them.'
              : 'Complete your profile and preferences to unlock compatibility matches.'}
          </p>
          {hasActiveFilters && (
            <button type="button" className="btn btn--primary" onClick={handleResetFilters}>
              Clear filters
            </button>
          )}
        </section>
      )}

      {!loading && !error && recommendations.length > 0 && (
        <>
          <p className="muted" aria-live="polite">
            Showing {recommendations.length} of {pagination.total} matches (page {pagination.page} of{' '}
            {pagination.totalPages})
          </p>

          <div className="match-grid">
            {recommendations.map((item, index) => (
              <MatchCard
                key={item.userId}
                item={item}
                onViewDetails={handleViewDetails}
                detailsLoading={detailsLoading}
                featured={index === 0 && pagination.page === 1}
              />
            ))}
          </div>

          {pagination.totalPages > 1 && (
            <nav className="pagination" aria-label="Match pages">
              <button
                type="button"
                id="pagination-prev"
                className="btn"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
              >
                Previous
              </button>
              {pages.map((pg) => (
                <button
                  type="button"
                  key={pg}
                  id={`pagination-page-${pg}`}
                  className={`btn${pg === pagination.page ? ' btn--primary' : ''}`}
                  aria-current={pg === pagination.page ? 'page' : undefined}
                  aria-label={`Page ${pg}`}
                  onClick={() => handlePageChange(pg)}
                >
                  {pg}
                </button>
              ))}
              <button
                type="button"
                id="pagination-next"
                className="btn"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}

      {selectedMatch && (
        <MatchDetailsModal
          match={selectedMatch}
          onClose={handleCloseModal}
          onBlocked={() => setRecommendations((list) => list.filter((r) => r.userId !== selectedMatch.userId))}
        />
      )}
    </div>
  );
}
