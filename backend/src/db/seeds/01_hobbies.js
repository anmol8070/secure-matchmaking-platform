/**
 * Development/reference seed: master hobby list.
 * Idempotent — existing names are left untouched, so it is safe to re-run.
 * No users, matches or recommendation data are seeded.
 */
const HOBBIES = [
  'Reading',
  'Writing',
  'Music',
  'Singing',
  'Dancing',
  'Movies',
  'Photography',
  'Painting',
  'Cooking',
  'Baking',
  'Travelling',
  'Hiking',
  'Cycling',
  'Running',
  'Yoga',
  'Fitness',
  'Swimming',
  'Cricket',
  'Football',
  'Gaming',
  'Gardening',
  'Volunteering',
  'Meditation',
  'Technology',
];

exports.seed = async function seed(knex) {
  await knex('hobbies')
    .insert(HOBBIES.map((hobby_name) => ({ hobby_name })))
    .onConflict('hobby_name')
    .ignore();
};
