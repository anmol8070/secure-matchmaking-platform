/**
 * ML monitoring (Phase 14): only metadata the Phase 9 pipeline actually
 * stored — model versions, sample counts and evaluation metrics — plus
 * aggregate interaction counts. Missing metrics are shown as "not recorded",
 * never invented. Weights and training data are not available here.
 */
import { useEffect, useRef, useState } from 'react';
import Alert from '../../components/common/Alert.jsx';
import { adminService } from '../../services/adminService.js';
import { AsyncState, AdminStatCard, StatusBadge, formatDate, label } from '../../components/admin/AdminParts.jsx';

const metric = (value) => (value === null || value === undefined ? 'Not recorded' : value.toFixed(3));
const METRICS = [
  ['precision', 'Precision'],
  ['recall', 'Recall'],
  ['f1Score', 'F1 score'],
  ['rocAuc', 'ROC-AUC'],
  ['precisionAtK', 'Precision@K'],
  ['acceptanceRate', 'Acceptance rate'],
];

function AdminMLMonitoring() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [training, setTraining] = useState(false);
  const [notice, setNotice] = useState(null);
  const [trainError, setTrainError] = useState(null);
  const inFlight = useRef(false);

  const load = () =>
    adminService
      .getMl()
      .then((res) => {
        setData(res.data);
        setError(null);
      })
      .catch((err) => setError(err.message || 'Unable to load ML status.'));

  useEffect(() => {
    load();
  }, []);

  const train = async () => {
    if (inFlight.current) return;
    if (!window.confirm('Train a new model from the recorded interactions? This is logged in the audit log.')) return;
    inFlight.current = true;
    setTraining(true);
    setNotice(null);
    setTrainError(null);
    try {
      const res = await adminService.trainModel();
      setNotice(`Model ${res.data.modelVersion} trained.`);
      await load();
    } catch (err) {
      setTrainError(err.message || 'Training failed.');
    } finally {
      inFlight.current = false;
      setTraining(false);
    }
  };

  const active = data?.activeModel;

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <h1>ML monitoring</h1>
      </header>
      <AsyncState loading={!data && !error} error={error}>
        {data && (
          <>
            {data.message && <Alert>{data.message}</Alert>}

            {active && (
              <section className="card">
                <h2>
                  Active model <span className="muted">{active.version}</span>
                </h2>
                <p className="muted">
                  {label(active.type)} · trained {formatDate(active.trainedAt)} · features {active.featureVersion}
                </p>
                <div className="admin-stats">
                  <AdminStatCard title="Training samples" value={active.trainingSamples} detail={`${active.positiveSamples} positive · ${active.negativeSamples} negative`} />
                  {METRICS.map(([key, title]) => (
                    <div className="admin-stat" key={key}>
                      <p className="admin-stat__label">{title}</p>
                      <p className="admin-stat__value">{metric(active.metrics[key])}</p>
                    </div>
                  ))}
                </div>
                <p className="muted">{data.baselineNote}</p>
              </section>
            )}

            <section className="card">
              <h2>Recorded interactions</h2>
              <p className="muted">
                {data.interactions.positiveLabels.toLocaleString()} positive and {data.interactions.negativeLabels.toLocaleString()} negative training labels
                available (aggregate counts only).
              </p>
              {Object.keys(data.interactions.byAction).length > 0 && (
                <ul className="admin-history">
                  {Object.entries(data.interactions.byAction).map(([action, n]) => (
                    <li key={action}>
                      {label(action)}: <strong>{n.toLocaleString()}</strong>
                    </li>
                  ))}
                </ul>
              )}
              {notice && <Alert type="success">{notice}</Alert>}
              {trainError && <Alert type="error">{trainError}</Alert>}
              <div className="actions">
                <button type="button" className="btn" onClick={train} disabled={training}>
                  {training ? 'Training…' : 'Train a new model'}
                </button>
              </div>
            </section>

            <section className="card">
              <h2>Model versions</h2>
              {data.models.length === 0 ? (
                <p className="muted">No models have been trained yet.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th scope="col">Version</th>
                        <th scope="col">Status</th>
                        <th scope="col">Trained</th>
                        <th scope="col">Samples</th>
                        <th scope="col">Precision</th>
                        <th scope="col">Recall</th>
                        <th scope="col">F1</th>
                        <th scope="col">ROC-AUC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.models.map((m) => (
                        <tr key={m.version}>
                          <td>{m.version}</td>
                          <td>
                            <StatusBadge status={m.status} />
                          </td>
                          <td>{formatDate(m.trainedAt)}</td>
                          <td className="num">{m.trainingSamples}</td>
                          <td className="num">{metric(m.metrics.precision)}</td>
                          <td className="num">{metric(m.metrics.recall)}</td>
                          <td className="num">{metric(m.metrics.f1Score)}</td>
                          <td className="num">{metric(m.metrics.rocAuc)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </AsyncState>
    </section>
  );
}

export default AdminMLMonitoring;
