/**
 * Phase 14 — admin panel: user management, dashboard statistics, activity
 * series, platform health and ML monitoring.
 *
 * Every function here is reached only through /api/v1/admin/*, which runs
 * requireAuth + requireRole('admin') (fresh role and status from the
 * database on every request). Statistics are aggregate SQL (COUNT/GROUP BY)
 * on indexed columns — no table is loaded into memory to be counted, and no
 * message text, password hash, OTP, token or secret is ever selected.
 *
 * Account status rules (admin panel):
 *   active    → suspended   (reason required; sessions revoked, sockets
 *                            disconnected, active call ended immediately)
 *   suspended → active      (the user signs in again)
 * Nothing else can be changed here: no deletion or permanent ban, an admin
 * cannot change their own status, and admin accounts cannot be suspended
 * from the panel (prevents lock-out and admin-on-admin abuse).
 */
const config = require('../config/environment');
const { getDb } = require('../config/database');
const { User, Profile, Report } = require('../models');
const auditService = require('./auditService');
const callService = require('./callService');
const realtime = require('../sockets/realtime');
const redisConfig = require('../config/redis');
const MlModel = require('../models/mlModel');
const { ageFromDateOfBirth } = require('../utils/age');
const { toPublicUrl } = require('./storage');
const { withLockRetry } = require('../utils/dbErrors');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

const DAY_MS = 24 * 60 * 60 * 1000;
const toIso = (value) => (value ? new Date(value).toISOString() : null);
const num = (value) => Number(value) || 0;

/* ---------------- helpers ---------------- */

/** Mobile numbers are shown masked in lists (last 3 digits). */
function maskMobile(mobile) {
  if (!mobile) return null;
  return `${'•'.repeat(Math.max(0, mobile.length - 3))}${mobile.slice(-3)}`;
}

/** Escapes LIKE wildcards so a search term is matched literally. */
const likeTerm = (term) => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Resolves { from, to } (YYYY-MM-DD, inclusive) into a validated UTC range. */
function resolveRange({ from, to } = {}, now = new Date()) {
  const end = to ? new Date(`${to}T23:59:59.999Z`) : now;
  const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date(end.getTime() - 29 * DAY_MS);
  start.setUTCHours(0, 0, 0, 0);
  if (start > end) throw ApiError.validation([{ field: 'query.from', message: '"from" must be on or before "to"' }]);
  if ((end - start) / DAY_MS > config.admin.maxRangeDays) {
    throw ApiError.validation([{ field: 'query.from', message: `The range cannot exceed ${config.admin.maxRangeDays} days` }]);
  }
  return { start, end };
}

async function countBy(table, column, trx) {
  const rows = await (trx || getDb())(table).select(column).count({ n: '*' }).groupBy(column);
  return Object.fromEntries(rows.map((r) => [r[column], num(r.n)]));
}

const countWhere = async (query) => num((await query.count({ n: '*' }).first()).n);

/* ---------------- dashboard ---------------- */

/** Real aggregate statistics; the period defaults to the last 30 days. */
async function getDashboard(range = {}) {
  const { start, end } = resolveRange(range);
  const db = getDb();
  const inPeriod = (table, column) => db(table).whereBetween(column, [start, end]);

  const [usersByStatus, usersByRole, newUsers, reportsByStatus, reportsInPeriod, connectionsByStatus, requestsInPeriod, messagesTotal, messagesInPeriod, callsByStatus, callsInPeriod] =
    await Promise.all([
      countBy('users', 'status'),
      countBy('users', 'role'),
      countWhere(inPeriod('users', 'created_at')),
      countBy('reports', 'status'),
      countWhere(inPeriod('reports', 'created_at')),
      countBy('connection_requests', 'status'),
      countWhere(db('activity_feedback').where({ action: 'connection_request' }).whereBetween('created_at', [start, end])),
      countWhere(db('messages')),
      countWhere(inPeriod('messages', 'sent_at')),
      countBy('video_calls', 'status'),
      countWhere(inPeriod('video_calls', 'created_at')),
    ]);

  const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
  return {
    period: { from: start.toISOString(), to: end.toISOString() },
    users: {
      total: sum(usersByStatus),
      active: usersByStatus.active || 0,
      suspended: usersByStatus.suspended || 0,
      pendingVerification: usersByStatus.pending_verification || 0,
      deactivated: usersByStatus.deactivated || 0,
      admins: usersByRole.admin || 0,
      newInPeriod: newUsers,
    },
    reports: {
      total: sum(reportsByStatus),
      pending: reportsByStatus.pending || 0,
      underReview: reportsByStatus.under_review || 0,
      resolved: reportsByStatus.resolved || 0,
      dismissed: reportsByStatus.dismissed || 0,
      submittedInPeriod: reportsInPeriod,
    },
    connections: {
      active: connectionsByStatus.accepted || 0,
      pendingRequests: connectionsByStatus.pending || 0,
      requestsInPeriod,
    },
    // Counts only — message content is never read here.
    messages: { total: messagesTotal, inPeriod: messagesInPeriod },
    calls: {
      total: sum(callsByStatus),
      inPeriod: callsInPeriod,
      completed: callsByStatus.ended || 0,
      missed: callsByStatus.missed || 0,
      ongoing: (callsByStatus.ringing || 0) + (callsByStatus.accepted || 0) + (callsByStatus.connected || 0),
    },
  };
}

