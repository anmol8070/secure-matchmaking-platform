import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import FormField from '../../components/common/FormField.jsx';
import Alert from '../../components/common/Alert.jsx';
import { authService } from '../../services/authService.js';
import { fieldErrors } from '../../services/apiClient.js';
import { USER_PATHS } from '../../routes/paths.js';

function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', mobile: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  const onSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    const localErrors = {};
    if (!form.email.trim() && !form.mobile.trim()) localErrors.email = 'Enter an email or a mobile number';
    if (form.password !== form.confirmPassword) localErrors.confirmPassword = 'Passwords do not match';
    setErrors(localErrors);
    if (Object.keys(localErrors).length) return;

    setSubmitting(true);
    try {
      const { data } = await authService.register({
        email: form.email.trim(),
        mobile: form.mobile.trim(),
        password: form.password,
      });
      const contact = data.otp_channel === 'email' ? form.email.trim() : form.mobile.trim();
      navigate(USER_PATHS.OTP_VERIFICATION, {
        state: { contact, destination: data.otp_destination },
      });
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="card card--narrow">
      <h1>Create your account</h1>
      <p className="muted">Enter your email and/or mobile number. We will send a one-time password to verify it.</p>
      <Alert type="error">{message}</Alert>
      <form onSubmit={onSubmit} noValidate>
        <FormField id="email" label="Email" type="email" autoComplete="email" value={form.email} onChange={update} error={errors.email} />
        <FormField
          id="mobile"
          label="Mobile number"
          type="tel"
          autoComplete="tel"
          value={form.mobile}
          onChange={update}
          error={errors.mobile}
          hint="Optional if you entered an email. 10-digit numbers use +91 by default."
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={update}
          error={errors.password}
          hint="At least 8 characters, including a letter and a number."
        />
        <FormField
          id="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={update}
          error={errors.confirmPassword}
        />
        <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="muted form-footer">
        Already registered? <Link to={USER_PATHS.LOGIN}>Log in</Link>
      </p>
    </section>
  );
}

export default Register;
