/**
 * Loads the signed-in user's profile.
 * status: 'loading' | 'ready' | 'missing' (no profile yet) | 'error'
 */
import { useCallback, useEffect, useState } from 'react';
import { profileService } from '../services/profileService.js';

export default function useOwnProfile() {
  const [state, setState] = useState({ status: 'loading', profile: null, error: null });

  useEffect(() => {
    let cancelled = false;
    profileService
      .get()
      .then(({ data }) => !cancelled && setState({ status: 'ready', profile: data, error: null }))
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 404) setState({ status: 'missing', profile: null, error: null });
        else setState({ status: 'error', profile: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setProfile = useCallback((profile) => setState({ status: 'ready', profile, error: null }), []);

  return { ...state, setProfile };
}