/* ---------------- activity (daily series from recorded events) ---------------- */

const SERIES = [
  ['registrations', 'users', 'created_at', null],
  ['connectionRequests', 'activity_feedback', 'created_at', (q) => q.where({ action: 'connection_request' })],
  ['acceptedConnections', 'activity_feedback', 'created_at', (q) => q.where({ action: 'connection_accepted' })],
  ['reportsSubmitted', 'reports', 'created_at', null],
  ['reportsClosed', 'reports', 'reviewed_at', (q) => q.whereIn('status', ['resolved', 'dismissed'])],
  ['messages', 'messages', 'sent_at', null],
  ['calls', 'video_calls', 'created_at', null],
];

/** Per-day counts (UTC) for the range, with every day present (zeros filled). */
async function getActivity(range = {}) {
  const { start, end } = resolveRange(range);
  const db = getDb();
  const days = [];
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) days.push(new Date(t).toISOString().slice(0, 10));

  const results = await Promise.all(
    SERIES.map(async ([, table, column, where]) => {
      const q = db(table).select(db.raw('DATE(??) AS day', [column])).count({ n: '*' }).whereBetween(column, [start, end]).groupByRaw('DATE(??)', [column]);
      if (where) where(q);
      const rows = await q;
      return new Map(rows.map((r) => [String(r.day instanceof Date ? r.day.toISOString() : r.day).slice(0, 10), num(r.n)]));
    })
  );
  const series = Object.fromEntries(SERIES.map(([name], i) => [name, days.map((day) => results[i].get(day) || 0)]));
  const totals = Object.fromEntries(Object.entries(series).map(([name, values]) => [name, values.reduce((a, b) => a + b, 0)]));
  return { period: { from: start.toISOString(), to: end.toISOString() }, days, series, totals };
}

/* ---------------- users ---------------- */

function userSummary(row) {
  return {
    userId: Number(row.user_id),
    name: row.name || null,
    email: row.email || null,
    mobile: maskMobile(row.mobile),
    role: row.role,
    status: row.status,
    createdAt: toIso(row.created_at),
    lastLoginAt: toIso(row.last_login_at),
    openReports: num(row.open_reports),
  };
}

