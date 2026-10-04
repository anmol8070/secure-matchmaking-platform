import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import FormField from '../../components/common/FormField.jsx';
import Alert from '../../components/common/Alert.jsx';
import DevOtpHint from '../../components/auth/DevOtpHint.jsx';
import useAuth from '../../hooks/useAuth.js';
import { AUTH_STATUS } from '../../context/authReducer.js';
import { authService } from '../../services/authService.js';
import { USER_PATHS } from '../../routes/paths.js';

/**
 * Login step 1: email/mobile + password, or email/mobile + OTP.
 * Success never logs in directly — it leads to live verification.
 */
function Login() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { status, notice, loginWithPassword, loginWithOtp } = useAuth();

  const [mode, setMode] = useState('password');
  const [identifier, setIdentifier] = useState(state?.identifier || '');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(state?.message || '');
  const busy = status === AUTH_STATUS.AUTH_PENDING;

  // Why the previous attempt ended (expired session, failed verification…).
  useEffect(() => {
    if (notice && notice.context === 'user') setInfo(notice.message);
  }, [notice]);

  const goToVerification = () => navigate(USER_PATHS.LOGIN_VERIFICATION);

  const submitPassword = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await loginWithPassword(identifier.trim(), password);
      goToVerification();
    } catch (err) {
      setError(err.message);
    }
  };

  const sendOtp = async () => {
    setError('');
    try {
      const { message } = await authService.sendLoginOtp(identifier.trim());
      setOtpSent(true);
      setInfo(message);
    } catch (err) {
      setError(err.message);
    }
  };

  const submitOtp = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await loginWithOtp(identifier.trim(), otp);
      goToVerification();
    } catch (err) {
      setError(err.message);
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setOtpSent(false);
  };

  return (
    <section className="card card--narrow">
      <h1>Log in</h1>
      <div className="tabs" role="tablist" aria-label="Login method">
        <button type="button" role="tab" aria-selected={mode === 'password'} className="tab" onClick={() => switchMode('password')}>
          Password
        </button>
        <button type="button" role="tab" aria-selected={mode === 'otp'} className="tab" onClick={() => switchMode('otp')}>
          One-time password
        </button>
      </div>

      <Alert>{info}</Alert>
      <Alert type="error">{error}</Alert>

      <form onSubmit={mode === 'password' ? submitPassword : submitOtp} noValidate>
        <FormField
          id="identifier"
          label="Email or mobile number"
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />

        {mode === 'password' ? (
          <FormField
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        ) : (
          otpSent && (
            <FormField
              id="otp"
              label="One-time password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              required
            />
          )
        )}

        {mode === 'otp' && !otpSent ? (
          <button type="button" className="btn btn--primary btn--block" onClick={sendOtp} disabled={!identifier.trim()}>
            Send OTP
          </button>
        ) : (
          <button
            type="submit"
            className="btn btn--primary btn--block"
            disabled={busy || !identifier.trim() || (mode === 'password' ? !password : otp.length < 6)}
          >
            {busy ? 'Checking…' : 'Continue'}
          </button>
        )}
      </form>

      {mode === 'otp' && otpSent && (
        <div className="form-footer">
          <button type="button" className="btn btn--link" onClick={sendOtp}>
            Resend OTP
          </button>
          <DevOtpHint destination={identifier} />
        </div>
      )}

      <p className="muted form-footer">
        After this step you will verify with your camera that a real person is signing in.
      </p>
      <p className="muted form-footer">
        New here? <Link to={USER_PATHS.REGISTER}>Create an account</Link> ·{' '}
        <Link to={USER_PATHS.OTP_VERIFICATION}>Verify your account</Link>
      </p>
    </section>
  );
}

export default Login;
