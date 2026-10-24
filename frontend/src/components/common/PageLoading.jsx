/** Placeholder while a lazily loaded page (or the session) is loading. */
function PageLoading({ label = 'Loading…' }) {
  return (
    <p className="muted page-loading" role="status">
      {label}
    </p>
  );
}

export default PageLoading;