/** Paginated user list with optional status/role filter and search (email, mobile, name, id). */
async function listUsers({ page, limit, status, role, search }) {
  const db = getDb();
  const openReports = db('reports').count('*').whereRaw('reports.reported_id = users.user_id').whereIn('status', ['pending', 'under_review']).as('open_reports');
  const filtered = () => {
    const q = db('users').leftJoin('profiles', 'profiles.user_id', 'users.user_id');
    if (status) q.where('users.status', status);
    if (role) q.where('users.role', role);
    if (search) {
      const term = likeTerm(search);
      q.where((w) => {
        w.where('users.email', 'like', term).orWhere('users.mobile', 'like', term).orWhere('profiles.name', 'like', term);
        if (/^\d{1,18}$/.test(search)) w.orWhere('users.user_id', Number(search));
      });
    }
    return q;
  };
  const [rows, count] = await Promise.all([
    filtered()
      .select('users.user_id', 'users.email', 'users.mobile', 'users.role', 'users.status', 'users.created_at', 'users.last_login_at', 'profiles.name', openReports)
      .orderBy('users.user_id', 'desc')
      .limit(limit)
      .offset((page - 1) * limit),
    filtered().count({ n: 'users.user_id' }).first(),
  ]);
  const total = num(count.n);
  return { users: rows.map(userSummary), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

/**
 * One account for moderation: account state, profile content (no exact
 * date of birth), aggregate counts and the admin history of the account.
 * Never: password hash, OTPs, sessions/tokens, message or call content.
 */
async function getUser(userId) {
  const db = getDb();
  const user = await User.findByPk(userId);
  if (!user) throw ApiError.notFound('User not found.');
  const profile = await Profile.findByPk(userId);

  const [connectionCounts, reportsAgainst, reportsFiled, blockedBy, messagesSent, calls, history] = await Promise.all([
    db('connection_requests')
      .where((q) => q.where({ sender_id: userId }).orWhere({ receiver_id: userId }))
      .select('status')
      .count({ n: '*' })
      .groupBy('status'),
    db('reports').where({ reported_id: userId }).select('status').count({ n: '*' }).groupBy('status'),
    countWhere(db('reports').where({ reporter_id: userId })),
    countWhere(db('blocks').where({ blocked_id: userId })),
    countWhere(db('messages').where({ sender_id: userId })),
    countWhere(db('video_calls').where((q) => q.where({ caller_id: userId }).orWhere({ receiver_id: userId }))),
    auditService.list({ page: 1, limit: 20, targetType: auditService.TARGETS.USER, targetId: userId }),
  ]);
  const byStatus = (rows) => Object.fromEntries(rows.map((r) => [r.status, num(r.n)]));
  const reportsByStatus = byStatus(reportsAgainst);
  const connectionsByStatus = byStatus(connectionCounts);

  let profileView = null;
  if (profile) {
    const profileService = require('./profileService');
    const full = profileService.toResponse(profile);
    profileView = {
      name: profile.name,
      gender: profile.gender || null,
      age: ageFromDateOfBirth(profile.date_of_birth),
      location: [profile.city, profile.state, profile.country].filter(Boolean).join(', ') || null,
      education: profile.education || null,
      occupation: profile.occupation || null,
      lifestyle: profile.lifestyle || null,
      bio: profile.bio || null,
      profilePicture: toPublicUrl(profile.profile_photo_url),
      completion: full.profileCompletion,
    };
  }

  return {
    user: {
      userId: Number(user.user_id),
      email: user.email || null,
      mobile: user.mobile || null,
      role: user.role,
      status: user.status,
      emailVerified: Boolean(user.email_verified_at),
      mobileVerified: Boolean(user.mobile_verified_at),
      createdAt: toIso(user.created_at),
      lastLoginAt: toIso(user.last_login_at),
    },
    profile: profileView,
    stats: {
      connections: connectionsByStatus.accepted || 0,
      pendingRequests: connectionsByStatus.pending || 0,
      reportsAgainst: {
        total: Object.values(reportsByStatus).reduce((a, b) => a + b, 0),
        open: (reportsByStatus.pending || 0) + (reportsByStatus.under_review || 0),
        ...reportsByStatus,
      },
      reportsFiled,
      blockedByUsers: blockedBy,
      messagesSent,
      calls,
    },
    history: history.entries,
  };
}

const STATUS_RULES = Object.freeze({
  suspended: { from: ['active'], action: auditService.ACTIONS.USER_SUSPENDED },
  active: { from: ['suspended'], action: auditService.ACTIONS.USER_REACTIVATED },
});

/**
 * Suspends or reactivates an account (see module comment for the rules).
 * Suspension takes effect immediately: the status check in requireAuth and
 * the socket layer refuse the user, all sessions are revoked, open sockets
 * are disconnected and an active call is ended.
 */
async function updateUserStatus(adminId, userId, { status, reason = null, reportId = null }) {
  const rule = STATUS_RULES[status];
  if (!rule) throw ApiError.badRequest('Unsupported status.');
  if (Number(adminId) === Number(userId)) throw ApiError.badRequest('You cannot change your own account status.');

  const user = await User.findByPk(userId);
  if (!user || user.status === 'deleted') throw ApiError.notFound('User not found.');
  if (status === 'suspended' && user.role === 'admin') {
    throw ApiError.forbidden('Admin accounts cannot be suspended from the admin panel.');
  }
  if (!rule.from.includes(user.status)) {
    throw ApiError.conflict(`A ${user.status.replace('_', ' ')} account cannot be set to ${status}.`);
  }
  if (reportId) {
    const report = await Report.findByPk(reportId);
    if (!report || Number(report.reported_id) !== Number(userId)) {
      throw ApiError.validation([{ field: 'body.reportId', message: 'The report does not concern this user' }]);
    }
  }

  const now = new Date();
  await withLockRetry(() =>
    getDb().transaction(async (trx) => {
      const changed = await User.query(trx).where({ user_id: userId }).whereIn('status', rule.from).update({ status, updated_at: now });
      if (!changed) throw ApiError.conflict('The account status was changed by someone else. Reload and try again.');
      if (status === 'suspended') {
        await trx('user_sessions').where({ user_id: userId }).whereNull('revoked_at').update({ revoked_at: now });
      }
      await auditService.record(
        {
          adminId,
          action: rule.action,
          targetType: auditService.TARGETS.USER,
          targetId: userId,
          reason,
          metadata: { from: user.status, to: status, ...(reportId && { reportId: Number(reportId) }) },
        },
        trx
      );
    })
  );

  if (status === 'suspended') {
    realtime.disconnectUser(userId);
    await callService.endActiveCallOf(userId, 'account_suspended').catch((err) => logger.error('Ending call of suspended user failed', { error: err.name }));
  }
  logger.info('Account status changed by admin', { adminId: Number(adminId), userId: Number(userId), status });
  return (await getUser(userId)).user;
}

/* ---------------- platform health ---------------- */

async function getMonitoring() {
  const db = getDb();
  const started = Date.now();
  let database = { reachable: false, latencyMs: null };
  try {
    await db.raw('SELECT 1');
    database = { reachable: true, latencyMs: Date.now() - started };
  } catch {
    // reported as unreachable
  }
  const io = realtime.getServer();
  const activeCalls = database.reachable ? await countWhere(db('video_calls').whereIn('status', ['ringing', 'accepted', 'connected'])) : null;
  const memory = process.memoryUsage();
  return {
    uptimeSeconds: Math.round(process.uptime()),
    node: process.version,
    environment: config.nodeEnv,
    database,
    realtime: { socketServer: Boolean(io), connectedClients: io ? io.engine.clientsCount : 0, redisAdapter: redisConfig.isEnabled() },
    activeCalls,
    memoryMb: { rss: Math.round(memory.rss / 1048576), heapUsed: Math.round(memory.heapUsed / 1048576) },
    checkedAt: new Date().toISOString(),
  };
}

/* ---------------- ML monitoring (Phase 9 metadata only) ---------------- */

const MIN_RELIABLE_SAMPLES = 50;
const POSITIVE_ACTIONS = ['interest', 'connection_request', 'connection_accepted'];
const NEGATIVE_ACTIONS = ['rejection'];

function modelSummary(row) {
  const metric = (value) => (value === null || value === undefined ? null : Number(value));
  return {
    version: row.model_version,
    type: row.model_type,
    featureVersion: row.feature_version,
    status: row.status,
    trainedAt: toIso(row.trained_at),
    trainingSamples: num(row.training_samples),
    positiveSamples: num(row.positive_samples),
    negativeSamples: num(row.negative_samples),
    metrics: {
      precision: metric(row.precision),
      recall: metric(row.recall),
      f1Score: metric(row.f1_score),
      rocAuc: metric(row.roc_auc),
      precisionAtK: metric(row.precision_at_k),
      acceptanceRate: metric(row.acceptance_rate),
    },
  };
}

/**
 * Stored model metadata and aggregate interaction counts — never weights,
 * training rows or per-user data. Honest status when nothing is trained.
 */
async function getMlMonitoring() {
  const [models, interactions] = await Promise.all([MlModel.listModels(20), countBy('activity_feedback', 'action')]);
  const summaries = models.map(modelSummary);
  const active = summaries.find((m) => m.status === 'active') || null;
  const positive = POSITIVE_ACTIONS.reduce((a, k) => a + (interactions[k] || 0), 0);
  const negative = NEGATIVE_ACTIONS.reduce((a, k) => a + (interactions[k] || 0), 0);

  let status = 'trained';
  let message = null;
  if (!summaries.length) {
    status = 'not_trained';
    message = 'ML model not yet trained. Recommendations use the deterministic compatibility ranking.';
  } else if (!active) {
    status = 'no_active_model';
    message = 'No model is active. Recommendations use the deterministic compatibility ranking.';
  } else if (active.trainingSamples < MIN_RELIABLE_SAMPLES) {
    status = 'insufficient_data';
    message = `Insufficient interaction data for reliable evaluation (${active.trainingSamples} training samples; at least ${MIN_RELIABLE_SAMPLES} recommended).`;
  }
  return {
    status,
    message,
    activeModel: active,
    models: summaries,
    interactions: { byAction: interactions, positiveLabels: positive, negativeLabels: negative },
    baseline: null,
    baselineNote: 'A baseline (non-ML) evaluation is not recorded by the training pipeline, so no comparison is shown.',
  };
}

module.exports = {
  getDashboard,
  getActivity,
  listUsers,
  getUser,
  updateUserStatus,
  getMonitoring,
  getMlMonitoring,
  resolveRange,
  maskMobile,
};
