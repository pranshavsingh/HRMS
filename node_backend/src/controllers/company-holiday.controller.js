import { asyncHandler } from "../utils/asyncHandler.js";
import companyHolidayService from "../services/company-holiday.service.js";

export const list = asyncHandler(async (req, res) => {
  const holidays = await companyHolidayService.list(req.tenantId, req.query);
  res.json({ holidays });
});

export const upcoming = asyncHandler(async (req, res) => {
  const holidays = await companyHolidayService.upcoming(req.tenantId, req.query);
  res.json({ holidays });
});

export const get = asyncHandler(async (req, res) => {
  const holiday = await companyHolidayService.get(req.tenantId, req.params.id);
  res.json({ holiday });
});

export const create = asyncHandler(async (req, res) => {
  const holiday = await companyHolidayService.create(req.tenantId, req.body, req.user, req.ip);
  res.status(201).json({ holiday });
});

export const update = asyncHandler(async (req, res) => {
  const holiday = await companyHolidayService.update(req.tenantId, req.params.id, req.body, req.user, req.ip);
  res.json({ holiday });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await companyHolidayService.delete(req.tenantId, req.params.id, req.user, req.ip);
  res.json(result);
});

export const tenants = asyncHandler(async (_req, res) => {
  const tenants = await companyHolidayService.listTenants();
  res.json({ tenants });
});
