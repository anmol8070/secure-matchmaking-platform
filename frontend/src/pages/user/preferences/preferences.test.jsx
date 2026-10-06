import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { USER, fakeAccessToken, mockApi, renderApp } from '../../../test/renderApp.jsx';

const location = () => screen.getByTestId('location').textContent;
const ok = (data, message = 'Request successful') => ({ status: 200, body: { success: true, message, data } });

const OPTIONS = {
  foodPreferences: [
    { value: 'vegetarian', label: 'Vegetarian' },
    { value: 'vegan', label: 'Vegan' },
  ],
  partnerGenders: [
    { value: 'female', label: 'Female' },
    { value: 'male', label: 'Male' },
  ],
  partnerAge: { min: 18, max: 100 },
  maxHobbies: 3,
  maxLengths: { preferredLocation: 150, preferredEducation: 150, preferredOccupation: 150, preferredLifestyle: 100 },
};

const HOBBIES = [
  { id: 1, name: 'Coding' },
  { id: 2, name: 'Music' },
  { id: 3, name: 'Reading' },
  { id: 4, name: 'Travel' },
];

const QUESTIONNAIRE = {
  version: 'sample-1',
  status: 'sample',
  questions: [
    { id: 'weekend_style', text: 'Weekend?', type: 'single_choice', options: [{ value: 'home', label: 'At home' }, { value: 'outdoors', label: 'Outdoors' }] },
    { id: 'core_values', text: 'Values?', type: 'multiple_choice', maxSelections: 2, options: [{ value: 'family', label: 'Family' }, { value: 'career', label: 'Career' }, { value: 'health', label: 'Health' }] },
    { id: 'ideal_partner', text: 'Ideal partner?', type: 'text', maxLength: 20 },
  ],
};

const EMPTY = {
  isSet: false,
  preferredLocation: null,
  preferredEducation: null,
  preferredOccupation: null,
  preferredLifestyle: null,
  preferredFood: null,
  partnerMinAge: null,
  partnerMaxAge: null,
  preferredGenders: [],
  hobbies: [],
  quizAnswers: [],
};

const SAVED = {
  ...EMPTY,
  isSet: true,
  preferredLocation: 'Kolhapur',
  preferredEducation: 'M.Tech',
  preferredFood: 'vegetarian',
  partnerMinAge: 25,
  partnerMaxAge: 32,
  preferredGenders: ['male'],
  hobbies: [HOBBIES[0], HOBBIES[2]],
  quizAnswers: [{ questionId: 'weekend_style', answer: 'home' }],
};

function signedIn(prefs, routes = {}) {
  sessionStorage.setItem('mm.accessToken', fakeAccessToken());
  return mockApi({
    'GET /auth/me': ok(USER),
    'GET /preferences': ok(prefs),
    'GET /preferences/options': ok(OPTIONS),
    'GET /hobbies': ok(HOBBIES),
    'GET /preferences/quiz': ok({ questionnaire: QUESTIONNAIRE, answers: prefs.quizAnswers }),
    ...routes,
  });
}

const hobbyBox = (name) => within(screen.getByRole('group', { name: 'Available hobbies' })).getByLabelText(name);

