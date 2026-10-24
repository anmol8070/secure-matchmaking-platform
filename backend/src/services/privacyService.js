/**
 * Phase 13 — privacy settings and the single place where profile data
 * shown to OTHER users is filtered.
 *
 * Every API that returns someone else's profile data (profile view,
 * recommendations, match details, connection lists/requests, chat headers,
 * call screens, blocked list, incoming-call cards) goes through this
 * module; controllers and other services never decide visibility.
 *
 * Viewer relationship to the profile owner:
 *   self        — everything
 *   connection  — accepted connection (and no block): "everyone" + "connections" fields
 *   member      — any other signed-in member: "everyone" fields only
 *   blocked     — a block exists in either direction: name only, nothing else
 *
 * Field levels: everyone | connections | nobody.
 * profile_visibility "connections": non-connections do not find the profile
 * in recommendations/match details and see only the name (+ photo if its
 * own setting allows) wherever they already have a link to the user (e.g.
 * a pending request).
 *
 * Always visible: user id, name, gender. Never visible (to anyone else,
 * whatever the settings): email, mobile, exact date of birth, account and
 * security data.
 */
const { Block, ConnectionRequest, PrivacySetting, UserHobby } = require('../models');
const { STATUS: CONNECTION_STATUS } = require('../models/connectionRequestModel');
const { toPublicUrl } = require('./storage');
const { ageFromDateOfBirth } = require('../utils/age');

const LEVELS = Object.freeze(['everyone', 'connections', 'nobody']);
const PROFILE_LEVELS = Object.freeze(['everyone', 'connections']);

/** API name → { column, levels, default }. Defaults favour discoverability; online status is private by default. */
const SETTINGS = Object.freeze({
  profileVisibility: { column: 'profile_visibility', levels: PROFILE_LEVELS, default: 'everyone' },
  photoVisibility: { column: 'photo_visibility', levels: LEVELS, default: 'everyone' },
  ageVisibility: { column: 'age_visibility', levels: LEVELS, default: 'everyone' },
  locationVisibility: { column: 'location_visibility', levels: LEVELS, default: 'everyone' },
  educationVisibility: { column: 'education_visibility', levels: LEVELS, default: 'everyone' },
  occupationVisibility: { column: 'occupation_visibility', levels: LEVELS, default: 'everyone' },
  lifestyleVisibility: { column: 'lifestyle_visibility', levels: LEVELS, default: 'everyone' },
  bioVisibility: { column: 'bio_visibility', levels: LEVELS, default: 'everyone' },
  hobbiesVisibility: { column: 'hobbies_visibility', levels: LEVELS, default: 'everyone' },
  onlineStatusVisibility: { column: 'online_status_visibility', levels: LEVELS, default: 'connections' },
});

const DEFAULTS = Object.freeze(Object.fromEntries(Object.entries(SETTINGS).map(([key, s]) => [key, s.default])));

/** Profile field → the setting that controls it. */
const FIELD_SETTING = Object.freeze({
  photo: 'photoVisibility',
  age: 'ageVisibility',
  location: 'locationVisibility',
  education: 'educationVisibility',
  occupation: 'occupationVisibility',
  lifestyle: 'lifestyleVisibility',
  bio: 'bioVisibility',
  hobbies: 'hobbiesVisibility',
  onlineStatus: 'onlineStatusVisibility',
});

const RELATIONSHIP = Object.freeze({ SELF: 'self', CONNECTION: 'connection', MEMBER: 'member', BLOCKED: 'blocked' });

const sameId = (a, b) => Number(a) === Number(b);

/* ---------------- settings ---------------- */

function fromRow(row) {
  const settings = { ...DEFAULTS };
  if (row) for (const [key, s] of Object.entries(SETTINGS)) if (row[s.column]) settings[key] = row[s.column];
  return settings;
}

/** The user's settings (defaults when they never saved any). */
async function getPrivacySettings(userId, trx) {
  return fromRow(await PrivacySetting.findByPk(userId, trx));
}

/**
 * Updates the authenticated user's own settings. `changes` is already
 * validated (privacyValidator): only known keys and allowed levels.
 */
