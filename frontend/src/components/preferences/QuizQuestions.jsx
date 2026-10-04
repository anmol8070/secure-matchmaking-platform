/**
 * Renders the configured compatibility questions (from GET /preferences/quiz)
 * and reports answers as { [questionId]: answer }.
 */
import Alert from '../common/Alert.jsx';

function QuizQuestions({ questionnaire, answers, onChange, errors = {} }) {
  if (!questionnaire) return null;
  const { questions, status } = questionnaire;
  const set = (id, value) => onChange({ ...answers, [id]: value });

  const toggle = (question, value) => {
    const current = Array.isArray(answers[question.id]) ? answers[question.id] : [];
    set(question.id, current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
  };

  return (
    <div className="quiz">
      {status !== 'approved' && (
        <Alert>These are sample questions. The final compatibility questionnaire has not been approved yet.</Alert>
      )}
      {questions.length === 0 && <p className="muted">No questions are available.</p>}

      {questions.map((q, index) => (
        <fieldset key={q.id} className="quiz__question">
          <legend>
            {index + 1}. {q.text}
          </legend>

          {q.type === 'single_choice' && (
            <div className="choice-list">
              {q.options.map((o) => (
                <label key={o.value} className="choice">
                  <input type="radio" name={`quiz-${q.id}`} checked={answers[q.id] === o.value} onChange={() => set(q.id, o.value)} />
                  {o.label}
                </label>
              ))}
              {answers[q.id] && (
                <button type="button" className="btn btn--link" onClick={() => set(q.id, null)}>
                  Clear answer
                </button>
              )}
            </div>
          )}

          {q.type === 'multiple_choice' && (
            <div className="choice-list">
              {q.options.map((o) => {
                const chosen = Array.isArray(answers[q.id]) && answers[q.id].includes(o.value);
                const full = q.maxSelections && Array.isArray(answers[q.id]) && answers[q.id].length >= q.maxSelections;
                return (
                  <label key={o.value} className="choice">
                    <input type="checkbox" checked={chosen} disabled={!chosen && full} onChange={() => toggle(q, o.value)} />
                    {o.label}
                  </label>
                );
              })}
            </div>
          )}

          {q.type === 'text' && (
            <div className="field">
              <textarea
                aria-label={q.text}
                rows={3}
                maxLength={q.maxLength}
                value={answers[q.id] || ''}
                onChange={(e) => set(q.id, e.target.value)}
              />
              <small className="muted">
                {(answers[q.id] || '').length}/{q.maxLength} characters
              </small>
            </div>
          )}

          {errors[q.id] && <small className="field-error">{errors[q.id]}</small>}
        </fieldset>
      ))}
    </div>
  );
}

export default QuizQuestions;
