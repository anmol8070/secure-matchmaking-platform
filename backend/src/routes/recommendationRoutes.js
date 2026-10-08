/**
 * /api/v1/recommendations — ranked candidate recommendations.
 */
const { Router } = require('express');
const recommendations = require('../controllers/recommendationController');
const { validate, paginationQuery } = require('../validators/commonValidator');

const router = Router();

router.get('/', validate({ query: paginationQuery }), recommendations.getRecommendations);

module.exports = router;