async function updatePrivacySettings(userId, changes, trx) {
  const columns = {};
  for (const [key, value] of Object.entries(changes)) columns[SETTINGS[key].column] = value;
  if (Object.keys(columns).length) await PrivacySetting.upsert(userId, columns, trx);
  return getPrivacySettings(userId, trx);
}

/** Settings for many users at once → Map(userId → settings). */
async function settingsFor(userIds, trx) {
  const unique = [...new Set(userIds.map(Number))];
  const rows = await PrivacySetting.findMany(unique, trx);
  const byId = new Map(rows.map((r) => [Number(r.user_id), r]));
  return new Map(unique.map((id) => [id, fromRow(byId.get(id))]));
}

/* ---------------- relationships ---------------- */

/** Viewer's relationship to each target → Map(targetId → RELATIONSHIP). One query each for blocks and connections. */
async function relationshipsFor(viewerId, targetIds, trx) {
  const viewer = Number(viewerId);
  const others = [...new Set(targetIds.map(Number))].filter((id) => id !== viewer);
  const result = new Map([[viewer, RELATIONSHIP.SELF]]);
  if (!others.length) return result;

  const [blocks, connections] = await Promise.all([
    Block.query(trx)
      .select('blocker_id', 'blocked_id')
      .where((q) => q.where('blocker_id', viewer).whereIn('blocked_id', others))
      .orWhere((q) => q.where('blocked_id', viewer).whereIn('blocker_id', others)),
    ConnectionRequest.query(trx)
      .select('sender_id', 'receiver_id')
      .where('status', CONNECTION_STATUS.ACCEPTED)
      .andWhere((q) =>
        q.where((s) => s.where('sender_id', viewer).whereIn('receiver_id', others)).orWhere((s) => s.where('receiver_id', viewer).whereIn('sender_id', others))
      ),
  ]);
  const blocked = new Set(blocks.map((b) => (Number(b.blocker_id) === viewer ? Number(b.blocked_id) : Number(b.blocker_id))));
  const connected = new Set(connections.map((c) => (Number(c.sender_id) === viewer ? Number(c.receiver_id) : Number(c.sender_id))));
  for (const id of others) {
    result.set(id, blocked.has(id) ? RELATIONSHIP.BLOCKED : connected.has(id) ? RELATIONSHIP.CONNECTION : RELATIONSHIP.MEMBER);
  }
  return result;
}

async function relationshipOf(viewerId, targetId, trx) {
  return (await relationshipsFor(viewerId, [targetId], trx)).get(Number(targetId));
}

/* ---------------- visibility rules ---------------- */

function levelAllows(level, relationship) {
  if (relationship === RELATIONSHIP.SELF) return true;
  if (relationship === RELATIONSHIP.BLOCKED) return false;
  if (level === 'everyone') return true;
  if (level === 'connections') return relationship === RELATIONSHIP.CONNECTION;
  return false; // nobody
}

/** May the viewer see the profile as a profile (match details, profile page, recommendations)? */
function profileVisibleTo(settings, relationship) {
  if (relationship === RELATIONSHIP.BLOCKED) return false;
  return levelAllows(settings.profileVisibility, relationship);
}

/** Which profile fields the viewer may see → { photo: bool, age: bool, … }. */
function allowedFields(settings, relationship) {
  const full = profileVisibleTo(settings, relationship);
  const allowed = {};
  for (const [field, key] of Object.entries(FIELD_SETTING)) {
    // A restricted profile still shows its photo when the photo itself is public.
    allowed[field] = (full || field === 'photo') && levelAllows(settings[key], relationship);
  }
  return allowed;
}

const location = (p) => [p.city, p.state, p.country].filter(Boolean).join(', ') || null;

/** Small card used in lists, chat headers and call screens. */
function buildCard(profile, userId, allowed) {
  return {
    userId: Number(userId),
    name: profile.name,
    profilePicture: allowed.photo ? toPublicUrl(profile.profile_photo_url) : null,
    age: allowed.age ? ageFromDateOfBirth(profile.date_of_birth) : null,
    location: allowed.location ? location(profile) : null,
  };
}

