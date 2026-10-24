/**
 * Recommended matches page (Phase 8, refined in Phase 15): what is shown
 * comes from the API, pagination and filters reach the server, and the
 * compatibility score is kept apart from the ML ranking.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { USER, fakeAccessToken, mockApi, renderApp } from '../../../test/renderApp.jsx';

const ok = (data) => ({ status: 200, body: { success: true, message: 'Request successful', data } });
const fail = (status, message) => ({ status, body: { success: false, message } });

function match(userId, name, { compatibilityScore = 72, mlPrediction = null, recommendationScore = compatibilityScore } = {}) {
  return {
    userId,
    compatibilityScore,
    mlPrediction,
    recommendationScore,
    commonHobbies: ['Reading'],
    whyThisMatch: ['You both live in Pune'],
    scoreBreakdown: {
      location: { similarity: 1, weight: 10, contribution: 10 },
      hobbies: { similarity: 0.5, weight: 25, contribution: 12.5 },
      details: { hobbyJaccard: 0.5 },
    },
    profile: { name, age: 29, location: 'Pune', education: 'Bachelor', occupation: 'Engineer', lifestyle: null, bio: 'Hello', profilePicture: null },
  };
}

const page = (items, pagination = { page: 1, limit: 12, total: items.length, totalPages: 1 }) => ok({ recommendations: items, pagination });
const status = ok({ userId: 9, state: 'none', connectionId: null, canSendRequest: true, canCommunicate: false });

function signedIn(routes = {}) {
  sessionStorage.setItem('mm.accessToken', fakeAccessToken());
  return mockApi({ 'GET /auth/me': ok(USER), 'GET /connections/status/9': status, 'GET /connections/status/10': status, ...routes });
}

afterEach(() => vi.restoreAllMocks());

describe('recommended matches', () => {
  it('shows the compatibility score from the API and says the order is by compatibility when no model is used', async () => {
    signedIn({ 'GET /matches': page([match(9, 'Riya Shah', { compatibilityScore: 81 })]) });
    renderApp('/matches');
    const card = await screen.findByRole('article', { name: /riya shah/i });
    expect(within(card).getByRole('img', { name: 'Compatibility 81%' })).toBeInTheDocument();
    expect(within(card).getByText('Great match')).toBeInTheDocument();
    expect(within(card).getByText('Compatibility score')).toBeInTheDocument();
    expect(screen.getByText('Ordered by compatibility score, highest first.')).toBeInTheDocument();
    expect(screen.queryByText(/phase 7/i)).not.toBeInTheDocument();
  });

  it('discloses the model-based ranking without presenting it as the compatibility score', async () => {
    signedIn({
      'GET /matches': page([match(9, 'Riya Shah', { compatibilityScore: 70, mlPrediction: 0.91, recommendationScore: 82.6 })]),
      'GET /matches/9': ok(match(9, 'Riya Shah', { compatibilityScore: 70, mlPrediction: 0.91, recommendationScore: 82.6 })),
    });
    renderApp('/matches');
    expect(await screen.findByText(/personalised ranking that combines compatibility with a recommendation model/i)).toBeInTheDocument();
    // The card still shows 70 (compatibility), never 83 (ranking).
    expect(screen.getByRole('img', { name: 'Compatibility 70%' })).toBeInTheDocument();
    expect(screen.queryByText('83%')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /view match details for riya shah/i }));
    const dialog = await screen.findByRole('dialog', { name: /riya shah/i });
    expect(within(dialog).getByText(/ranking score 83 \/ 100/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/positive response: 91%/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/does not change the compatibility score/i)).toBeInTheDocument();
  });

  it('says no model is in use when the server returned no prediction', async () => {
    signedIn({ 'GET /matches': page([match(9, 'Riya Shah')]), 'GET /matches/9': ok(match(9, 'Riya Shah')) });
    renderApp('/matches?view=9');
    const dialog = await screen.findByRole('dialog', { name: /riya shah/i });
    expect(within(dialog).getByText(/no recommendation model is in use yet/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('progressbar', { name: 'Location' })).toHaveAttribute('aria-valuenow', '100');
    expect(within(dialog).getByRole('progressbar', { name: 'Shared hobbies' })).toHaveAttribute('aria-valuenow', '50');
  });

  it('sends the page number to the server when paging', async () => {
    const api = signedIn({
      'GET /matches': [
        page([match(9, 'Riya Shah')], { page: 1, limit: 12, total: 13, totalPages: 2 }),
        page([match(10, 'Meera Rao')], { page: 2, limit: 12, total: 13, totalPages: 2 }),
      ],
    });
    renderApp('/matches');
    await screen.findByText('Riya Shah');
    expect(api.callsTo('GET', '/matches')[0].query).toEqual({ page: '1', limit: '12' });

    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    expect(await screen.findByText('Meera Rao')).toBeInTheDocument();
    expect(api.callsTo('GET', '/matches')[1].query).toEqual({ page: '2', limit: '12' });
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('sends filters to the server and validates ages first', async () => {
    window.scrollTo = vi.fn();
    const api = signedIn({ 'GET /matches': page([match(9, 'Riya Shah')]) });
    renderApp('/matches');
    await screen.findByText('Riya Shah');
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));

    fireEvent.change(screen.getByLabelText('Min age'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Max age'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Min age cannot be greater than max age.');
    expect(api.callsTo('GET', '/matches')).toHaveLength(1);

    fireEvent.change(screen.getByLabelText('Max age'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: '  Pune ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(api.callsTo('GET', '/matches')).toHaveLength(2));
    expect(api.callsTo('GET', '/matches')[1].query).toEqual({ page: '1', limit: '12', location: 'Pune', minAge: '40', maxAge: '45' });
    expect(await screen.findByText('Filters active')).toBeInTheDocument();
  });

  it('shows the empty state for no matches, with a way to clear filters only when filtering', async () => {
    signedIn({ 'GET /matches': page([]) });
    renderApp('/matches');
    expect(await screen.findByText('No suitable matches found')).toBeInTheDocument();
    expect(screen.getByText(/complete your profile and preferences/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('shows an error with a retry, which reloads from the server', async () => {
    const api = signedIn({ 'GET /matches': [fail(500, 'Something went wrong'), page([match(9, 'Riya Shah')])] });
    renderApp('/matches');
    expect(await screen.findByText('Unable to load recommendations')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Riya Shah')).toBeInTheDocument();
    expect(api.callsTo('GET', '/matches')).toHaveLength(2);
  });

  it('explains an unavailable profile inline instead of a browser alert', async () => {
    window.alert = vi.fn();
    signedIn({ 'GET /matches': page([match(9, 'Riya Shah')]), 'GET /matches/9': fail(403, 'This profile is not accessible') });
    renderApp('/matches');
    fireEvent.click(await screen.findByRole('button', { name: /view match details for riya shah/i }));
    expect(await screen.findByText('This profile is not available.')).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('the details dialog takes focus, closes on Escape and gives focus back', async () => {
    signedIn({ 'GET /matches': page([match(9, 'Riya Shah')]), 'GET /matches/9': ok(match(9, 'Riya Shah')) });
    renderApp('/matches');
    const opener = await screen.findByRole('button', { name: /view match details for riya shah/i });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole('dialog', { name: /riya shah/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(opener);
  });

  it('Escape in the report dialog closes only the report, not the match details under it', async () => {
    signedIn({
      'GET /matches': page([match(9, 'Riya Shah')]),
      'GET /matches/9': ok(match(9, 'Riya Shah')),
      'GET /reports/reasons': ok({ reasons: [{ value: 'spam', label: 'Spam' }] }),
    });
    renderApp('/matches?view=9');
    const details = await screen.findByRole('dialog', { name: /riya shah/i });
    fireEvent.click(within(details).getByRole('button', { name: /report/i }));
    expect(await screen.findByRole('dialog', { name: /report riya shah/i })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /report riya shah/i })).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: /riya shah/i })).toBeInTheDocument();
  });

  it('falls back to initials when a profile picture fails to load', async () => {
    const item = match(9, 'Riya Shah');
    item.profile.profilePicture = 'http://localhost/media/missing.webp';
    signedIn({ 'GET /matches': page([item]) });
    renderApp('/matches');
    const img = await screen.findByRole('img', { name: 'Profile picture of Riya Shah' });
    fireEvent.error(img);
    expect(await screen.findByRole('img', { name: /riya shah \(no profile picture\)/i })).toHaveTextContent('RS');
  });
});
