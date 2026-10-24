# Research evaluation

This note separates a working application from a research result. A feature is listed as a contribution only where the source implements it. A performance claim is listed only where this audit measured it. None of the numeric recommendation metrics were measured here.

## Research question

When a member has interaction history, does blending a logistic model trained on that history with the deterministic compatibility score change the ranking relative to the score alone, and is the change better on a held-out set of later interactions?

## Hypothesis

The blended score ranks candidates that later receive a positive interaction above candidates that later receive a rejection more often than the compatibility score alone. This hypothesis was not tested in this audit.

## What is implemented

1. A deterministic score from location, age, stated preferences, hobby overlap, and quiz agreement, plus short reason strings. This is explainable because each part is returned in the breakdown.
2. An optional logistic regression on those similarity features, trained from `activity_feedback`, stored in `ml_model_versions`, and blended as `0.40 × compatibility + 0.60 × probability × 100` when a model is active.
3. A cold-start path that returns the compatibility score when no model is active or a probability cannot be computed.
4. Visibility settings enforced in API responses, and a block that removes the connection. That is a product control, not a measured privacy result.

Profile-photo comparison at login is a product check. It is not a research contribution. The server does not perform the comparison.

## What is not claimed

- Novelty. Chapter 2 cites known recommender and online-dating literature and does not assert that this design is unpublished.
- A gain over the baseline. No train, validation, or test metrics were computed during this audit.
- Dataset size, accuracy, Precision@K, recall, F1, ROC-AUC, or acceptance rate. The training code can compute several of those. The numbers were not produced.
- That the point weights are optimal, or that a midpoint for missing answers is unbiased.

## Evaluation protocol, ready to run and not yet run

1. Export or query `activity_feedback` labels as defined in `backend/src/ml/README.md`. Do not add rows by hand to inflate a result.
2. If the count is below 10, stop and report that the sample is insufficient. That is the behaviour already coded.
3. Fit the existing trainer. Record the sample counts and the metrics the script prints. Keep the chronological split.
4. Rank a fixed candidate list twice for each seeker: compatibility only, and the blended score.
5. Compare the two rankings with the metric the script already implements. Do not add a new metric after seeing the outcome and present it as planned.
6. Publish the model version id, the sample counts, and the metric values from that run. If a metric is absent from the stored JSON, show "not recorded", which is what the admin screen already does.

## Baseline and proposed method

- Baseline: Phase 7 compatibility score, used whenever no model is active.
- Proposed method: the 40/60 blend above, only after training.

## Measured results

None in this audit.

## Limitations

The features are themselves functions of the profile form, so the model cannot discover a signal that the form does not contain. Positive labels include sending a request, which is an action by the seeker, not evidence that the other person agreed. The midpoint rules in the baseline give incomplete profiles a mid-range score. A single API process and a local MySQL database were used for development. Results on that database would not transfer to another population without a new split.

## Reproducibility

Training entry point: `POST /api/v1/admin/ml/train` by an administrator, or the training module described in `backend/src/ml/README.md`. Feature order and the blend weights are in `recommendationService.js` (`COMPATIBILITY_WEIGHT = 0.40`, `ML_WEIGHT = 0.60`). Repeating the evaluation requires the same feedback rows, which this report does not export, because those rows can identify members.

---

## Phase 19 measured evaluation (24 October 2026)

The section above correctly said this audit had no metrics. The trainer was then run on the development database.

`activity_feedback` held 11 rows: connection_request 4, connection_accepted 3, connection_removed 1, profile_view 3. The trainer keeps only `interest`, `connection_request`, `connection_accepted`, and `rejection`. That left 7 rows, all positive, and 0 rejections. It printed "Insufficient real interaction data for reliable ML evaluation" and "Will not generate fake model." `ml_model_versions` was empty afterwards.

No Precision@K, recall, F1, or ROC-AUC is reported. The compatibility score remains the rank while no model is active. Blocked users are still excluded in `recommendationService.js` before scoring. That filter was not re-measured against a new dataset.

A future evaluation needs at least 10 labeled rows before the current script will fit a model, including some `rejection` rows. Ten rows would still be a weak test. The 100-pair figure is not a threshold in the code and is not claimed here.

Phase 20 ran the same trainer again on 24 October 2026. The output was unchanged: 7 eligible rows, all positive, and no model file. No metric was computed.

