import { asyncHandler } from "../utils/asyncHandler.js";
import locationService from "../services/location.service.js";

export const reverseGeocode = asyncHandler(async (req, res) => {
  const lat = req.query.lat ?? req.query.latitude;
  const lng = req.query.lng ?? req.query.longitude;
  const forceRefresh = req.query.refresh === "true";

  const data = await locationService.reverseGeocode(lat, lng, { forceRefresh });
  res.json({ success: true, data });
});

export const reverseGeocodeBatch = asyncHandler(async (req, res) => {
  const coordinates = req.body?.coordinates || [];
  const results = await locationService.reverseGeocodeBatch(coordinates);
  res.json({ success: true, data: { results } });
});
