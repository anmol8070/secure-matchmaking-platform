import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import FormField from '../../components/common/FormField.jsx';
import Alert from '../../components/common/Alert.jsx';
import useAuth from '../../hooks/useAuth.js';
import { AUTH_STATUS } from '../../context/authReducer.js';
import { USER_PATHS } from '../../routes/paths.js';

/** Admin login: same two-step flow (credentials → live verification), admin accounts only. */
function AdminLogin() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { status, notice, loginWithPassword } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const busy = status === AUTH_STATUS.AUTH_PENDING;

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await loginWithPassword(identifier.trim(), password, { admin: true });
      navigate(USER_PATHS.LOGIN_VERIFICATION);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="card card--narrow">
      <h1>Admin login</h1>
      <Alert>{state?.message || (notice?.context === 'admin' ? notice.message : '')}</Alert>
      <Alert type="error">{error}</Alert>
      <form onSubmit={onSubmit} noValidate>
        <FormField id="identifier" label="Email or mobile number" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        <FormField id="password" label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit" className="btn btn--primary btn--block" disabled={busy || !identifier.trim() || !password}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </form>
      <p className="muted form-footer">Admins also complete live camera verification.</p>
    </section>
  );
}

export default AdminLogin;
