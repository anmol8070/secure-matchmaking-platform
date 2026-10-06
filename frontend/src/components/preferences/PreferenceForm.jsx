/**
 * Matching preference fields (controlled). Option lists come from the API.
 * These are what the user looks for in a partner — their own details live in
 * the profile, not here.
 */
import FormField from '../common/FormField.jsx';
import { TEXT_FIELDS } from '../../utils/preferenceFields.js';

function PreferenceForm({ values, errors = {}, options, onChange }) {
  const set = (key) => (event) => onChange({ ...values, [key]: event.target.value });

  const toggleGender = (value) => {
    const current = values.preferredGenders;
    onChange({
      ...values,
      preferredGenders: current.includes(value) ? current.filter((g) => g !== value) : [...current, value],
    });
  };

  const maxLengths = options?.maxLengths || {};
  const age = options?.partnerAge || { min: 18, max: 100 };

  return (
    <div className="preference-form">
      <div className="field-row">
        {TEXT_FIELDS.map(([key, label, placeholder]) => (
          <FormField
            key={key}
            id={key}
            label={label}
            value={values[key]}
            onChange={set(key)}
            error={errors[key]}
            placeholder={placeholder}
            maxLength={maxLengths[key]}
          />
        ))}
      </div>

      <div className="field-row">
        <FormField as="select" id="preferredFood" label="Food preference" value={values.preferredFood} onChange={set('preferredFood')} error={errors.preferredFood}>
          <option value="">Not specified</option>
          {(options?.foodPreferences || []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </FormField>
        <FormField
          id="partnerMinAge"
          label="Partner age from"
          type="number"
          inputMode="numeric"
          min={age.min}
          max={age.max}
          value={values.partnerMinAge}
          onChange={set('partnerMinAge')}
          error={errors.partnerMinAge}
        />
        <FormField
          id="partnerMaxAge"
          label="Partner age to"
          type="number"
          inputMode="numeric"
          min={age.min}
          max={age.max}
          value={values.partnerMaxAge}
          onChange={set('partnerMaxAge')}
          error={errors.partnerMaxAge}
        />
      </div>

      <fieldset className="choice-group">
        <legend>Interested in</legend>
        <div className="choice-list">
          {(options?.partnerGenders || []).map((o) => (
            <label key={o.value} className="choice">
              <input type="checkbox" checked={values.preferredGenders.includes(o.value)} onChange={() => toggleGender(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
        {errors.preferredGenders && <small className="field-error">{errors.preferredGenders}</small>}
      </fieldset>
    </div>
  );
}

export default PreferenceForm;
