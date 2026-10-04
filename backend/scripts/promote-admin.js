/**
 * Grants the admin role to an existing, verified account.
 * There is deliberately no public admin sign-up.
 *
 *   npm run admin:promote -- admin@example.com
 *   npm run admin:promote -- 9876543210
 */
const { getDb, closeConnection } = require('../src/config/database');
const { parseIdentifier } = require('../src/utils/contact');

async function main() {
  const parsed = parseIdentifier(process.argv[2]);
  if (!parsed) throw new Error('Usage: npm run admin:promote -- <email or mobile of a registered user>');

  const db = getDb();
  const user = await db('users').where({ [parsed.channel]: parsed.value }).first();
  if (!user) throw new Error('No account found with that email/mobile. Register it first.');
  if (user.status !== 'active') throw new Error(`The account must be active (current status: ${user.status}).`);

  await db('users').where({ user_id: user.user_id }).update({ role: 'admin' });
  console.log(`User ${user.user_id} is now an admin.`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(closeConnection);
