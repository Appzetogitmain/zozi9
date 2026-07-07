import express from "express";
import {
  createRole,
  getRoles,
  getRoleById,
  updateRole,
  deleteRole,
} from "../controller/roleController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { requireSuperAdmin } from "../middleware/permissionMiddleware.js";

const router = express.Router();

router.use(verifyToken, requireSuperAdmin);

router.post("/", createRole);
router.get("/", getRoles);
router.get("/:id", getRoleById);
router.put("/:id", updateRole);
router.delete("/:id", deleteRole);

export default router;
