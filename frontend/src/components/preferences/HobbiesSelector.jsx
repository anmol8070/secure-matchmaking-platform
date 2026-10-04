/**
 * Multi-select of hobbies. The list comes from the backend (GET /hobbies);
 * only ids are sent back. Selected hobbies are shown as removable chips.
 */
function HobbiesSelector({ hobbies, selectedIds, onChange, max = 20, error }) {
  const selected = new Set(selectedIds);
  const atLimit = selected.size >= max;

  const toggle = (id) => {
    if (selected.has(id)) onChange(selectedIds.filter((x) => x !== id));
    else if (!atLimit) onChange([...selectedIds, id]);
  };

  const selectedHobbies = hobbies.filter((h) => selected.has(h.id));

  return (
    <div className="hobbies-selector">
      <p className="muted">
        {selected.size} selected{max ? ` (up to ${max})` : ''}
      </p>

      {selectedHobbies.length > 0 && (
        <ul className="chips" aria-label="Selected hobbies">
          {selectedHobbies.map((h) => (
            <li key={h.id} className="chip">
              {h.name}
              <button type="button" className="chip__remove" aria-label={`Remove ${h.name}`} onClick={() => toggle(h.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="choice-list choice-list--grid" role="group" aria-label="Available hobbies">
        {hobbies.map((h) => (
          <label key={h.id} className="choice">
            <input type="checkbox" checked={selected.has(h.id)} disabled={!selected.has(h.id) && atLimit} onChange={() => toggle(h.id)} />
            {h.name}
          </label>
        ))}
      </div>
      {hobbies.length === 0 && <p className="muted">No hobbies are available yet.</p>}
      {error && <small className="field-error">{error}</small>}
    </div>
  );
}

export default HobbiesSelector;
