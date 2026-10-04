/**
 * DEVELOPMENT ONLY — reads the latest OTP from the backend's dev outbox
 * (OTP_PROVIDER=dev). Vite removes this from production builds because
 * import.meta.env.DEV is false there.
 */
import { useState } from 'react';
import { devService } from '../../services/devService.js';

function DevOtpHint({ destination }) {
  const [message, setMessage] = useState('');

  if (!import.meta.env.DEV || !destination) return null;

  const show = async () => {
    try {
      const { data } = await devService.latestOtp(destination);
      setMessage(`Dev OTP (${data.purpose}): ${data.code}`);
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <div className="dev-hint">
      <button type="button" className="btn btn--small" onClick={show}>
        Show development OTP
      </button>
      {message && <code>{message}</code>}
    </div>
  );
}

export default DevOtpHint;
