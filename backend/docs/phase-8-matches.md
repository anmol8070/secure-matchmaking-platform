# Phase 8 — Match Ranking & Recommended Profiles

## Overview

Phase 8 implements the deterministic recommendation pipeline that ranks eligible
candidate users by their Phase 7 compatibility score and exposes the results
through two REST endpoints.

**No ML is used in Phase 8.** Adaptive ML-based ranking is reserved for Phase 9.

---

## Architecture

```
GET /api/v1/matches            GET /api/v1/matches/:userId
         │                              │
         ▼                              ▼
   matchController.js           matchController.js
   getMatches()                 getMatchWithUser()
         │                              │
         ▼                              ▼
recommendationService.js        recommendationService.js
getRecommendations()            getMatchDetails()
    │    │                          │    │
    │    └── filters (location,     │    └── block check
    │         age, edu, lifestyle)  │         active-profile check
    │                               │
    ▼                               ▼
matchingService.js              matchingService.js
calculateCompatibility()        calculateCompatibility()
    │                               │
    ▼                               ▼
matches table (upsert)          matches table (upsert)
```

**Responsibility separation:**

| Layer | Responsibility |
|---|---|
| `matchController.js` | HTTP only — parses request, calls service, sends response |
| `recommendationService.js` | Candidate selection, block/active filtering, ranking, pagination, match details |
| `matchingService.js` | Phase 7 compatibility formula (unchanged from Phase 7) |
| `feedbackService.js` | Interaction event logging for Phase 9 ML |
| `profileModel.js` | Candidate pool query (eligible + active accounts) |
| `blockModel.js` | Bidirectional block resolution |

---

## Endpoints

### `GET /api/v1/matches`

Returns a paginated, deterministically ranked list of recommended candidates.

**Authentication:** Required (Bearer token)

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer ≥ 1 | 1 | Page number |
| `limit` | integer 1–100 | 20 | Results per page |
| `location` | string | — | Filter by city / state / country (substring, case-insensitive) |
| `minAge` | integer 18–120 | — | Minimum candidate age |
| `maxAge` | integer 18–120 | — | Maximum candidate age |
| `education` | string | — | Filter by education (substring) |
| `lifestyle` | string | — | Filter by lifestyle (substring) |

> **Important:** Filters narrow the candidate pool **before** ranking.
> They do **not** alter the Phase 7 compatibility formula or weights.

**Ranking algorithm:** `compatibilityScore DESC`, then `userId ASC` (stable tiebreak).

**Success response — 200:**

```json
{
  "success": true,
  "message": "Request successful",
  "data": {
    "recommendations": [
      {
        "userId": 42,
        "profile": {
          "name": "Alice",
          "age": 29,
          "gender": "Female",
          "location": "San Francisco, CA, USA",
          "education": "Master of Science",
          "occupation": "Software Engineer",
          "lifestyle": "Active",
          "bio": "Love hiking and music.",
          "profilePicture": "http://localhost:5000/media/alice.jpg"
        },
        "compatibilityScore": 88,
        "commonHobbies": ["Hiking", "Music"],
        "whyThisMatch": [
          "You both live in San Francisco",
          "You share 2 hobbies: Hiking, Music",
          "Your lifestyle preferences match (Active)"
        ],
        "scoreBreakdown": {
          "locationAndAge": 22,
          "preferencesAndLifestyle": 20,
          "hobbyOverlap": 22.5,
          "quizSimilarity": 23.5,
          "location": { "similarity": 1.0, "weight": 10, "contribution": 10 },
          "age":      { "similarity": 0.8, "weight": 15, "contribution": 12 },
          "education": { "similarity": 1.0, "weight": 6,  "contribution": 6  },
          "occupation": { "similarity": 1.0, "weight": 6,  "contribution": 6  },
          "lifestyle":  { "similarity": 1.0, "weight": 6,  "contribution": 6  },
          "food":       { "similarity": 0.71, "weight": 7,  "contribution": 5  },
          "hobbies":    { "similarity": 0.5, "weight": 25, "contribution": 12.5 },
          "quiz":       { "similarity": 0.9, "weight": 25, "contribution": 22.5 },
          "details": { "hobbyJaccard": 0.5, "quizAgreement": 0.9 }
        },
        "mlFeatures": {
          "compatibilityScore": 0.88,
          "locationSimilarity": 1.0,
          "ageSimilarity": 0.8,
          "educationSimilarity": 1.0,
          "occupationSimilarity": 1.0,
          "lifestyleSimilarity": 1.0,
          "foodSimilarity": 0.71,
          "hobbyJaccard": 0.5,
          "quizSimilarity": 0.9,
          "commonHobbiesCount": 2
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 47,
      "totalPages": 3
    }
  }
}
```

**Empty response — 200:**

```json
{
  "success": true,
  "data": {
    "recommendations": [],
    "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
  }
}
```

**Error responses:**

| Status | Condition |
|---|---|
| 401 | Missing or invalid access token |
| 422 | Invalid query parameter (e.g. limit > 100, non-integer page) |
| 500 | Unexpected server error |

---

### `GET /api/v1/matches/:userId`

Returns full compatibility details for a specific candidate.

Also records a `profile_view` interaction event in `activity_feedback` (fire-and-forget, for Phase 9 ML).

**Authentication:** Required (Bearer token)

**Path parameters:**

| Parameter | Type | Description |
|---|---|---|
| `userId` | integer (positive) | Target candidate's user ID |

**Guards before returning data:**
1. Cannot request a match with yourself → 400
2. Block check (either direction) → 403
3. Candidate must have an active account + profile → 404

