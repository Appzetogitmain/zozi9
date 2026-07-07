import express from 'express';
import { getLegalPage, updateLegalPage } from '../controller/legalController.js';
import { verifyToken, allowRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.get('/:role/:type', getLegalPage);

// Admin only routes
router.put('/:role/:type', verifyToken, allowRoles('admin'), updateLegalPage);

export default router;
