import useApiHealth from '../../hooks/useApiHealth.js';

const LABELS = {
  loading: 'Checking API…',
  online: 'API online',
  offline: 'API offline',
};

function ApiStatus() {
  const { status, message } = useApiHealth();

  return (
    <p className={`api-status api-status--${status}`} title={message}>
      <span className="dot" aria-hidden="true" />
      {LABELS[status]}
    </p>
  );
}

export default ApiStatus;