/* ---------------- public API used by other services ---------------- */

/**
 * Cards for many profiles as seen by `viewerId`.
 * @param {Array<{userId, profile}>} entries  profile = profiles row
 * @param {object} [options]
 * @param {string} [options.asRelationship]   force a relationship (e.g. the blocker's own blocked list shows "member" view)
 * @returns {Promise<Map<number, object>>}
 */
async function cardsFor(viewerId, entries, { asRelationship, trx } = {}) {
  const ids = entries.map((e) => Number(e.userId));
  const [settings, relationships] = await Promise.all([settingsFor(ids, trx), asRelationship ? null : relationshipsFor(viewerId, ids, trx)]);
  const cards = new Map();
  for (const { userId, profile } of entries) {
    if (!profile) continue;
    const relationship = asRelationship || relationships.get(Number(userId));
    cards.set(Number(userId), buildCard(profile, userId, allowedFields(settings.get(Number(userId)), relationship)));
  }
  return cards;
}

async function cardFor(viewerId, userId, profile, options) {
  if (!profile) return null;
  return (await cardsFor(viewerId, [{ userId, profile }], options)).get(Number(userId)) || null;
}

/**
 * The full profile of `targetId` as `viewerId` may see it, or null when the
 * viewer may not see it at all (blocked). Hidden fields are null and listed
 * in `hiddenFields`; `restricted` is true when only the basic card is shown.
 */
async function visibleProfile(viewerId, targetId, profile, { hobbies } = {}, trx) {
  if (!profile) return null;
  const [settings, relationship] = await Promise.all([getPrivacySettings(targetId, trx), relationshipOf(viewerId, targetId, trx)]);
  if (relationship === RELATIONSHIP.BLOCKED) return null;
  const allowed = allowedFields(settings, relationship);
  const restricted = !profileVisibleTo(settings, relationship);
  let hobbyNames = null;
  if (allowed.hobbies) {
    hobbyNames = hobbies ?? (await UserHobby.getUserHobbiesWithNames(targetId, trx)).map((h) => h.hobby_name).sort();
  }

  return {
    userId: Number(targetId),
    name: profile.name,
    gender: restricted ? null : profile.gender || null,
    profilePicture: allowed.photo ? toPublicUrl(profile.profile_photo_url) : null,
    age: allowed.age ? ageFromDateOfBirth(profile.date_of_birth) : null,
    location: allowed.location ? location(profile) : null,
    education: allowed.education ? profile.education || null : null,
    occupation: allowed.occupation ? profile.occupation || null : null,
    lifestyle: allowed.lifestyle ? profile.lifestyle || null : null,
    bio: allowed.bio ? profile.bio || null : null,
    hobbies: hobbyNames,
    restricted,
    hiddenFields: Object.entries(allowed)
      .filter(([field, ok]) => !ok && field !== 'onlineStatus')
      .map(([field]) => field),
  };
}

/* ---- recommendations / match details ---- */

// Reasons produced by matchingService.generateWhyThisMatch, by the field they reveal.
const REASON_FIELDS = [
  [/^You both live in /, 'location'],
  [/^You share \d+ hobb/, 'hobbies'],
  [/lifestyle|food & diet/i, 'lifestyle'],
  [/^Education background/, 'education'],
  [/^Occupation matches/, 'occupation'],
  [/^Age fits/, 'age'],
];
// scoreBreakdown / mlFeatures keys that reveal a field's value.
const BREAKDOWN_FIELDS = { location: 'location', education: 'education', occupation: 'occupation', lifestyle: 'lifestyle', food: 'lifestyle', hobbies: 'hobbies', age: 'age' };
const FEATURE_FIELDS = {
  location_similarity: 'location',
  education_similarity: 'education',
  occupation_similarity: 'occupation',
  lifestyle_similarity: 'lifestyle',
  food_similarity: 'lifestyle',
  hobby_similarity: 'hobbies',
};

