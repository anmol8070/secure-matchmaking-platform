/** Status message. `error` uses role="alert" so screen readers announce it. */
function Alert({ type = 'info', children }) {
  if (!children) return null;
  return (
    <p className={`alert alert--${type}`} role={type === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

export default Alert;
