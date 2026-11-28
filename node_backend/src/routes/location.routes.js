import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import * as locationController from "../controllers/location.controller.js";

const router = Router();

router.use(authenticate);

router.get("/reverse-geocode", locationController.reverseGeocode);
router.post("/reverse-geocode/batch", locationController.reverseGeocodeBatch);

export default router;
