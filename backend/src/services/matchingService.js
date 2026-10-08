/**
 * Phase 7/8 Matching & Compatibility Scoring Engine.
 *
 * Calculates deterministic compatibility scores (0–100), detailed score breakdowns,
 * common hobbies, and data-backed explainability ("Why this match?") between user pairs.
 * Stores/upserts results in the `matches` table.
 */

const { Profile, Preference, UserHobby, QuizAnswer, Match } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Computes age from a Date of Birth string or Date object.
 */
function calculateAge(dob) {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * Calculates location and age alignment score (0 - 25 pts).
 */
function calculateLocationAndAgeScore(p1, pref1, p2) {
  let locationScore = 0;
  if (p1 && p2) {
    if (p1.city && p2.city && p1.city.toLowerCase() === p2.city.toLowerCase()) {
      locationScore = 10;
    } else if (p1.state && p2.state && p1.state.toLowerCase() === p2.state.toLowerCase()) {
      locationScore = 8;
    } else if (p1.country && p2.country && p1.country.toLowerCase() === p2.country.toLowerCase()) {
      locationScore = 5;
    } else {
      locationScore = 2;
    }

    if (pref1 && pref1.preferred_location && p2.city) {
      if (p2.city.toLowerCase().includes(pref1.preferred_location.toLowerCase())) {
        locationScore = Math.min(10, locationScore + 2);
      }
    }
  } else {
    locationScore = 5;
  }

  let ageScore = 15;
  const age2 = p2 ? calculateAge(p2.date_of_birth) : null;
  if (age2 !== null && pref1) {
    const minAge = pref1.partner_min_age || 18;
    const maxAge = pref1.partner_max_age || 100;
    if (age2 < minAge) {
      const diff = minAge - age2;
      ageScore = Math.max(0, 15 - diff * 3);
    } else if (age2 > maxAge) {
      const diff = age2 - maxAge;
      ageScore = Math.max(0, 15 - diff * 3);
    }
  }

  return {
    score: Math.round(locationScore + ageScore),
    breakdown: { location: locationScore, age: ageScore },
  };
}

/**
 * Calculates preference and lifestyle alignment score (0 - 25 pts).
 */
function calculatePreferencesAndLifestyleScore(pref1, p2) {
  let foodScore = 5;
  let lifestyleScore = 5;
  let eduScore = 5;
  let occScore = 5;

  if (pref1 && p2) {
    if (pref1.food_preference && p2.lifestyle) {
      if (pref1.food_preference.toLowerCase() === p2.lifestyle.toLowerCase()) foodScore = 7;
    }
    if (pref1.lifestyle_preference && p2.lifestyle) {
      if (pref1.lifestyle_preference.toLowerCase() === p2.lifestyle.toLowerCase()) lifestyleScore = 6;
    }
    if (pref1.preferred_education && p2.education) {
      if (p2.education.toLowerCase().includes(pref1.preferred_education.toLowerCase())) eduScore = 6;
    }
    if (pref1.preferred_occupation && p2.occupation) {
      if (p2.occupation.toLowerCase().includes(pref1.preferred_occupation.toLowerCase())) occScore = 6;
    }
  }

  const total = foodScore + lifestyleScore + eduScore + occScore;
  return {
    score: Math.min(25, Math.round(total)),
    breakdown: { food: foodScore, lifestyle: lifestyleScore, education: eduScore, occupation: occScore },
  };
}

/**
 * Calculates hobby Jaccard similarity score (0 - 25 pts).
 */
function calculateHobbyScore(hobbies1, hobbies2) {
  const set1 = new Set(hobbies1.map((h) => h.hobby_id));
  const set2 = new Set(hobbies2.map((h) => h.hobby_id));
  if (set1.size === 0 && set2.size === 0) {
    return { score: 12.5, jaccard: 0.5 };
  }

  const intersection = new Set([...set1].filter((h) => set2.has(h)));
  const union = new Set([...set1, ...set2]);
  const jaccard = union.size > 0 ? intersection.size / union.size : 0;
  return {
    score: Math.round(jaccard * 25 * 10) / 10,
    jaccard,
  };
}

/**
 * Calculates compatibility quiz vector similarity score (0 - 25 pts).
 */
function calculateQuizScore(quiz1, quiz2) {
  if (!quiz1.length || !quiz2.length) {
    return { score: 12.5, similarity: 0.5 };
  }

  const qMap2 = new Map(quiz2.map((q) => [q.question_id, q.answer]));
  let shared = 0;
  let matches = 0;

  for (const q1 of quiz1) {
    if (qMap2.has(q1.question_id)) {
      shared++;
      if (q1.answer === qMap2.get(q1.question_id)) {
        matches++;
      }
    }
  }

  if (shared === 0) return { score: 12.5, similarity: 0.5 };
  const similarity = matches / shared;
  return {
    score: Math.round(similarity * 25 * 10) / 10,
    similarity,
  };
}

/**
 * Generates data-driven explainability statements ("Why this match?").
 */
function generateWhyThisMatch({ locAge, prefLife, hobbyRes, quizRes, p1, p2, pref1, commonHobbies }) {
  const reasons = [];

  if (p1 && p2) {
    if (p1.city && p2.city && p1.city.toLowerCase() === p2.city.toLowerCase()) {
      reasons.push(`You both live in ${p1.city}`);
    } else if (p1.state && p2.state && p1.state.toLowerCase() === p2.state.toLowerCase()) {
      reasons.push(`You both live in ${p1.state}`);
    } else if (p1.country && p2.country && p1.country.toLowerCase() === p2.country.toLowerCase()) {
      reasons.push(`You both live in ${p1.country}`);
    }
  }

  if (commonHobbies.length > 0) {
    reasons.push(
      `You share ${commonHobbies.length} hobby${commonHobbies.length > 1 ? 'ies' : ''}: ${commonHobbies
        .slice(0, 3)
        .join(', ')}`
    );
  }

  if (
    pref1?.lifestyle_preference &&
    p2?.lifestyle &&
    pref1.lifestyle_preference.toLowerCase() === p2.lifestyle.toLowerCase()
  ) {
    reasons.push(`Your lifestyle preferences match (${p2.lifestyle})`);
  }

  if (
    pref1?.food_preference &&
    p2?.lifestyle &&
    pref1.food_preference.toLowerCase() === p2.lifestyle.toLowerCase()
  ) {
    reasons.push(`Your food & diet preferences align`);
  }

  if (
    pref1?.preferred_education &&
    p2?.education &&
    p2.education.toLowerCase().includes(pref1.preferred_education.toLowerCase())
  ) {
    reasons.push(`Education background matches your preference (${p2.education})`);
  }

  if (
    pref1?.preferred_occupation &&
    p2?.occupation &&
    p2.occupation.toLowerCase().includes(pref1.preferred_occupation.toLowerCase())
  ) {
    reasons.push(`Occupation matches your preference (${p2.occupation})`);
  }

  if (locAge.breakdown.age >= 12) {
    reasons.push(`Age fits within your preferred partner age range`);
  }

  if (quizRes.similarity >= 0.7) {
    reasons.push(`High compatibility quiz answer agreement (${Math.round(quizRes.similarity * 100)}%)`);
  }

  return reasons;
}

/**
 * Calculates the total Phase 7 compatibility score between user 1 and user 2.
 */
async function calculateCompatibility(user1Id, user2Id, trx) {
  const [p1, p2, pref1, hobbies1, hobbies2, quiz1, quiz2] = await Promise.all([
    Profile.findByPk(user1Id, trx),
    Profile.findByPk(user2Id, trx),
    Preference.findByPk(user1Id, trx),
    UserHobby.getUserHobbiesWithNames(user1Id, trx),
    UserHobby.getUserHobbiesWithNames(user2Id, trx),
    QuizAnswer.getUserAnswers(user1Id, trx),
    QuizAnswer.getUserAnswers(user2Id, trx),
  ]);

  if (!p2) {
    throw ApiError.notFound('Target user profile not found');
  }

  const hSet2Names = new Map(hobbies2.map((h) => [h.hobby_id, h.hobby_name]));
  const commonHobbies = hobbies1
    .filter((h) => hSet2Names.has(h.hobby_id))
    .map((h) => h.hobby_name);

  const locAge = calculateLocationAndAgeScore(p1, pref1, p2);
  const prefLife = calculatePreferencesAndLifestyleScore(pref1, p2);
  const hobbyRes = calculateHobbyScore(hobbies1, hobbies2);
  const quizRes = calculateQuizScore(quiz1, quiz2);

  const totalScore = Math.min(
    100,
    Math.max(0, Math.round(locAge.score + prefLife.score + hobbyRes.score + quizRes.score))
  );

  const whyThisMatch = generateWhyThisMatch({
    locAge,
    prefLife,
    hobbyRes,
    quizRes,
    p1,
    p2,
    pref1,
    commonHobbies,
  });

  const scoreBreakdown = {
    locationAndAge: locAge.score,
    preferencesAndLifestyle: prefLife.score,
    hobbyOverlap: hobbyRes.score,
    quizSimilarity: quizRes.score,
    location: {
      similarity: locAge.breakdown.location / 10,
      weight: 10,
      contribution: locAge.breakdown.location,
    },
    age: {
      similarity: locAge.breakdown.age / 15,
      weight: 15,
      contribution: locAge.breakdown.age,
    },
    education: {
      similarity: prefLife.breakdown.education / 6,
      weight: 6,
      contribution: prefLife.breakdown.education,
    },
    occupation: {
      similarity: prefLife.breakdown.occupation / 6,
      weight: 6,
      contribution: prefLife.breakdown.occupation,
    },
    lifestyle: {
      similarity: prefLife.breakdown.lifestyle / 6,
      weight: 6,
      contribution: prefLife.breakdown.lifestyle,
    },
    food: {
      similarity: prefLife.breakdown.food / 7,
      weight: 7,
      contribution: prefLife.breakdown.food,
    },
    hobbies: {
      similarity: hobbyRes.jaccard,
      weight: 25,
      contribution: hobbyRes.score,
    },
    quiz: {
      similarity: quizRes.similarity,
      weight: 25,
      contribution: quizRes.score,
    },
    details: {
      hobbyJaccard: hobbyRes.jaccard,
      quizAgreement: quizRes.similarity,
    },
  };

  await Match.upsertMatch(user1Id, user2Id, totalScore, scoreBreakdown, trx);

  return {
    user1Id,
    user2Id,
    score: totalScore,
    commonHobbies,
    whyThisMatch,
    scoreBreakdown,
  };
}

/**
 * Retrieves calculated matches for a user.
 */
async function getMatches(userId, { page = 1, limit = 20 } = {}, trx) {
  const offset = (page - 1) * limit;
  const matches = await Match.findByUser(userId, limit, offset, trx);
  return {
    matches,
    page,
    limit,
  };
}

/**
 * Calculates and returns match details between current user and a target user.
 */
async function getMatchWithUser(userId, targetUserId, trx) {
  if (Number(userId) === Number(targetUserId)) {
    throw ApiError.badRequest('Cannot compute compatibility with yourself');
  }

  const p2 = await Profile.findByPk(targetUserId, trx);
  if (!p2) {
    throw ApiError.notFound('Target user profile not found');
  }

  const comp = await calculateCompatibility(userId, targetUserId, trx);

  return {
    userId: targetUserId,
    profile: {
      name: p2.name,
      age: calculateAge(p2.date_of_birth),
      location: [p2.city, p2.state, p2.country].filter(Boolean).join(', '),
      education: p2.education,
      occupation: p2.occupation,
      lifestyle: p2.lifestyle,
      bio: p2.bio,
      profilePicture: p2.profile_photo_url,
    },
    compatibilityScore: comp.score,
    commonHobbies: comp.commonHobbies,
    whyThisMatch: comp.whyThisMatch,
    scoreBreakdown: comp.scoreBreakdown,
  };
}

module.exports = {
  calculateCompatibility,
  getMatches,
  getMatchWithUser,
};
