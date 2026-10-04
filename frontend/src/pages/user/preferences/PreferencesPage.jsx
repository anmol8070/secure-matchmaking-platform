/**
 * /preferences — matching preferences, hobbies and quiz answers on one page.
 * "Save preferences" sends all three in one request; the backend saves them
 * in a single transaction (all or nothing).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '../../../components/common/Alert.jsx';
import PreferenceForm from '../../../components/preferences/PreferenceForm.jsx';
import HobbiesSelector from '../../../components/preferences/HobbiesSelector.jsx';
import QuizQuestions from '../../../components/preferences/QuizQuestions.jsx';
import { fieldErrors } from '../../../services/apiClient.js';
import { hobbyService, preferenceService } from '../../../services/preferenceService.js';
import {
  EMPTY_PREFERENCES,
  answersToMap,
  quizErrorsFromServer,
  toPreferenceBody,
  toPreferenceValues,
  toQuizAnswers,
  validatePreferences,
  validateQuiz,
} from '../../../utils/preferenceFields.js';
import { USER_PATHS } from '../../../routes/paths.js';

function PreferencesPage() {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [loadError, setLoadError] = useState('');
  const [options, setOptions] = useState(null);
  const [hobbies, setHobbies] = useState([]);
  const [questionnaire, setQuestionnaire] = useState(null);

  const [exists, setExists] = useState(false);
  const [values, setValues] = useState(EMPTY_PREFERENCES);
  const [hobbyIds, setHobbyIds] = useState([]);
  const [answers, setAnswers] = useState({});
  const [savedQuestionIds, setSavedQuestionIds] = useState(new Set());

  const [errors, setErrors] = useState({});
  const [hobbyError, setHobbyError] = useState('');
  const [quizErrors, setQuizErrors] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const applySaved = (data) => {
    setExists(data.isSet);
    setValues(toPreferenceValues(data));
    setHobbyIds(data.hobbies.map((h) => h.id));
    setAnswers(answersToMap(data.quizAnswers));
    setSavedQuestionIds(new Set(data.quizAnswers.map((a) => a.questionId)));
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([preferenceService.get(), preferenceService.options(), hobbyService.list(), preferenceService.getQuiz()])
      .then(([prefs, opts, hobbyList, quiz]) => {
        if (cancelled) return;
        applySaved(prefs.data);
        setOptions(opts.data);
        setHobbies(hobbyList.data);
        setQuestionnaire(quiz.data.questionnaire);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err.message);
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
    setHobbyError('');

    const localErrors = validatePreferences(values, options);
    const localQuizErrors = validateQuiz(questionnaire.questions, answers);
    setErrors(localErrors);
    setQuizErrors(localQuizErrors);
    if (Object.keys(localErrors).length || Object.keys(localQuizErrors).length) {
      setError('Please fix the highlighted fields.');
      return;
    }

    const quizAnswers = toQuizAnswers(questionnaire.questions, answers, savedQuestionIds);
    setSaving(true);
    try {
      const { data } = await preferenceService.save({ ...toPreferenceBody(values), hobbyIds, quizAnswers }, { exists });
      applySaved(data);
      setMessage('Preferences saved successfully.');
    } catch (err) {
      setErrors(fieldErrors(err));
      setHobbyError(fieldErrors(err).hobbyIds || '');
      setQuizErrors(quizErrorsFromServer(err, quizAnswers, 'quizAnswers'));
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading') return <p className="muted" role="status">Loading your preferences…</p>;
  if (status === 'error') return <Alert type="error">{loadError}</Alert>;

  return (
    <form className="stack" onSubmit={save} noValidate>
      <section className="card">
        <h1>Preferences</h1>
        <p className="muted">
          Tell us what you are looking for. Your own details are in your <Link to={USER_PATHS.PROFILE}>profile</Link>.
        </p>
        <Alert>{message}</Alert>
        <Alert type="error">{error}</Alert>
        <PreferenceForm values={values} errors={errors} options={options} onChange={setValues} />
      </section>

      <section className="card">
        <h2>Hobbies and interests</h2>
        <HobbiesSelector hobbies={hobbies} selectedIds={hobbyIds} onChange={setHobbyIds} max={options?.maxHobbies} error={hobbyError} />
      </section>

      <section className="card">
        <h2>Compatibility quiz</h2>
        <p className="muted">
          Optional. You can also answer on the <Link to={USER_PATHS.PREFERENCES_QUIZ}>quiz page</Link>.
        </p>
        <QuizQuestions questionnaire={questionnaire} answers={answers} onChange={setAnswers} errors={quizErrors} />
      </section>

      <div className="actions">
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
      </div>
    </form>
  );
}

export default PreferencesPage;
