/**
 * Admin panel API (Phase 14). Every call carries the access token; the
 * server checks the admin role on each request — this module grants nothing.
 */
import { apiClient, toQueryString as toQuery } from './apiClient.js';

const AUTH = { auth: true };

export const adminService = {
  getDashboard: (range) => apiClient.get(`/admin/dashboard${toQuery(range)}`, AUTH),
  getActivity: (range) => apiClient.get(`/admin/activity${toQuery(range)}`, AUTH),
  getMonitoring: () => apiClient.get('/admin/monitoring', AUTH),
  getMl: () => apiClient.get('/admin/ml', AUTH),
  trainModel: () => apiClient.post('/admin/ml/train', undefined, AUTH),

  listUsers: (params) => apiClient.get(`/admin/users${toQuery(params)}`, AUTH),
  getUser: (id) => apiClient.get(`/admin/users/${id}`, AUTH),
  /** body: { status: 'active' | 'suspended', reason?, reportId? } */
  setUserStatus: (id, body) => apiClient.put(`/admin/users/${id}/status`, body, AUTH),

  listReports: (params) => apiClient.get(`/admin/reports${toQuery(params)}`, AUTH),
  getReport: (id) => apiClient.get(`/admin/reports/${id}`, AUTH),
  /** body: { status: 'under_review' | 'resolved' | 'dismissed', resolutionNote?, actionTaken? } */
  setReportStatus: (id, body) => apiClient.put(`/admin/reports/${id}/status`, body, AUTH),

  listAuditLogs: (params) => apiClient.get(`/admin/audit-logs${toQuery(params)}`, AUTH),
};
