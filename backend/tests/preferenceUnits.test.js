/** Unit tests for the quiz question bank (no database needed). */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadQuestionBank } = require('../src/services/quizQuestionBank');

function writeBank(content) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-')), 'questions.json');
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  return file;
}

const choice = (id) => ({
  id,
  text: 'Q?',
  type: 'single_choice',
  options: [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ],
});

describe('quiz question bank', () => {
  it('loads the bundled sample questionnaire', () => {
    const bank = loadQuestionBank();
    expect(bank).toMatchObject({ version: 'sample-1', status: 'sample' });
    expect(bank.questions.length).toBeGreaterThan(0);
  });

  it('defaults text questions to 500 characters', () => {
    const bank = loadQuestionBank(writeBank({ version: '1', status: 'approved', questions: [{ id: 'about', text: 'About?', type: 'text' }] }));
    expect(bank.questions[0].maxLength).toBe(500);
  });

  it.each([
    ['unreadable JSON', '{ not json', /Cannot read quiz questions/],
    ['duplicate question ids', { version: '1', status: 'draft', questions: [choice('q1'), choice('q1')] }, /Duplicate question id "q1"/],
    ['an unknown type', { version: '1', status: 'draft', questions: [{ ...choice('q1'), type: 'slider' }] }, /Invalid quiz questions file/],
    ['too few options', { version: '1', status: 'draft', questions: [{ ...choice('q1'), options: [{ value: 'a', label: 'A' }] }] }, /Invalid quiz questions file/],
    ['an invalid id', { version: '1', status: 'draft', questions: [choice('Bad Id!')] }, /Invalid quiz questions file/],
    ['an unknown status', { version: '1', status: 'final', questions: [] }, /Invalid quiz questions file/],
  ])('rejects a file with %s', (label, content, message) => {
    expect(() => loadQuestionBank(writeBank(content))).toThrow(message);
  });

  it('rejects a missing file', () => {
    expect(() => loadQuestionBank(path.join(os.tmpdir(), 'does-not-exist.json'))).toThrow(/Cannot read quiz questions/);
  });
});
