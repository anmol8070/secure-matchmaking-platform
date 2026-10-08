import { useEffect, useState } from 'react';
import { matchService } from '../../../services/matchService.js';

export default function RecommendedMatches() {
  const [recommendations, setRecommendations] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedMatch, setSelectedMatch] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [connectionSent, setConnectionSent] = useState({});

  const fetchRecommendations = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await matchService.getRecommendations({ page, limit: 12 });
      if (res.data) {
        setRecommendations(res.data.recommendations || []);
        if (res.data.pagination) {
          setPagination(res.data.pagination);
        }
      }
    } catch (err) {
      setError(err.message || 'Unable to load recommendations. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations(1);
  }, []);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchRecommendations(newPage);
    }
  };

  const handleViewDetails = async (candidateId) => {
    setDetailsLoading(true);
    try {
      // Record profile view interaction for Phase 9 ML feature logging
      await matchService.recordFeedback({ targetUserId: candidateId, action: 'profile_view' }).catch(() => {});

      const res = await matchService.getMatchDetails(candidateId);
      if (res.data) {
        setSelectedMatch(res.data);
      }
    } catch (err) {
      alert(err.message || 'Failed to fetch match details');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleConnect = async (candidateId) => {
    try {
      await matchService.sendConnectionRequest(candidateId);
      setConnectionSent((prev) => ({ ...prev, [candidateId]: true }));
    } catch (err) {
      alert(err.message || 'Failed to send connection request');
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      <header style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#111827', margin: '0 0 8px 0' }}>
          Recommended Matches
        </h1>
        <p style={{ color: '#4b5563', fontSize: '15px', margin: 0 }}>
          Personalized candidate recommendations ranked deterministically by your Phase 7 compatibility score.
        </p>
      </header>

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '64px 16px' }}>
          <div
            style={{
              display: 'inline-block',
              width: '40px',
              height: '40px',
              border: '4px solid #e5e7eb',
              borderTopColor: '#4f46e5',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <p style={{ marginTop: '16px', color: '#4b5563', fontSize: '16px' }}>Finding your best matches...</p>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            padding: '24px',
            textAlign: 'center',
            color: '#991b1b',
          }}
        >
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>Unable to load recommendations</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '14px' }}>{error}</p>
          <button
            onClick={() => fetchRecommendations(pagination.page)}
            style={{
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              cursor: 'pointer',
              fontWeight: '600',
            }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && recommendations.length === 0 && (
        <div
          style={{
            backgroundColor: '#f9fafb',
            border: '1px dashed #d1d5db',
            borderRadius: '16px',
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
          <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', margin: '0 0 8px 0' }}>
            No suitable matches found
          </h3>
          <p style={{ color: '#6b7280', fontSize: '15px', maxWidth: '480px', margin: '0 auto' }}>
            Try broadening your location or partner preferences to unlock more compatibility matches!
          </p>
        </div>
      )}

      {/* Recommendations Cards Grid */}
      {!loading && !error && recommendations.length > 0 && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '24px',
            }}
          >
            {recommendations.map((item) => {
              const { userId, profile, compatibilityScore, commonHobbies, whyThisMatch } = item;
              const isConnected = connectionSent[userId];

              return (
                <div
                  key={userId}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '16px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                    border: '1px solid #e5e7eb',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                  }}
                >
                  {/* Card Header & Avatar */}
                  <div style={{ padding: '20px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                    <div
                      style={{
                        width: '72px',
                        height: '72px',
                        borderRadius: '50%',
                        backgroundColor: '#e0e7ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '28px',
                        color: '#4338ca',
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      {profile.profilePicture ? (
                        <img
                          src={profile.profilePicture}
                          alt={profile.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        profile.name ? profile.name[0].toUpperCase() : 'U'
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <h3
                          style={{
                            fontSize: '18px',
                            fontWeight: '700',
                            color: '#111827',
                            margin: 0,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {profile.name || 'Anonymous User'}
                          {profile.age ? `, ${profile.age}` : ''}
                        </h3>
                      </div>

                      {profile.location && (
                        <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '13px' }}>
                          📍 {profile.location}
                        </p>
                      )}

                      {(profile.occupation || profile.education) && (
                        <p style={{ margin: '2px 0 0 0', color: '#4b5563', fontSize: '13px' }}>
                          💼 {[profile.occupation, profile.education].filter(Boolean).join(' • ')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Compatibility Badge */}
                  <div
                    style={{
                      backgroundColor: '#e0e7ff',
                      padding: '10px 20px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#3730a3' }}>
                      Compatibility Score
                    </span>
                    <span
                      style={{
                        backgroundColor: '#4f46e5',
                        color: '#ffffff',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '14px',
                        fontWeight: '700',
                      }}
                    >
                      {compatibilityScore}%
                    </span>
                  </div>

                  {/* Card Content Body */}
                  <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Common Hobbies */}
                    {commonHobbies && commonHobbies.length > 0 && (
                      <div>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: '700',
                            textTransform: 'uppercase',
                            color: '#6b7280',
                            letterSpacing: '0.05em',
                          }}
                        >
                          Common Interests
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                          {commonHobbies.map((hobby, idx) => (
                            <span
                              key={idx}
                              style={{
                                backgroundColor: '#f3f4f6',
                                color: '#374151',
                                padding: '3px 10px',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: '500',
                              }}
                            >
                              • {hobby}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Why This Match? */}
                    {whyThisMatch && whyThisMatch.length > 0 && (
                      <div>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: '700',
                            textTransform: 'uppercase',
                            color: '#6b7280',
                            letterSpacing: '0.05em',
                          }}
                        >
                          Why This Match?
                        </span>
                        <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px', fontSize: '13px', color: '#374151' }}>
                          {whyThisMatch.map((reason, idx) => (
                            <li key={idx} style={{ marginBottom: '3px' }}>
                              {reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div
                    style={{
                      padding: '16px 20px',
                      borderTop: '1px solid #f3f4f6',
                      display: 'flex',
                      gap: '12px',
                    }}
                  >
                    <button
                      onClick={() => handleViewDetails(userId)}
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid #d1d5db',
                        backgroundColor: '#ffffff',
                        color: '#374151',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                      }}
                    >
                      View Match
                    </button>

                    <button
                      onClick={() => handleConnect(userId)}
                      disabled={isConnected}
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: isConnected ? '#059669' : '#4f46e5',
                        color: '#ffffff',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: isConnected ? 'default' : 'pointer',
                      }}
                    >
                      {isConnected ? 'Request Sent ✓' : 'Connect'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '16px',
                marginTop: '32px',
              }}
            >
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: pagination.page <= 1 ? '#f3f4f6' : '#ffffff',
                  color: pagination.page <= 1 ? '#9ca3af' : '#374151',
                  cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                Previous
              </button>

              <span style={{ fontSize: '14px', color: '#4b5563' }}>
                Page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong>
              </span>

              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: pagination.page >= pagination.totalPages ? '#f3f4f6' : '#ffffff',
                  color: pagination.page >= pagination.totalPages ? '#9ca3af' : '#374151',
                  cursor: pagination.page >= pagination.totalPages ? 'not-allowed' : 'pointer',
                }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Match Details Modal */}
      {selectedMatch && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              maxWidth: '560px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#111827' }}>
                  {selectedMatch.profile?.name || 'User Profile'}
                  {selectedMatch.profile?.age ? `, ${selectedMatch.profile.age}` : ''}
                </h2>
                <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
                  {selectedMatch.profile?.location}
                </p>
              </div>

              <button
                onClick={() => setSelectedMatch(null)}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: '24px',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  padding: '0 4px',
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                marginTop: '16px',
                backgroundColor: '#4f46e5',
                color: '#ffffff',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '16px', fontWeight: '600' }}>Overall Compatibility Score</span>
              <span style={{ fontSize: '24px', fontWeight: '800' }}>{selectedMatch.compatibilityScore}%</span>
            </div>

            {/* Score Breakdown Bars */}
            <div style={{ marginTop: '24px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#111827' }}>Score Breakdown</h4>

              {Object.entries(selectedMatch.scoreBreakdown || {}).map(([key, val]) => {
                if (typeof val !== 'object' || val === null || val.contribution === undefined) return null;
                const percent = Math.round((val.contribution / val.weight) * 100);

                return (
                  <div key={key} style={{ marginBottom: '12px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '13px',
                        marginBottom: '4px',
                        color: '#374151',
                      }}
                    >
                      <span style={{ textTransform: 'capitalize', fontWeight: '500' }}>{key}</span>
                      <span>
                        {val.contribution} / {val.weight} pts ({percent}%)
                      </span>
                    </div>
                    <div style={{ height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${percent}%`,
                          backgroundColor: '#4f46e5',
                          borderRadius: '4px',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Why This Match? in Modal */}
            {selectedMatch.whyThisMatch && selectedMatch.whyThisMatch.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#111827' }}>Why You Match</h4>
                <ul style={{ margin: 0, paddingLeft: '20px', color: '#374151', fontSize: '14px' }}>
                  {selectedMatch.whyThisMatch.map((reason, idx) => (
                    <li key={idx} style={{ marginBottom: '4px' }}>
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ marginTop: '24px', textAlign: 'right' }}>
              <button
                onClick={() => setSelectedMatch(null)}
                style={{
                  padding: '8px 20px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  cursor: 'pointer',
                  fontWeight: '600',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
