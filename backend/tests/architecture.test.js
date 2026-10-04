/**
 * Structural rules for the layered architecture.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const list = (dir) => fs.readdirSync(path.join(SRC, dir)).filter((f) => f.endsWith('.js'));

const MODULES = [
  'auth',
  'profile',
  'preference',
  'hobby',
  'match',
  'recommendation',
  'connection',
  'message',
  'report',
  'block',
  'feedback',
  'admin',
];

describe('layered structure', () => {
  it.each(MODULES)('module "%s" has its own route and controller file', (name) => {
    expect(list('routes')).toContain(`${name}Routes.js`);
    expect(list('controllers')).toContain(`${name}Controller.js`);
  });

  it('has one service per module, with matching, recommendation and verification separate', () => {
    const services = list('services');
    for (const name of [
      'authService.js',
      'profileService.js',
      'preferenceService.js',
      'hobbyService.js',
      'matchingService.js',
      'recommendationService.js',
      'connectionService.js',
      'messageService.js',
      'reportService.js',
      'blockService.js',
      'feedbackService.js',
      'adminService.js',
      'verificationService.js',
    ]) {
      expect(services).toContain(name);
    }
  });

  it('has a model for each Phase 2 table', () => {
    const tables = Object.values(require('../src/models')).map((model) => model.table);
    expect(tables.sort()).toEqual(
      [
        'users',
        'profiles',
        'preferences',
        'hobbies',
        'user_hobbies',
        'quiz_answers',
        'matches',
        'connection_requests',
        'messages',
        'reports',
        'blocks',
        'activity_feedback',
        'login_verifications',
      ].sort()
    );
  });

  it('controllers never access the database directly', () => {
    const offenders = list('controllers').filter((file) =>
      /config\/database|require\(['"]knex|\/models/.test(read(`controllers/${file}`))
    );
    expect(offenders).toEqual([]);
  });

  it('only config/database.js creates a database connection', () => {
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.js') && /require\(['"]knex['"]\)/.test(fs.readFileSync(full, 'utf8'))) {
          offenders.push(path.relative(SRC, full).replace(/\\/g, '/'));
        }
      }
    };
    walk(SRC);
    expect(offenders).toEqual(['config/database.js']);
  });

  it('keeps login verification independent of profiles and profile photos', () => {
    const verification = read('services/verificationService.js');
    const profile = read('services/profileService.js');

    expect(verification).not.toMatch(/require\([^)]*profile/i);
    expect(profile).not.toMatch(/require\([^)]*verification/i);
  });
});
