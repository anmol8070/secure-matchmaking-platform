/** /preferences/quiz — answer the compatibility questions on their own. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '../../../components/common/Alert.jsx';
import QuizQuestions from '../../../components/preferences/QuizQuestions.jsx';
import { preferenceService } from '../../../services/preferenceService.js';
import { answersToMap, quizErrorsFromServer, toQuizAnswers, validateQuiz } from '../../../utils/preferenceFields.js';
import { USER_PATHS } from '../../../routes/paths.js';

function QuizPage() {
  const [status, setStatus] = useState('loading');
  const [questionnaire, setQuestionnaire] = useState(null);
  const [answers, setAnswers] = useState({});
  const [savedIds, setSavedIds] = useState(new Set());
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const apply = (data) => {
    setQuestionnaire(data.questionnaire);
    setAnswers(answersToMap(data.answers));
    setSavedIds(new Set(data.answers.map((a) => a.questionId)));
  };

  useEffect(() => {
    let cancelled = false;
    preferenceService
      .getQuiz()
      .then(({ data }) => {
        if (cancelled) return;
        apply(data);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setMessage('');
    setError('');
    const localErrors = validateQuiz(questionnaire.questions, answers);
    setErrors(localErrors);
    if (Object.keys(localErrors).length) return;

    const sent = toQuizAnswers(questionnaire.questions, answers, savedIds);
    setSaving(true);
    try {
      const { data } = await preferenceService.saveQuiz(sent);
      apply(data);
      setMessage('Quiz answers saved successfully.');
    } catch (err) {
      setErrors(quizErrorsFromServer(err, sent, 'answers'));
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading') return <p className="muted" role="status">Loading the quiz…</p>;
  if (status === 'error') return <Alert type="error">{error}</Alert>;

  return (
    <form className="card" onSubmit={save} noValidate>
      <h1>Compatibility quiz</h1>
      <p className="muted">
        Your answers help suggest compatible matches later. <Link to={USER_PATHS.PREFERENCES}>Back to preferences</Link>
      </p>
      <Alert>{message}</Alert>
      <Alert type="error">{error}</Alert>
      <QuizQuestions questionnaire={questionnaire} answers={answers} onChange={setAnswers} errors={errors} />
      <div className="actions">
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save answers'}
        </button>
      </div>
    </form>
  );
}

export default QuizPage;
