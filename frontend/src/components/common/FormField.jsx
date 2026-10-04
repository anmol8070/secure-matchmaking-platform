/**
 * Labelled input, select or textarea with an accessible error message.
 *   <FormField id="name" label="Name" … />
 *   <FormField as="select" id="gender" label="Gender">…options…</FormField>
 *   <FormField as="textarea" id="bio" label="Bio" rows={5} />
 */
function FormField({ id, label, error, hint, as = 'input', children, ...inputProps }) {
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  const Control = as;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <Control id={id} name={id} aria-invalid={Boolean(error)} aria-describedby={describedBy} {...inputProps}>
        {children}
      </Control>
      {hint && (
        <small id={`${id}-hint`} className="muted">
          {hint}
        </small>
      )}
      {error && (
        <small id={`${id}-error`} className="field-error">
          {error}
        </small>
      )}
    </div>
  );
}

export default FormField;
