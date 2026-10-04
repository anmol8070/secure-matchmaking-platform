/**
 * Profile fields form, shared by "Complete profile" and "Edit profile".
 * Client-side validation is for convenience; the server validates again and
 * its field errors are shown next to the matching inputs.
 */
import { useState } from 'react';
import FormField from '../common/FormField.jsx';
import Alert from '../common/Alert.jsx';
import { fieldErrors } from '../../services/apiClient.js';
import {
  BIO_MAX,
  EMPTY_PROFILE,
  GENDER_OPTIONS,
  latestBirthDate,
  toProfileBody,
  validateProfile,
} from '../../utils/profileFields.js';

function ProfileForm({ initialValues = EMPTY_PROFILE, submitLabel, onSubmit, onCancel, children }) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (event) => setValues({ ...values, [event.target.name]: event.target.value });

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    const localErrors = validateProfile(values);
    setErrors(localErrors);
    if (Object.keys(localErrors).length > 0) {
      setMessage('Please fix the highlighted fields.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(toProfileBody(values));
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage(err.message);
      setSubmitting(false);
    }
  };

  const field = (id, label, props = {}) => (
    <FormField id={id} label={label} value={values[id]} onChange={update} error={errors[id]} {...props} />
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="profile-form">
      <Alert type="error">{message}</Alert>

      <fieldset>
        <legend>About you</legend>
        {field('name', 'Full name', { autoComplete: 'name', required: true, maxLength: 100 })}
        <div className="field-row">
          {field('dateOfBirth', 'Date of birth', { type: 'date', required: true, max: latestBirthDate() })}
          <FormField as="select" id="gender" label="Gender" value={values.gender} onChange={update} error={errors.gender}>
            {GENDER_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </FormField>
        </div>
      </fieldset>

      <fieldset>
        <legend>Location</legend>
        <div className="field-row field-row--3">
          {field('city', 'City', { autoComplete: 'address-level2', maxLength: 100 })}
          {field('state', 'State', { autoComplete: 'address-level1', maxLength: 100 })}
          {field('country', 'Country', { autoComplete: 'country-name', maxLength: 100 })}
        </div>
      </fieldset>

      <fieldset>
        <legend>Background and lifestyle</legend>
        <div className="field-row">
          {field('education', 'Education', { maxLength: 150, placeholder: 'e.g. M.Tech' })}
          {field('occupation', 'Occupation', { maxLength: 150, placeholder: 'e.g. Software Developer' })}
        </div>
        {field('lifestyle', 'Lifestyle', { maxLength: 100, placeholder: 'e.g. Active, vegetarian, non-smoker' })}
        <FormField
          as="textarea"
          id="bio"
          label="About me"
          rows={5}
          maxLength={BIO_MAX}
          value={values.bio}
          onChange={update}
          error={errors.bio}
          hint={`${values.bio.length}/${BIO_MAX} characters`}
        />
      </fieldset>

      {children}

      <div className="actions">
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export default ProfileForm;
