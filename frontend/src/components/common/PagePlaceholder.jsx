/**
 * Placeholder card used by Phase 1 pages until their real UI is built.
 */
function PagePlaceholder({ title, description, children }) {
  return (
    <section className="card">
      <h1>{title}</h1>
      {description && <p className="muted">{description}</p>}
      {children}
      <p className="badge">Placeholder — implemented in a later phase</p>
    </section>
  );
}

export default PagePlaceholder;
