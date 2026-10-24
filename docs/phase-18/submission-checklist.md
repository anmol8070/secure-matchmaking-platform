# Submission checklist

Date: 24 October 2026.

| Item | State | Where |
| --- | --- | --- |
| Implementation audited against source, not against the phase brief alone | Done | [final-project-report.md](final-project-report.md) |
| Feature matrix uses COMPLETE, PARTIALLY COMPLETE, NOT IMPLEMENTED, NOT VERIFIED | Done | Report section 1 |
| Chapters 1–12 | Done | Report |
| Architecture, auth, camera, profile, scoring, recommendation, connections, chat, WebRTC, block, admin, and ER diagrams | Done | [diagrams.md](diagrams.md) |
| Compatibility formula matches `matchingService.js` | Done | Report chapter 6. The renormalised formula in the brief does not match the code and is not used. |
| ML described only where code exists, with no invented metrics | Done | Report chapter 7 and [research-evaluation.md](research-evaluation.md) |
| Test statuses limited to commands run this audit | Done | [test-report.md](test-report.md) |
| Security controls separated from recommendations | Done | Report chapter 8 |
| Demonstration script, marked as not executed this audit | Done | [demonstration-script.md](demonstration-script.md) |
| Setup guide uses real npm scripts and placeholder secrets | Done | Root [README.md](../../README.md) and `backend/.env.example` |
| Slide outline and PowerPoint file | Done | [presentation.md](presentation.md), [presentation.pptx](presentation.pptx) |
| API index | Done | [api-index.md](api-index.md) |
| Production deployment | Not done | Not authorised |
| Database integration suite | Not done | `npm run test:db` |
| Live camera, chat, and video demonstration | Not done | Script is ready |
| Recommendation metrics | Not done | Do not fill these in by hand |
| Secrets and private member rows in these documents | Avoided | Test account passwords appear only in the local demonstration script |

## Outstanding blockers before calling the project finished

- Frontend unit tests failed until JSX and a handful of UI bindings were repaired. Those repairs are in the working tree and are not a release by themselves.
- `npm run test:db`, Postman, and the video end-to-end script were not run.
- Login comparison trusts the client.
- Profile photos are public if the URL is known.
- OTP, TURN, Redis, and hosting are development defaults.
- No measured gain for the logistic ranker.

Do not submit a claim that every feature was manually demonstrated, or that the model improved ranking.

---

## Phase 19 status (24 October 2026)

The blockers above were the Phase 18 list. Their status after the remediation:

| Blocker | Status now | Why |
| --- | --- | --- |
| Client-trusted face flag | Addressed in code and in the auth integration tests | The flag no longer grants or denies login. Identity recognition is not claimed. |
| Public profile photos | Addressed for unsigned URLs | Signed URLs still work for 10 minutes without a new privacy check. |
| Development OTP | Dev outbox cannot boot in production. Adapters exist. | Live email and SMS were not sent. |
| TURN | Code and production startup check exist. | No relay is configured. Live calls were not tested. |
| Ranker evaluation | Measured and skipped | 7 positive rows, 0 negative. No metric. Baseline remains. |
| Production host | Specification only | Not deployed. |

Do not mark the project production-ready from this checklist.

Phase 20, the same day, reran the suites, the production frontend build, production startup checks, and an isolated database restore. The release table is in [../phase-20/README.md](../phase-20/README.md). The project was still not deployed.

