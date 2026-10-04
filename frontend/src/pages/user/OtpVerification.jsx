import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import FormField from '../../components/common/FormField.jsx';
import Alert from '../../components/common/Alert.jsx';
import DevOtpHint from '../../components/auth/DevOtpHint.jsx';
import { authService } from '../../services/authService.js';
import { USER_PATHS } from '../../routes/paths.js';

const RESEND_SECONDS = 60;

/** Account verification after registration (email or mobile OTP). */
function OtpVerification() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [contact, setContact] = useState(state?.contact || '');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState(state?.destination ? `We sent a code to ${state.destination}.` : '');
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(state?.contact ? RESEND_SECONDS : 0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await authService.verifyOtp(contact, otp.trim());
      navigate(USER_PATHS.LOGIN, {
        replace: true,
        state: { message: 'Your account is verified. Please log in.', identifier: contact },
      });
    } catch (err) {
      setError(err.status === 422 ? 'Enter the 6-digit code and your email or mobile number.' : err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    setError('');
    try {
      const { message } = await authService.sendOtp(contact);
      setInfo(message);
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="card card--narrow">
      <h1>Verify your account</h1>
      <p className="muted">Enter the one-time password we sent you. It expires in a few minutes.</p>
      <Alert>{info}</Alert>
      <Alert type="error">{error}</Alert>
      <form onSubmit={onSubmit} noValidate>
        <FormField
          id="contact"
          label="Email or mobile number"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          autoComplete="username"
          required
        />
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
        <button type="submit" className="btn btn--primary btn--block" disabled={submitting || !contact || otp.length < 6}>
          {submitting ? 'Verifying…' : 'Verify'}
        </button>
      </form>
      <div className="form-footer">
        <button type="button" className="btn btn--link" onClick={resend} disabled={!contact || cooldown > 0}>
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
        <DevOtpHint destination={contact} />
      </div>
      <p className="muted form-footer">
        Already verified? <Link to={USER_PATHS.LOGIN}>Log in</Link>
      </p>
    </section>
  );
}

export default OtpVerification;