/**
 * Removes everything a recommendation item reveals about hidden fields:
 * profile fields, common hobbies, "why this match" reasons naming them,
 * and the per-field parts of the score breakdown. The overall scores stay.
 */
function filterMatchItem(item, profile, settings, relationship) {
  const allowed = allowedFields(settings, relationship);
  const { userId } = item;
  const scoreBreakdown = item.scoreBreakdown ? { ...item.scoreBreakdown } : item.scoreBreakdown;
  if (scoreBreakdown) {
    for (const [key, field] of Object.entries(BREAKDOWN_FIELDS)) if (!allowed[field]) delete scoreBreakdown[key];
    if (!allowed.hobbies && scoreBreakdown.details) {
      scoreBreakdown.details = { ...scoreBreakdown.details };
      delete scoreBreakdown.details.hobbyJaccard;
    }
  }
  const mlFeatures = item.mlFeatures ? { ...item.mlFeatures } : item.mlFeatures;
  if (mlFeatures) for (const [key, field] of Object.entries(FEATURE_FIELDS)) if (!allowed[field]) delete mlFeatures[key];

  return {
    ...item,
    profile: {
      name: profile.name || null,
      age: allowed.age ? ageFromDateOfBirth(profile.date_of_birth) : null,
      gender: profile.gender || null,
      location: allowed.location ? location(profile) : null,
      education: allowed.education ? profile.education || null : null,
      occupation: allowed.occupation ? profile.occupation || null : null,
      lifestyle: allowed.lifestyle ? profile.lifestyle || null : null,
      bio: allowed.bio ? profile.bio || null : null,
      profilePicture: allowed.photo ? toPublicUrl(profile.profile_photo_url) : null,
    },
    commonHobbies: allowed.hobbies ? item.commonHobbies : [],
    whyThisMatch: (item.whyThisMatch || []).filter((reason) => {
      const match = REASON_FIELDS.find(([pattern]) => pattern.test(reason));
      return !match || allowed[match[1]];
    }),
    ...(scoreBreakdown !== undefined && { scoreBreakdown }),
    ...(mlFeatures !== undefined && { mlFeatures }),
    userId,
  };
}

/**
 * For the recommendation pipeline: which candidates may be shown to the
 * viewer at all (profile visible), plus what is needed to filter each item.
 * @returns {Promise<{ visible: (userId) => boolean, filter: (item, profile) => item }>}
 */
async function recommendationContext(viewerId, candidateIds, trx) {
  const [settings, relationships] = await Promise.all([settingsFor(candidateIds, trx), relationshipsFor(viewerId, candidateIds, trx)]);
  return {
    visible: (userId) => profileVisibleTo(settings.get(Number(userId)), relationships.get(Number(userId))),
    /** Fields of this candidate the viewer may see — search filters may only match these. */
    allowed: (userId) => allowedFields(settings.get(Number(userId)), relationships.get(Number(userId))),
    filter: (item, profile) => filterMatchItem(item, profile, settings.get(Number(item.userId)), relationships.get(Number(item.userId))),
  };
}

/** May `viewerId` see whether `targetId` is online? */
async function canViewOnlineStatus(viewerId, targetId, trx) {
  if (sameId(viewerId, targetId)) return true;
  const [settings, relationship] = await Promise.all([getPrivacySettings(targetId, trx), relationshipOf(viewerId, targetId, trx)]);
  return allowedFields(settings, relationship).onlineStatus;
}

/** May the viewer see the full profile (match details / profile page)? */
async function canViewProfile(viewerId, targetId, trx) {
  const [settings, relationship] = await Promise.all([getPrivacySettings(targetId, trx), relationshipOf(viewerId, targetId, trx)]);
  return profileVisibleTo(settings, relationship);
}

module.exports = {
  getPrivacySettings,
  updatePrivacySettings,
  settingsFor,
  relationshipsFor,
  relationshipOf,
  canViewProfile,
  canViewOnlineStatus,
  cardsFor,
  cardFor,
  visibleProfile,
  recommendationContext,
  filterMatchItem,
  allowedFields,
  SETTINGS,
  DEFAULTS,
  LEVELS,
  RELATIONSHIP,
};
