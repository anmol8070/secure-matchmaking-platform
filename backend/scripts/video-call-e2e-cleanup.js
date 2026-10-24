/**
 * Deletes the throw-away users created by scripts/video-call-e2e.js
 * (emails e2e_video_<label>_<timestamp>@example.com) and their rows.
 * Refuses to run in production.
 */
const config = require('../src/config/environment');
const { getDb, closeConnection } = require('../src/config/database');

const PATTERN = /^e2e_video_[a-z]+_\d+@example\.com$/;

(async () => {
  if (config.isProduction) throw new Error('Refusing to delete users in production.');
  const db = getDb();
  const ids = (await db('users').where('email', 'like', 'e2e\\_video\\_%@example.com').select('user_id', 'email'))
    .filter((u) => PATTERN.test(u.email))
    .map((u) => u.user_id);
  if (!ids.length) {
    console.log('No e2e users found.');
    return;
  }
  await db.transaction(async (trx) => {
    await trx('video_calls').whereIn('caller_id', ids).orWhereIn('receiver_id', ids).del();
    await trx('messages').whereIn('sender_id', ids).orWhereIn('receiver_id', ids).del();
    await trx('activity_feedback').whereIn('user_id', ids).orWhereIn('target_user_id', ids).del();
    await trx('connection_requests').whereIn('sender_id', ids).orWhereIn('receiver_id', ids).del();
    await trx('blocks').whereIn('blocker_id', ids).orWhereIn('blocked_id', ids).del();
    await trx('users').whereIn('user_id', ids).del();
  });
  console.log(`Deleted ${ids.length} e2e user(s).`);
})()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => closeConnection());
