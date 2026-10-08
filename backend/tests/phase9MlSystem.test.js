const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/database').getDb();
const mlInferenceService = require('../src/ml/inference/mlInferenceService');
const { extractFeatures, vectorizeFeatures, FEATURE_ORDER } = require('../src/ml/features/featureGenerator');
const { predictProb, trainLogisticRegression, sigmoid } = require('../src/ml/training/logisticRegression');
const MlModel = require('../src/models/mlModel');

describe('Phase 9 — ML Recommendation System', () => {
  beforeAll(async () => {
    await db('ml_model_versions').del();
  });

  describe('Logistic Regression Algorithm', () => {
    it('sigmoid returns values between 0 and 1', () => {
      expect(sigmoid(0)).toBe(0.5);
      expect(sigmoid(100)).toBeGreaterThan(0.99);
      expect(sigmoid(-100)).toBeLessThan(0.01);
    });

    it('predictProb computes logistic regression probability correctly', () => {
      const weights = [1.0, -1.0];
      const bias = 0.5;
      const x = [0.5, 0.5]; // z = 0.5 + 0.5(1) + 0.5(-1) = 0.5
      const p = predictProb(x, weights, bias);
      expect(p).toBeCloseTo(sigmoid(0.5));
    });

    it('trainLogisticRegression learns correctly from synthetic data', () => {
      const X = [
        [1, 1],
        [1, 0.9],
        [0, 0],
        [0, 0.1]
      ];
      const y = [1, 1, 0, 0];
      const { weights, bias } = trainLogisticRegression(X, y, 0.5, 500);
      
      const p1 = predictProb([1, 1], weights, bias);
      const p0 = predictProb([0, 0], weights, bias);
      
      expect(p1).toBeGreaterThan(0.8);
      expect(p0).toBeLessThan(0.2);
    });
  });

  describe('Feature Engineering', () => {
    it('vectorizeFeatures maintains the correct order', () => {
      const obj = {
        compatibility_score: 0.8,
        location_similarity: 1.0,
        education_similarity: 0,
        occupation_similarity: 0,
        hobby_similarity: 0.5,
        lifestyle_similarity: 1.0,
        food_similarity: 0.7,
        quiz_similarity: 0.9
      };
      
      const arr = vectorizeFeatures(obj);
      expect(arr.length).toBe(FEATURE_ORDER.length);
      expect(arr[FEATURE_ORDER.indexOf('compatibility_score')]).toBe(0.8);
      expect(arr[FEATURE_ORDER.indexOf('quiz_similarity')]).toBe(0.9);
    });
  });

  describe('ML Inference Service', () => {
    it('predictCandidateProbability returns null when no active model exists', async () => {
      mlInferenceService.invalidateModelCache();
      const p = await mlInferenceService.predictCandidateProbability(1, 2);
      expect(p).toBeNull();
    });

    it('loads active model and predicts properly', async () => {
      // Insert mock active model
      await MlModel.insertModel({
        model_version: 'test-v1',
        model_type: 'logistic_regression',
        feature_version: 'v1',
        training_samples: 10,
        positive_samples: 5,
        negative_samples: 5,
        weights: JSON.stringify({
          bias: -1.0,
          compatibility_score: 2.0,
          location_similarity: 0.5,
          education_similarity: 0,
          occupation_similarity: 0,
          hobby_similarity: 1.0,
          lifestyle_similarity: 0.5,
          food_similarity: 0,
          quiz_similarity: 1.0
        }),
        status: 'active'
      });

      mlInferenceService.invalidateModelCache();
      
      // predictCandidateProbability with precalculated features
      const features = {
        compatibility_score: 0.9,
        location_similarity: 1.0,
        education_similarity: 1.0,
        occupation_similarity: 0,
        hobby_similarity: 0.8,
        lifestyle_similarity: 1.0,
        food_similarity: 0.5,
        quiz_similarity: 0.9
      };
      
      const p = await mlInferenceService.predictCandidateProbability(1, 2, features);
      
      expect(p).not.toBeNull();
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    });
  });
});