**Success response — 200:** Same structure as a single `recommendations[]` item above.

**Error responses:**

| Status | Condition |
|---|---|
| 400 | `userId` equals your own user ID |
| 401 | Missing or invalid access token |
| 403 | Either user has blocked the other |
| 404 | Candidate profile not found or account inactive |
| 422 | `userId` is not a valid positive integer |

---

## Candidate Selection Logic

```
All users
  ├── JOIN profiles (only users with a profile)
  ├── WHERE users.status = 'active'
  ├── WHERE profiles.user_id ≠ requesting user_id
  └── WHERE profiles.user_id NOT IN (blocked_by_me ∪ blocked_me)
         └── Optional in-memory filters (location, age, education, lifestyle)
```

## Caching / Recalculation

- `matchingService.calculateCompatibility()` always runs the full Phase 7 calculation.
- The result is **upserted** into the `matches` table (`user1_id`, `user2_id` unique constraint).
- When a user updates their profile, preferences, or hobbies, the next recommendation
  request automatically recalculates compatibility because `calculateCompatibility` is
  called fresh on every request.
- There is no in-process cache (Redis etc.) in Phase 8. The `matches` table row stores
  the last-computed value; duplicate records are prevented by the unique constraint.

## Privacy & Security

- Passwords, OTP hashes, session tokens and internal IDs are never included in responses.
- Only profile fields intentionally public (`name`, `age`, `location`, `education`,
  `occupation`, `lifestyle`, `bio`, `profilePicture`) are returned.
- Blocked users are excluded **before** any compatibility calculation.
- Inactive / deleted accounts are excluded at the database level.
- All query parameters are validated with Zod; invalid values return 422.
- Pagination is capped at `RECOMMENDATION_MAX_LIMIT` (default 100).

---

## Phase 9 ML Preparation

Every recommendation and match-detail response includes an `mlFeatures` object:

```json
"mlFeatures": {
  "compatibilityScore":    0.88,   // normalized 0–1
  "locationSimilarity":    1.0,
  "ageSimilarity":         0.8,
  "educationSimilarity":   1.0,
  "occupationSimilarity":  1.0,
  "lifestyleSimilarity":   1.0,
  "foodSimilarity":        0.71,
  "hobbyJaccard":          0.5,
  "quizSimilarity":        0.9,
  "commonHobbiesCount":    2
}
```

Interaction events are logged to `activity_feedback` with these action types:

| Action (DB canonical) | Triggered by |
|---|---|
| `profile_view` | GET /api/v1/matches/:userId |
| `interest` | POST /api/v1/feedback with action=interest or action=like |
| `connection_request` | POST /api/v1/connections/requests |
| `connection_accepted` | PATCH /api/v1/connections/requests/:id with status=accepted |
| `rejection` | PATCH /api/v1/connections/requests/:id with status=rejected |
| `feedback` | POST /api/v1/feedback with action=feedback |

These events, combined with the `mlFeatures` vector, provide all data Phase 9 needs
for training a Logistic Regression model on interaction outcomes.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `RECOMMENDATION_DEFAULT_LIMIT` | `20` | Default page size |
| `RECOMMENDATION_MAX_LIMIT` | `100` | Maximum allowed `?limit` value |

---

## Files Modified / Created

### Backend

| File | Change |
|---|---|
| `src/services/recommendationService.js` | **Rewritten** — candidate filtering, ranking, mlFeatures, getMatchDetails |
| `src/services/feedbackService.js` | **Rewritten** — fixed DB enum mismatch, added recordInteractionEvent, alias mapping |
| `src/controllers/matchController.js` | **Rewritten** — uses getMatchDetails, logs profile_view |
| `src/routes/matchRoutes.js` | **Updated** — added filter query schema |
| `src/routes/feedbackRoutes.js` | **Updated** — accepts canonical + alias action values |
| `src/models/profileModel.js` | **Updated** — added getActiveProfileById |
| `src/config/environment.js` | **Updated** — added recommendation config block |
| `.env.example` | **Updated** — documented Phase 8 env vars |
| `tests/phase8Recommendations.test.js` | **New** — 22 tests covering all acceptance criteria |
| `tests/phase7RecommendationService.test.js` | **Updated** — aligned with Phase 8 API shape |
| `tests/phase7MatchingService.test.js` | **Fixed** — corrected hobby mock method name |

### Frontend

| File | Change |
|---|---|
| `src/pages/user/matches/RecommendedMatches.jsx` | **Rewritten** — premium UI with score rings, filter panel, skeleton loading, modal |
| `src/pages/user/Dashboard.jsx` | **Updated** — added "Find Matches" card linking to /matches |

---

## Known Limitations

1. **No server-side staleness detection** — if a user updates their profile mid-session,
   the stale score remains in `matches` until the next `calculateCompatibility` call.
   Phase 9 may add explicit invalidation triggers.

2. **In-memory filters** — location / age / education / lifestyle filters are applied
   in JavaScript after fetching all eligible candidates. For very large user bases,
   these should be pushed into the SQL query for performance.

3. **Sequential compatibility calculation** — `Promise.all` is used but all candidates
   are scored before pagination. For large candidate pools, a future optimisation could
   score only the page window using pre-existing `matches` rows as a fast-path.

4. **`sharp` module on some Windows systems** — the `server.test.js` suite fails on
   machines with insufficient virtual memory due to a system-level `ERR_DLOPEN_FAILED`
   from `sharp`. This is unrelated to Phase 8 and pre-existed in Phase 7.
