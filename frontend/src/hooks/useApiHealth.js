import { useEffect, useState } from 'react';
import { getHealth } from '../services/healthService.js';

/** Checks backend reachability once on mount. */
function useApiHealth() {
  const [state, setState] = useState({ status: 'loading', message: '' });

  useEffect(() => {
    const controller = new AbortController();

    getHealth({ signal: controller.signal })
      .then((data) => setState({ status: 'online', message: data.message }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState({ status: 'offline', message: err.message });
      });

    return () => controller.abort();
  }, []);

  return state;
}

export default useApiHealth;
