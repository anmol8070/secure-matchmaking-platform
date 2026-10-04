/**
 * API v1 router — mount feature routers here as they are added.
 */
const { Router } = require('express');
const healthRoutes = require('./health.routes');

const router = Router();

router.use('/health', healthRoutes);

// Future phases:
// router.use('/auth', authRoutes);
// router.use('/users', userRoutes);
// router.use('/admin', adminRoutes);

module.exports = router;
