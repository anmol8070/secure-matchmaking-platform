# Presentation outline

Academic review. One slide per section. No chart uses a measured accuracy or a user count, because this audit did not produce those numbers. The PowerPoint file with the same outline is [presentation.pptx](presentation.pptx).

## 1. Title

Secure Social Networking and Digital Matchmaking Platform. Final review. Local implementation audit, 24 October 2026.

## 2. Problem statement

Commercial matchmaking often hides why two profiles were paired, how much of a profile strangers can see, and whether a login is a live person. Members also need a private channel after they choose to connect, and an operator needs a way to act on reports.

## 3. Motivation

A course project can make the score readable, keep visibility rules on the server, and put chat and calls behind an accepted connection. It cannot, by itself, prove better relationship outcomes.

## 4. Objectives

Register and verify a destination. Require a live camera check at login. Store a profile and preferences. Rank members with an explainable score. Support an optional model when interaction history exists. Allow requests, chat, and video. Provide block, report, and an admin queue.

## 5. Existing-system limitations

Profile search does not explain a rank. Behavioural recommenders need history and can be opaque. Published reviews of online dating do not establish that a hidden algorithm outperforms simpler meeting. This deck does not claim the present score is more accurate than those systems.

## 6. Proposed system

React client, Express API, MySQL in this development database, PostgreSQL supported by the same migrations. Password or one-time code, then a camera step. Profile and preferences. Score, then connections. Chat and WebRTC only after acceptance. Privacy, block, and report. Admin role checked in the database.

## 7. System architecture

Browser to REST and Socket.IO. Services to the database and to local files. Call media stays between browsers. Model files load from a CDN unless overridden. No mail gateway, TURN server, or Redis in the audited configuration.

## 8. Technology stack

React 19, Vite 8, React Router 7. Express 5, Zod, Knex, Socket.IO, scrypt, JWT sessions. MediaPipe for presence. face-api in the browser when a profile photo exists. Jest and Vitest.

## 9. Database design

27 migrations applied, none pending. Core tables: users, profiles, preferences, hobbies, user hobbies, quiz answers, matches, connection requests, messages, reports, blocks, feedback, verifications, OTP, sessions, model versions, video calls, privacy settings, admin audit logs. `blocks.reason` is the latest column.

## 10. Compatibility algorithm

Sum of location and age (up to 25), preference items (up to 25), hobby Jaccard times 25, and quiz agreement times 25. Clamp to 0–100. Empty hobby lists or missing quiz answers score 12.5, not zero. Reasons are generated from the same inputs. This is not a renormalised weighted average.

## 11. Recommendation approach

Baseline is that score. If an administrator has trained a logistic model and it is active, the rank is 40 percent compatibility and 60 percent predicted probability on a 0–100 scale. Otherwise the baseline is used. No quality metric was measured for this review.

## 12. Security and privacy

scrypt, OTP HMAC and limits, revocable sessions, validation, rate limits, server-side visibility, blocks, re-encoded uploads. The profile-photo flag is sent by the browser. Photo files can still be fetched by URL. No penetration-test result is claimed. Development OTP must not be left enabled in production.

## 13. Interface

Landing page with a 3D hero, auth, profile and change-photo dialog, matches and breakdown, connections, chat, video page, privacy, block with a reason, admin screens, light and dark themes. Screenshots were not retaken for this audit.

## 14. Testing methodology

Backend Jest unit suite, excluding database integration. Frontend Vitest with a mocked API. Migration status. Health check. Build. Browser, video end-to-end, Postman, and `test:db` were not run.

## 15. Actual results

Backend: 322 tests passed. Frontend: the first run failed on broken JSX and unwired messages. After repairs: 216 tests passed. Production build succeeded with large-chunk warnings. Health check succeeded in development. 27 migrations applied.

## 16. Limitations

Client-trusted face flag. Public photo URLs. Sample quiz. Midpoint scores for missing data. No measured model quality. No TURN. No production OTP provider. No deployment. Dependency advisories not cleared in this pass.

## 17. Future scope

Evaluate the blend on a real feedback export, or report that the sample is too small. Move face comparison to the server or remove the claim. Private media. A mail provider. TURN. Accessibility review. Smaller frontend bundles.

## 18. Conclusion

The application implements explainable matching, private communication after a connection, and basic moderation. Tests that were run passed after specific frontend repairs. The recommendation model is optional and unevaluated. The project is not production-complete.

## 18A. Phase 19 correction

Slides 1–19 above are the Phase 18 review. After that review:

- Login uses the existing single-use verification token and a one-face presence result. `profile_matched` does not change the decision. This is not identity recognition.
- Profile photos are served with a 10-minute signature, or with a member session that follows photo visibility. "everyone" means signed-in members.
- SMTP and Twilio adapters exist. No live message was sent. Production startup rejects `OTP_PROVIDER=dev` and also requires TURN and the selected provider's credentials.
- TURN credentials can be minted when a server is configured. None is configured. `relay` is false.
- The trainer found 7 eligible feedback rows, all positive, and saved no model.
- Tests after the change: backend 373 passed, frontend 215 passed, auth integration 51 passed. The production frontend build was not re-run. The project was not deployed.


## 19. References

- Boyd, d. m., and Ellison, N. B. (2007). Social network sites: Definition, history, and scholarship. Journal of Computer-Mediated Communication.
- Finkel, E. J., Eastwick, P. W., Karney, B. R., Reis, H. T., and Sprecher, S. (2012). Online dating: A critical analysis from the perspective of psychological science. Psychological Science in the Public Interest.
- Resnick, P., and Varian, H. R. (1997). Recommender systems. Communications of the ACM.
- Koren, Y., Bell, R., and Volinsky, C. (2009). Matrix factorization techniques for recommender systems. IEEE Computer.
- World Wide Web Consortium. WebRTC specification.

These are background sources. They are not results of this project. Page numbers and DOIs were not rechecked against the printed volumes during this audit.
