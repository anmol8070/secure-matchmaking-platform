/**
 * Privacy settings (Phase 13) — /privacy. Who can see each part of the
 * profile. The choices only describe what the server enforces; nothing is
 * hidden "just in the browser".
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '../../components/common/Alert.jsx';
import { privacyService } from '../../services/privacyService.js';
import { USER_PATHS } from '../../routes/paths.js';

const LEVEL_LABELS = {
  everyone: 'All members',
  connections: 'My connections only',
  nobody: 'Only me',
};

const FIELDS = [
  ['profileVisibility', 'Profile', 'Who can find your profile in matches and see its details. With "My connections only", others see just your name (and photo, if allowed).'],
  ['photoVisibility', 'Profile picture'],
  ['ageVisibility', 'Age'],
  ['locationVisibility', 'Location'],
  ['educationVisibility', 'Education'],
  ['occupationVisibility', 'Occupation'],
  ['lifestyleVisibility', 'Lifestyle'],
  ['bioVisibility', 'About me'],
  ['hobbiesVisibility', 'Hobbies'],
  ['onlineStatusVisibility', 'Online status', 'Whether others can see when you are online in chat and calls.'],
];

function PrivacySettings() {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [options, setOptions] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    privacyService
      .getSettings()
      .then((res) => {
        setSaved(res.data.settings);
        setForm(res.data.settings);
        setOptions(res.data.options);
      })
      .catch((err) => setError(err.message || 'Unable to load your privacy settings.'))
      .finally(() => setLoading(false));
  }, []);

  const changes = form && saved ? Object.fromEntries(Object.entries(form).filter(([key, value]) => saved[key] !== value)) : {};
  const dirty = Object.keys(changes).length > 0;

  const save = async (event) => {
    event.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await privacyService.updateSettings(changes);
      setSaved(res.data.settings);
      setForm(res.data.settings);
      setNotice('Privacy settings saved.');
    } catch (err) {
      setError(err.message || 'Unable to save your privacy settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card">
      <h1>Privacy settings</h1>
      <p className="muted">
        Choose who can see each part of your profile. Your email, phone number and date of birth are never shown to anyone. Manage{' '}
        <Link to={USER_PATHS.BLOCKED_USERS}>blocked users</Link>.
      </p>

      <Alert type="success">{notice}</Alert>
      <Alert type="error">{error}</Alert>

      {loading && <p className="muted">Loading…</p>}
      {form && (
        <form className="stack privacy-form" onSubmit={save}>
          {FIELDS.map(([key, label, help]) => (
            <div className="field privacy-field" key={key}>
              <label htmlFor={`privacy-${key}`}>{label}</label>
              <select
                id={`privacy-${key}`}
                value={form[key]}
                onChange={(e) => {
                  setNotice(null);
                  setForm((current) => ({ ...current, [key]: e.target.value }));
                }}
              >
                {(options[key] || ['everyone', 'connections', 'nobody']).map((level) => (
                  <option key={level} value={level}>
                    {LEVEL_LABELS[level]}
                  </option>
                ))}
              </select>
              {help && <small className="muted">{help}</small>}
            </div>
          ))}
          <div className="actions">
            <button type="submit" className="btn btn--primary" disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" className="btn" disabled={!dirty || saving} onClick={() => setForm(saved)}>
              Discard
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export default PrivacySettings;
