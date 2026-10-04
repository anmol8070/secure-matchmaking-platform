/**
 * /api/v1/recommendations — ranked candidate recommendations.
 * All endpoints are Phase 3 placeholders (HTTP 501).
 */
const { Router } = require('express');
const recommendations = require('../controllers/recommendationController');

const router = Router();

router.get('/', recommendations.getRecommendations);

module.exports = router;
