# Preferences, Hobbies & Quiz Answers

The preferences module (Phase 6) stores **what each user is looking for**, their **hobbies** and their **compatibility quiz answers**, as clean, structured data for the compatibility engine of the next phase.

**This phase never calculates anything.** There are no compatibility scores, weights, rankings or recommendations; tests check that responses contain none of them.

Related documents: [profile-management.md](profile-management.md) (the user's own details), [database-schema.md](database-schema.md), [api-architecture.md](api-architecture.md).

## 1. Data model

| Concept | Where | Notes |
| --- | --- | --- |
| Profile (who I am) | `profiles` | Phase 5. Not duplicated here |
| Preferences (what I look for) | `preferences` (1:1 with `users`) | Structured columns, listed below |
| Hobbies catalogue | `hobbies` | Seeded list; `status` active or inactive |
| My hobbies | `user_hobbies` (M:N) | Composite primary key `(user_id, hobby_id)`, so no duplicates |
| Quiz answers | `quiz_answers` | `UNIQUE (user_id, question_id)`, so one answer per question |

All four tables reference `users.user_id` (with `ON DELETE CASCADE`, owned data), and `user_hobbies.hobby_id` references `hobbies.hobby_id` (with `RESTRICT`). These foreign keys and indexes are from Phase 2 and are covered by the schema tests.

### Preferences columns

| API field | Column | Type | Validation |
| --- | --- | --- | --- |
| `preferredLocation` | `preferred_location` | text ≤150 | Letters, spaces, commas, `'`, `.`, `-` |
| `preferredEducation` | `preferred_education` | text ≤150 | No `<` or `>` (**new column, Phase 6**) |
| `preferredOccupation` | `preferred_occupation` | text ≤150 | No `<` or `>` (**new column, Phase 6**) |
| `preferredLifestyle` | `lifestyle_preference` | text ≤100 | No `<` or `>` |
| `preferredFood` | `food_preference` | option | `vegetarian`, `non_vegetarian`, `eggetarian`, `vegan`, `jain`, `no_preference` |
| `partnerMinAge` / `partnerMaxAge` | `partner_min_age` / `partner_max_age` | integer | 18–100, min ≤ max (also a database CHECK) |
| `preferredGenders` | `partner_preferences` JSON → `genders` | list | `female`, `male`, `non_binary`, `other`, unique |

Every field is optional, and `null` or `""` clears it. Text is sanitised the same way as profile fields (shared `validators/textFields.js`).

**Migration** `20261004001700_add_education_occupation_to_preferences.js` adds `preferred_education` and `preferred_occupation`. Phase 2 had only kept those inside the `partner_preferences` JSON; structured columns let the matching engine compare them field by field. No other table changed.

## 2. API

Every endpoint requires `Authorization: Bearer <access token>`; without one the response is `401 Authentication required`.

**The user is always the token's owner.** Strict schemas reject `user_id`, `userId`, `role` and every other unknown key with `422`, and a hobby can only be removed from the caller's own selection.

| Method | Path | Body | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/preferences` | — | `200` preferences + `hobbies` + `quizAnswers` (`isSet: false` before the first save) | — |
| POST | `/api/v1/preferences` | Preference fields, optional `hobbyIds`, `quizAnswers` | `201 Preferences saved successfully` | `409` (already exist), `422` |
| PUT | `/api/v1/preferences` | Any subset of the same fields | `200 Preferences updated successfully` | `404` (create first), `422` |
| GET | `/api/v1/preferences/options` | — | `200` option lists and limits for the UI | — |
| GET | `/api/v1/hobbies` | — | `200 [{ id, name }]`, active only, alphabetical | — |
| PUT | `/api/v1/preferences/hobbies` | `{ "hobbyIds": [1, 2, 6] }` (the complete new selection) | `200 Hobbies updated successfully` + `{ hobbies }` | `422` (unknown, inactive or duplicate ids; more than 20) |
| DELETE | `/api/v1/preferences/hobbies/:hobbyId` | — | `200 Hobby removed` + `{ hobbies }` | `404` (not in your list), `422` (bad id) |
| GET | `/api/v1/preferences/quiz` | — | `200 { questionnaire, answers }` | — |
| PUT | `/api/v1/preferences/quiz` | `{ "answers": [{ "questionId", "answer" }] }` | `200 Quiz answers saved successfully` | `422` |

### Example: one save for everything

```http
POST /api/v1/preferences
Authorization: Bearer <token>
Content-Type: application/json

{
  "preferredLocation": "Kolhapur, Maharashtra",
  "preferredEducation": "M.Tech",
  "preferredOccupation": "Software Developer",
  "preferredLifestyle": "Active",
  "preferredFood": "vegetarian",
  "partnerMinAge": 25,
  "partnerMaxAge": 32,
  "preferredGenders": ["male"],
  "hobbyIds": [3, 11],
  "quizAnswers": [{ "questionId": "weekend_style", "answer": "outdoors" }]
}
```

```json
{
  "success": true,
  "message": "Preferences saved successfully",
  "data": {
    "isSet": true,
    "preferredLocation": "Kolhapur, Maharashtra",
    "preferredEducation": "M.Tech",
    "preferredOccupation": "Software Developer",
    "preferredLifestyle": "Active",
    "preferredFood": "vegetarian",
    "partnerMinAge": 25,
    "partnerMaxAge": 32,
    "preferredGenders": ["male"],
    "hobbies": [{ "id": 11, "name": "Music" }, { "id": 3, "name": "Reading" }],
    "quizAnswers": [{ "questionId": "weekend_style", "answer": "outdoors" }],
    "createdAt": "2026-10-04T12:00:00.000Z",
    "updatedAt": "2026-10-04T12:00:00.000Z"
  }
}
```

### Transactions

`POST`/`PUT /preferences` write the preferences row, then the hobby selection, then the quiz answers, all **in one database transaction**. If any step fails, nothing is saved and the user's previous data is unchanged. Examples of a failing step: an inactive hobby, an invalid answer, or a database error.

Tests cover all three kinds of failure, including a simulated database error halfway through. `PUT /preferences/hobbies` and `PUT /preferences/quiz` are also all-or-nothing.

### Hobby selection rules

- **Ids only.** Hobbies are selected by id, never by name, and each id must exist and be **active**.
- **Replace semantics:** `PUT /preferences/hobbies` makes the stored set exactly the list sent. Changing "Reading + Coding" to "Travel + Music" leaves only Travel and Music. Unchanged rows are kept and removed rows are deleted; an empty list clears the selection.
- **No duplicates:** duplicate ids in a request are rejected, and the composite primary key makes duplicate rows impossible.
- **Limit:** at most 20 hobbies.
- **Deactivated hobbies:** if an admin later deactivates a hobby, it no longer appears in the user's list and cannot be selected again.

## 3. Compatibility quiz

The project document **does not define the questionnaire**. Instead of inventing one, the questions are **configuration**:

- File: `QUIZ_QUESTIONS_FILE` (default `backend/src/config/quiz-questions.json`).
- The file is validated when the server starts; the server refuses to start if it is missing or invalid. Checks: unique ids, valid types, 2–20 options per choice question, and a `status` of `sample`, `draft` or `approved`.
- The bundled file contains **4 sample questions** marked `"status": "sample"`, and the UI shows a "sample questions" notice. Replace the file once the real questionnaire is approved.
- **Keep question ids stable**, because stored answers refer to them. Answers to questions that are later removed from the file are ignored when reading.

| Question type | `answer` | Stored as |
| --- | --- | --- |
| `single_choice` | One option `value` | The value |
| `multiple_choice` | A list of option values: unique, non-empty, at most `maxSelections` | A JSON array string |
| `text` | Text up to `maxLength` (default 500, at most 1000); sanitised | Text |
| any | `null` | The answer is deleted |

A `PUT` only touches the questions it lists (insert or update per question). Sending the same question twice in one request returns `422 Each question can be answered only once`.

## 4. Frontend

| Path | Component | Purpose |
| --- | --- | --- |
| `/preferences` | `pages/user/preferences/PreferencesPage.jsx` | Three sections: preferences (`PreferenceForm`), hobbies (`HobbiesSelector`), quiz (`QuizQuestions`), plus one **Save preferences** button (single transactional request) |
| `/preferences/quiz` | `QuizPage.jsx` | Answer the quiz on its own (`PUT /preferences/quiz`) |

- **Data from the API:** option lists (`GET /preferences/options`), the hobby list (`GET /hobbies`) and the questions (`GET /preferences/quiz`) all come from the backend. **Nothing is hard-coded in React.**
- **Pre-filled:** saved values are filled in on load, and selected hobbies stay selected after a reload.
- **Hobby picker:** a checkbox grid, plus removable chips for the hobbies already selected. Checkboxes are disabled once the limit is reached.
- **Client-side validation:** lengths, `<` and `>`, age range and min ≤ max, quiz text length and selection limits. Server errors appear next to the related field, hobby list or quiz question.
- **Loading, success and error states**, using the same components and styles as Phase 5.
- **Navigation:** a "Preferences" item in the nav bar, and a card on the dashboard.

## 5. Ready for the compatibility engine (next phase)

The stored data maps directly onto the matching attributes named in the project:

| Attribute | Viewer's preference | Candidate's value (profile / own data) |
| --- | --- | --- |
| Location | `preferences.preferred_location` | `profiles.city / state / country` |
| Education | `preferences.preferred_education` | `profiles.education` |
| Occupation | `preferences.preferred_occupation` | `profiles.occupation` |
| Lifestyle | `preferences.lifestyle_preference` | `profiles.lifestyle` |
| Food | `preferences.food_preference` | candidate's `preferences.food_preference` |
| Hobbies | `user_hobbies` | candidate's `user_hobbies` (common / unique sets) |
| Age, gender | `partner_min_age`, `partner_max_age`, `partner_preferences.genders` | `profiles.date_of_birth`, `profiles.gender` |
| Quiz | `quiz_answers` | candidate's `quiz_answers` |

Weights and formulas belong to the matching engine and are **not** in this module.

## 6. Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `QUIZ_QUESTIONS_FILE` | `src/config/quiz-questions.json` | Questionnaire file (relative to `backend/`) |

## 7. Implementation decisions (not specified by the project document)

| # | Decision | Reason |
| --- | --- | --- |
| 1 | Added `preferred_education` / `preferred_occupation` columns (migration) | The spec asks for structured fields; Phase 2 had them only in JSON |
| 2 | `preferredFood` is a fixed option list; location, education, occupation and lifestyle are free text | Food is naturally categorical. The others match the free-text profile fields from Phase 5; the matching engine will normalise them |
| 3 | Also stored: partner age range and preferred genders | The columns existed in Phase 2 ("other matching preferences") |
| 4 | Every preference field is optional | Users can save partial preferences; nothing in the project marks them required |
| 5 | `POST` creates (409 if it exists), `PUT` updates (404 if missing); both accept `hobbyIds` and `quizAnswers` | The spec's POST + PUT, plus one transactional save for the whole page |
| 6 | `GET /preferences` returns `isSet: false` with empty values instead of 404 | Hobbies and quiz answers can exist before preferences are created |
| 7 | Separate endpoints for hobbies and quiz as well (`/preferences/hobbies`, `/preferences/quiz`) | The spec lists them; useful for single-purpose screens |
| 8 | The Phase 3 placeholders `GET/PUT /hobbies/me` were removed | Replaced by `/preferences/hobbies`, avoiding duplicate endpoints |
| 9 | Duplicate hobby ids in a request are rejected (not silently de-duplicated) | Makes client mistakes visible |
| 10 | At most 20 hobbies per user | Bounded request size and UI |
| 11 | Quiz questions live in a JSON file with **4 sample questions**, marked `sample` | The questionnaire is not defined by the project; it is configurable rather than invented |
| 12 | Quiz `questionId`s are strings (e.g. `weekend_style`), not numbers | The Phase 2 `question_id` column is a varchar key; stable readable ids |
| 13 | `GET /preferences/options` endpoint | Single source for option lists in backend and UI |
