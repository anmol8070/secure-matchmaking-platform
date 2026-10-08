# Phase 7: Compatibility Score & Adaptive ML Recommendation Pipeline

## 1. Overview

Phase 7 implements the deterministic compatibility scoring engine, user interaction tracking, machine learning feature engineering, binary classification via Logistic Regression, and Adaptive Personalized Ranking for profile recommendations.

```
User Profile
     ↓
Preferences + Hobbies
     ↓
Phase 7: Compatibility Score
     ↓
User Interactions
 ├── Profile View
 ├── Like/Interest
 ├── Connection Request
 ├── Accepted
 ├── Rejected
 └── Feedback
     ↓
Feature Engineering
     ↓
Logistic Regression
     ↓
Probability of Positive Interaction
     ↓
Adaptive Personalized Ranking
     ↓
Recommended Profiles
```

---

## 2. Compatibility Engine (`matchingService.js`)

Calculates a deterministic compatibility score between $0$ and $100$ using 4 breakdown dimensions (up to 25 points each):

1. **Location & Age Score (0 - 25 pts)**:
   - City match (10 pts), State match (8 pts), Country match (5 pts). Bonus for preferred location.
   - Age check against target user's date of birth and viewer's preferred partner age range (`partner_min_age` – `partner_max_age`).
2. **Preferences & Lifestyle Score (0 - 25 pts)**:
   - Alignment of food preference, lifestyle preference, preferred education, and preferred occupation.
3. **Hobby Overlap Score (0 - 25 pts)**:
   - Jaccard similarity coefficient $J(H_1, H_2) = \frac{|H_1 \cap H_2|}{|H_1 \cup H_2|}$ scaled to 25 pts.
4. **Quiz Vector Similarity (0 - 25 pts)**:
   - Hamming/cosine agreement over answered questions in `quiz_answers`.

Results are stored/upserted in the `matches` table (`score` and `score_breakdown`).

---

## 3. User Interaction Tracking (`feedbackService.js`, `connectionService.js`)

User actions are recorded in `activity_feedback`:
- Action types: `profile_view`, `like`, `connection_request`, `accepted`, `rejected`, `feedback`.
- Every positive action (`like`, `connection_request`, `accepted`) or negative action (`rejected`) triggers an online training step on the Machine Learning model.

---

## 4. Machine Learning & Feature Engineering (`logisticRegressionEngine.js`)

Feature vector $X$ for user pair $(U_A, U_B)$:
- `compatibilityScore`: Normalized base compatibility score $[0, 1]$.
- `demographicScore`: Normalized demographic component $[0, 1]$.
- `lifestyleScore`: Normalized lifestyle component $[0, 1]$.
- `hobbyJaccard`: Jaccard similarity $[0, 1]$.
- `quizSimilarity`: Quiz agreement fraction $[0, 1]$.
- `viewerCTR`: Viewer historical positive action rate.
- `candidatePopularity`: Candidate historical acceptance/like rate.
- `recencyScore`: Candidate profile recency decay factor $\exp(-\text{days} / 30)$.

Model:
$$\sigma(z) = \frac{1}{1 + e^{-z}}$$
$$z = w_0 + \sum_{i} w_i x_i$$

Online Training (SGD):
$$w_j \leftarrow w_j + \eta \cdot (y - \hat{y}) \cdot x_j$$

---

## 5. Adaptive Personalized Ranking (`recommendationService.js`)

1. Fetches candidate profiles excluding self and blocked users (`blocks` table).
2. Computes base compatibility score ($S_{\text{comp}}$) and ML predicted probability ($P_{\text{pos}}$).
3. Computes Adaptive Ranking Score:
   $$\text{Rank Score} = 0.5 \times S_{\text{comp}} + 0.5 \times (100 \times P_{\text{pos}})$$
4. Orders candidate profiles by Rank Score in descending order and returns recommendations with match badges.

---

## 6. Endpoints

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/v1/matches` | GET | Retrieve computed matches for current user |
| `/api/v1/matches/:userId` | GET | Compute/retrieve compatibility score with specific user |
| `/api/v1/recommendations` | GET | Retrieve ranked candidate recommendations |
| `/api/v1/recommendations/recalculate` | POST | Trigger ML weight retraining from feedback logs |
| `/api/v1/connections` | GET | List accepted connections |
| `/api/v1/connections/requests` | GET / POST | List or send connection requests |
| `/api/v1/connections/requests/:requestId` | PATCH | Accept or reject connection request |
| `/api/v1/feedback` | POST / GET | Record interaction feedback or view history |
