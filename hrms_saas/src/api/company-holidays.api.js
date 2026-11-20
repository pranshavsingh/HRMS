import API from "./axios";

export const companyHolidaysApi = {
  async list(params) {
    const response = await API.get("/v1/workforce/holidays", { params });
    return response.data;
  },
  async upcoming(params) {
    const response = await API.get("/v1/workforce/holidays/upcoming", { params });
    return response.data;
  },
  async get(id, params) {
    const response = await API.get(`/v1/workforce/holidays/${id}`, { params });
    return response.data;
  },
  async create(data, params) {
    const response = await API.post("/v1/workforce/holidays", data, { params });
    return response.data;
  },
  async update(id, data, params) {
    const response = await API.patch(`/v1/workforce/holidays/${id}`, data, { params });
    return response.data;
  },
  async remove(id, params) {
    const response = await API.delete(`/v1/workforce/holidays/${id}`, { params });
    return response.data;
  },
  async tenants() {
    const response = await API.get("/v1/workforce/holidays/tenants");
    return response.data;
  },
};

export default companyHolidaysApi;
