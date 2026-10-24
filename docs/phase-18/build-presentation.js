/**
 * Rebuild docs/phase-18/presentation.pptx from the audited outline.
 * No charts: this audit did not measure recommendation metrics.
 */
const PptxGenJS = require('pptxgenjs');

const pres = new PptxGenJS();
pres.layout = 'LAYOUT_WIDE';
pres.title = 'Secure Social Networking and Digital Matchmaking Platform';
pres.author = 'Project audit';
pres.subject = 'Phase 18 academic review, 24 October 2026';

const ink = '1F2933';
const muted = '52606D';
const paper = 'F7F4EF';
const accent = '6D28D9';

function addSlide(title, lines, notes) {
  const slide = pres.addSlide();
  slide.background = { color: paper };
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: accent },
  });
  slide.addText(title, {
    x: 0.5, y: 0.28, w: 12.3, h: 0.7,
    fontFace: 'Calibri', fontSize: 28, bold: true, color: ink, margin: 0, isTextBox: true,
  });
  slide.addText(lines.map((text, index) => ({
    text,
    options: { bullet: true, breakLine: index < lines.length - 1 },
  })), {
    x: 0.55, y: 1.2, w: 12.2, h: 5.7,
    fontFace: 'Calibri', fontSize: 18, color: ink, paraSpaceAfter: 10, margin: 0, isTextBox: true,
  });
  if (notes) slide.addNotes(notes);
}

addSlide('Secure matchmaking platform', [
  'Final academic review of the local implementation',
  'Audit date: 24 October 2026',
  'React client, Express API, MySQL in this development database',
  'This deck reports only what the source and the test run support',
], 'Title. Do not claim production deployment.');

addSlide('Problem statement', [
  'Members cannot see why a profile was ranked above another',
  'Visibility of age, location, and photos is often unclear',
  'A login password does not show that a person is at the camera',
  'After two people connect, they still need a private chat and a call',
  'An operator needs a queue for reports',
]);

addSlide('Motivation', [
  'Make the compatibility score readable from its parts',
  'Enforce visibility on the server, not only in the page',
  'Open chat and video only after an accepted connection',
  'Keep moderation in an admin role checked on each request',
  'Do not claim better relationship outcomes than existing services',
]);

addSlide('Objectives', [
  'Register, confirm a development one-time code, and sign in',
  'Require a live camera check before an access token is issued',
  'Store a profile, preferences, hobbies, and quiz answers',
  'Rank members and explain the score',
  'Allow an optional model when interaction history exists',
  'Support requests, chat, video, block, report, and admin review',
]);

addSlide('Existing systems', [
  'Profile directories search attributes the person typed',
  'Preference filters add age, location, and lifestyle',
  'Behavioural recommenders need history and are often opaque',
  'Published work has not established that hidden matching outperforms simpler meeting',
  'This project does not claim that gap is closed',
]);

addSlide('Proposed system', [
  'Password or one-time code, then a short-lived verification token',
  'Camera presence check, and a browser comparison when a profile photo exists',
  'Deterministic score, then connection requests',
  'Private messages and WebRTC signalling after acceptance',
  'Privacy levels, block with a reason, and an admin report queue',
]);

addSlide('Architecture', [
  'Browser talks to Express at /api/v1 and to Socket.IO',
  'Services read and write the database and local upload folders',
  'Call audio and video stay between the two browsers',
  'Face models load from a public CDN unless overridden',
  'Mail, TURN, and Redis are not configured in this audit',
]);

addSlide('Technology stack', [
  'React 19, Vite 8, React Router 7',
  'Express 5, Zod, Knex, Socket.IO',
  'scrypt passwords and revocable JWT sessions',
  'MediaPipe for a single face in the marker',
  'face-api in the browser when a profile photo exists',
  'Jest on the API and Vitest in the client',
]);

addSlide('Database', [
  '27 migrations applied on the development MySQL database, none pending',
  'PostgreSQL is supported by the same Knex files',
  'Accounts, profiles, preferences, hobbies, quiz answers, and stored scores',
  'Connections, messages, calls, reports, blocks, and privacy settings',
  'Verification, OTP, sessions, model versions, and admin audit logs',
]);

addSlide('Compatibility score', [
  'Location plus age, up to 25 points',
  'Food, lifestyle, education, and occupation, capped at 25',
  'Hobby overlap: Jaccard index times 25',
  'Quiz agreement on shared questions, times 25',
  'The sum is clamped to 0–100',
  'Empty hobbies or a missing quiz score 12.5, not zero',
]);

addSlide('Recommendation', [
  'Baseline rank is the compatibility score',
  'An admin can train logistic regression on interaction labels',
  'If a model is active: 40% compatibility and 60% predicted probability',
  'If no model is active, the baseline is used',
  'No precision, recall, or acceptance rate was measured for this review',
]);

addSlide('Security and privacy', [
  'scrypt, OTP expiry and attempt limits, session revocation',
  'Request validation, rate limits, and an admin role read from the database',
  'Visibility settings applied when a profile is returned',
  'The face-match flag is supplied by the browser',
  'A known profile-photo URL can still be fetched',
  'No penetration-test certificate exists',
]);

addSlide('Interface', [
  'Public landing page with a Three.js hero',
  'Registration, login, and the camera marker',
  'Profile, change-photo dialog, and preferences',
  'Matches with a breakdown, connections, chat, and a video page',
  'Privacy, block with a reason, and admin screens',
  'Light and dark themes. New screenshots were not taken in this audit',
]);

addSlide('Testing methodology', [
  'Backend unit tests, without the database integration suite',
  'Frontend tests with a mocked API',
  'Migration list and a health check against the running development API',
  'Production frontend build',
  'Browser walkthrough, video end-to-end, and Postman were not run',
]);

addSlide('Results from this audit', [
  'Backend: 21 suites, 322 tests passed',
  'Frontend first run failed: broken JSX and unwired save messages',
  'After repairs: 15 files, 216 tests passed',
  'Frontend production build succeeded, with large-chunk warnings',
  'Health check succeeded in the development environment',
  '27 migrations applied, none pending',
]);

addSlide('Limitations', [
  'A modified client can send a successful face-match flag',
  'Profile photos are public if the file URL is known',
  'One-time codes use the development outbox',
  'The quiz file is a sample',
  'The logistic ranker has no measured gain',
  'No TURN server and no production deployment',
]);

addSlide('Future scope', [
  'Evaluate the blend on recorded interactions, or report that the sample is too small',
  'Compare faces on the server, or stop claiming a photo match',
  'Serve profile photos only to authorised viewers',
  'Add a real mail provider and a TURN relay',
  'Review accessibility and reduce the hero and face-api bundles',
]);

addSlide('Conclusion', [
  'The repository implements explainable matching, private chat, call signalling, and basic moderation',
  'Unit tests and the frontend build passed after specific repairs',
  'The optional model is implemented and not evaluated',
  'Login verification is presence, plus a client-reported photo comparison when a photo exists',
  'The project is not production-complete',
]);

addSlide('References', [
  'Boyd and Ellison, Journal of Computer-Mediated Communication, 2007',
  'Finkel, Eastwick, Karney, Reis, and Sprecher, Psychological Science in the Public Interest, 2012',
  'Resnick and Varian, Communications of the ACM, 1997',
  'Koren, Bell, and Volinsky, IEEE Computer, 2009',
  'W3C WebRTC specification',
  'Background only. Not results of this project. Page numbers were not rechecked.',
]);

pres.writeFile({ fileName: 'docs/phase-18/presentation.pptx' })
  .then(() => console.log('wrote presentation.pptx'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
