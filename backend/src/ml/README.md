# Phase 9: Adaptive ML Recommendation System

## Overview
The Phase 7/8 compatibility ranking is the deterministic baseline. Phase 9 adds a Logistic Regression based adaptive recommendation model trained from historical interaction data.

The system learns from actual user feedback (`activity_feedback` table) to predict the probability of a positive interaction (e.g., connection requests, accepted connections) given a set of compatibility features. This prediction is combined with the baseline compatibility score to form a final adaptive `recommendationScore`.

## Data Source
Interactions are sourced from the `activity_feedback` table.
- **Positive Targets (1):** `interest`, `connection_request`, `connection_accepted`
- **Negative Targets (0):** `rejection`
- *Note:* `profile_view` is ignored for the target definition to prevent noise.

## Features
Features represent the state of compatibility between the requesting user and the candidate.
1. `compatibility_score` (Normalized 0-1)
2. `location_similarity`
3. `education_similarity`
4. `occupation_similarity`
5. `hobby_similarity` (Jaccard Index)
6. `lifestyle_similarity`
7. `food_similarity`
8. `quiz_similarity`

*Data Leakage Prevention:* Temporal leakage is mitigated by ensuring features reflect only baseline similarities, not post-interaction metadata, and by only utilizing the first significant interaction between any given pair for training.

## Preprocessing
No complex scaling is required as all features are inherently bounded between 0.0 and 1.0. Missing similarities default to 0.

## Model Training & Imbalance Handling
The model is trained using **Stochastic Gradient Descent (SGD)**. 
Class imbalance is handled via Inverse Frequency Weighting (`total_samples / (2 * class_samples)`), ensuring that rare negative or positive interactions influence the gradient proportionally.

Data is split sequentially (chronologically) into an 80% training set and 20% test set for evaluation.

## Evaluation Metrics
The training script evaluates:
- Accuracy
- Precision
- Recall
- F1 Score
- ROC-AUC

If there are fewer than 10 interaction samples, the system logs `"Insufficient real interaction data for reliable ML evaluation"` and safely falls back to the deterministic baseline.

## Persistence and Model Versioning
Trained models are saved to the `ml_model_versions` database table.
The system stores:
- `model_version` (e.g. `lr-v172838382`)
- Weights and Biases (JSON format)
- `training_samples`, `positive_samples`, `negative_samples`
- Evaluation Metrics (Precision, Recall, F1, ROC-AUC)

## Inference & Fallback (Cold Start)
The `mlInferenceService` loads and caches the active model.
If an active model is present, the final `recommendationScore` is a weighted sum:
`Score = (0.40 * Compatibility) + (0.60 * ML Probability * 100)`

If no active model is found (due to cold-start or insufficient data), the system gracefully falls back to using only the deterministic Phase 7 compatibility score.

## Admin Training
Admins can trigger model training via:
`POST /api/v1/admin/ml/train`

This evaluates current historical data and persists a new model version.