describe('preferences page', () => {
  it('redirects visitors to login', async () => {
    mockApi();
    renderApp('/preferences');
    await waitFor(() => expect(location()).toBe('/login'));
  });

  it('loads hobbies from the API and pre-fills saved preferences', async () => {
    signedIn(SAVED);
    renderApp('/preferences');

    expect(await screen.findByRole('heading', { name: 'Preferences' })).toBeInTheDocument();
    expect(screen.getByLabelText('Preferred location')).toHaveValue('Kolhapur');
    expect(screen.getByLabelText('Preferred education')).toHaveValue('M.Tech');
    expect(screen.getByLabelText('Food preference')).toHaveValue('vegetarian');
    expect(screen.getByLabelText('Partner age from')).toHaveValue(25);
    expect(screen.getByLabelText('Male')).toBeChecked();
    // Hobbies come from GET /hobbies, selections from GET /preferences.
    expect(hobbyBox('Coding')).toBeChecked();
    expect(hobbyBox('Reading')).toBeChecked();
    expect(hobbyBox('Music')).not.toBeChecked();
    expect(screen.getByLabelText('At home')).toBeChecked();
    expect(screen.getByText(/sample questions/i)).toBeInTheDocument();
  });

  it('creates preferences with hobbies and quiz answers in one request (POST)', async () => {
    const api = signedIn(EMPTY, {
      'POST /preferences': { status: 201, body: { success: true, message: 'Preferences saved successfully', data: SAVED } },
    });
    renderApp('/preferences');
    await screen.findByRole('heading', { name: 'Preferences' });

    fireEvent.change(screen.getByLabelText('Preferred location'), { target: { value: ' Kolhapur ' } });
    fireEvent.change(screen.getByLabelText('Food preference'), { target: { value: 'vegetarian' } });
    fireEvent.click(hobbyBox('Coding'));
    fireEvent.click(hobbyBox('Music'));
    fireEvent.click(screen.getByLabelText('Outdoors'));
    fireEvent.click(screen.getByLabelText('Family'));
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

    expect(await screen.findByText('Preferences saved successfully.')).toBeInTheDocument();
    const [call] = api.callsTo('POST', '/preferences');
    expect(call.body).toEqual({
      preferredLocation: 'Kolhapur',
      preferredEducation: null,
      preferredOccupation: null,
      preferredLifestyle: null,
      preferredFood: 'vegetarian',
      partnerMinAge: null,
      partnerMaxAge: null,
      preferredGenders: [],
      hobbyIds: [1, 2],
      quizAnswers: [
        { questionId: 'weekend_style', answer: 'outdoors' },
        { questionId: 'core_values', answer: ['family'] },
      ],
    });
    expect(call.body.userId).toBeUndefined();
  });

  it('updates existing preferences with PUT and keeps selections after saving', async () => {
    const api = signedIn(SAVED, {
      'PUT /preferences': ok({ ...SAVED, hobbies: [HOBBIES[2], HOBBIES[3]] }, 'Preferences updated successfully'),
    });
    renderApp('/preferences');
    await screen.findByRole('heading', { name: 'Preferences' });

    // Remove "Coding" with its chip, add "Travel".
    fireEvent.click(screen.getByRole('button', { name: 'Remove Coding' }));
    fireEvent.click(hobbyBox('Travel'));
    // Clearing a previously saved answer sends null.
    fireEvent.click(screen.getByRole('button', { name: 'Clear answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

    await screen.findByText('Preferences saved successfully.');
    const body = api.callsTo('PUT', '/preferences')[0].body;
    expect(body.hobbyIds).toEqual([3, 4]);
    expect(body.quizAnswers).toEqual([{ questionId: 'weekend_style', answer: null }]);
    expect(hobbyBox('Travel')).toBeChecked();
    expect(hobbyBox('Coding')).not.toBeChecked();
  });

  it('limits how many hobbies can be selected', async () => {
    signedIn(EMPTY);
    renderApp('/preferences');
    await screen.findByRole('heading', { name: 'Preferences' });
    ['Coding', 'Music', 'Reading'].forEach((name) => fireEvent.click(hobbyBox(name)));

    expect(hobbyBox('Travel')).toBeDisabled();
    expect(screen.getByText('3 selected (up to 3)')).toBeInTheDocument();
  });

  it('validates before saving', async () => {
    const api = signedIn(EMPTY);
    renderApp('/preferences');
    await screen.findByRole('heading', { name: 'Preferences' });

    fireEvent.change(screen.getByLabelText('Partner age from'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Partner age to'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Preferred location'), { target: { value: 'Pune <b>' } });
    fireEvent.change(screen.getByLabelText('Ideal partner?'), { target: { value: 'x'.repeat(25) } });
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

    expect(screen.getByText('Minimum age cannot be greater than the maximum')).toBeInTheDocument();
    expect(screen.getByText('Preferred location contains characters that are not allowed (< or >)')).toBeInTheDocument();
    expect(screen.getByText('Answer must be at most 20 characters')).toBeInTheDocument();
    expect(api.callsTo('POST', '/preferences')).toHaveLength(0);
  });

  it('shows server errors for hobbies and quiz answers', async () => {
    signedIn(EMPTY, {
      'POST /preferences': {
        status: 422,
        body: {
          success: false,
          message: 'Validation failed',
          errors: [
            { field: 'body.hobbyIds', message: 'Unknown or inactive hobby: 2' },
            { field: 'body.quizAnswers.0.answer', message: 'Choose one of the listed options' },
          ],
        },
      },
    });
    renderApp('/preferences');
    await screen.findByRole('heading', { name: 'Preferences' });
    fireEvent.click(hobbyBox('Music'));
    fireEvent.click(screen.getByLabelText('Outdoors'));
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

    expect(await screen.findByText('Unknown or inactive hobby: 2')).toBeInTheDocument();
    expect(screen.getByText('Choose one of the listed options')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Validation failed');
  });

  it('shows a load error', async () => {
    signedIn(EMPTY, { 'GET /hobbies': { status: 503, body: { success: false, message: 'Service temporarily unavailable, please try again later' } } });
    renderApp('/preferences');
    expect(await screen.findByRole('alert')).toHaveTextContent('Service temporarily unavailable');
  });
});

describe('quiz page', () => {
  it('saves answers on their own', async () => {
    const api = signedIn(EMPTY, {
      'PUT /preferences/quiz': ok({ questionnaire: QUESTIONNAIRE, answers: [{ questionId: 'ideal_partner', answer: 'Kind' }] }),
    });
    renderApp('/preferences/quiz');

    fireEvent.change(await screen.findByLabelText('Ideal partner?'), { target: { value: 'Kind' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save answers' }));

    expect(await screen.findByText('Quiz answers saved successfully.')).toBeInTheDocument();
    expect(api.callsTo('PUT', '/preferences/quiz')[0].body).toEqual({ answers: [{ questionId: 'ideal_partner', answer: 'Kind' }] });
  });

  it('limits multiple-choice selections', async () => {
    signedIn(EMPTY);
    renderApp('/preferences/quiz');
    fireEvent.click(await screen.findByLabelText('Family'));
    fireEvent.click(screen.getByLabelText('Career'));
    expect(screen.getByLabelText('Health')).toBeDisabled();
  });
});
