/**
 * EcaNotes.in - Unified API Client Layer (js/api.js)
 * Connects frontend to the production FastAPI & SQLite backend.
 * Provides secure token-based authentication and real file streaming.
 */

const EcaAPI = (() => {
  // Backend URL configuration:
  // 1. When deployed on Render (e.g. https://ecanotes.onrender.com) or local port 8000, relative URL '' is used.
  // 2. When developing locally with VS Code Live Server (port 5500) or file://, target 'http://127.0.0.1:8000'.
  const isLocalStaticServer = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (window.location.port !== '8000' && window.location.port !== '');
  const isDirectBackend = !isLocalStaticServer;
  const API_BASE = isDirectBackend ? '' : 'http://127.0.0.1:8000';
  const TOKEN_KEY = 'ecanotes_admin_token';

  function getAuthHeader() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  async function parseJson(res) {
    if (!res) return null;
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  async function request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const token = sessionStorage.getItem(TOKEN_KEY);
    const headers = {
      ...(options.headers || {}),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    try {
      const res = await fetch(url, { ...options, headers });
      if (res.status === 401) {
        // Only trigger unauthorized event if we were holding an active token that got rejected
        // and do NOT trigger on initial /api/admin/me check or /api/admin/login
        if (token && endpoint !== '/api/admin/login' && endpoint !== '/api/admin/me') {
          sessionStorage.removeItem(TOKEN_KEY);
          window.dispatchEvent(new CustomEvent('ecanotes_unauthorized'));
        }
      }
      return res;
    } catch (err) {
      console.warn(`API request to ${url} failed:`, err);
      return null;
    }
  }

  return {
    isServerAvailable: async () => {
      try {
        const res = await fetch(`${API_BASE}/api/reviews/stats`);
        return res.ok;
      } catch {
        return false;
      }
    },

    // ================= PUBLIC ENDPOINTS =================
    async getResources(filters = {}) {
      const params = new URLSearchParams();
      if (filters.year) params.append('year', filters.year);
      if (filters.type) params.append('type', filters.type);
      if (filters.subject) params.append('subject', filters.subject);
      if (filters.q) params.append('q', filters.q);

      const res = await request(`/api/resources?${params.toString()}`);
      if (res && res.ok) {
        return await parseJson(res) || [];
      }
      return null;
    },

    async uploadResource(formData) {
      const res = await request('/api/resources/upload', {
        method: 'POST',
        body: formData
      });
      if (res && res.ok) {
        window.dispatchEvent(new CustomEvent('ecanotes_db_change'));
        const data = await parseJson(res);
        return data || { success: true };
      }
      const err = await parseJson(res);
      throw new Error(err && err.detail ? err.detail : 'Upload failed');
    },

    async downloadResource(id, filename) {
      const url = `${API_BASE}/api/download/${id}`;
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'resource.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.dispatchEvent(new CustomEvent('ecanotes_db_change'));
    },

    async getReviews() {
      const res = await request('/api/reviews');
      if (res && res.ok) {
        return await parseJson(res) || [];
      }
      return null;
    },

    async submitReview(data) {
      const res = await request('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res && res.ok) {
        window.dispatchEvent(new CustomEvent('ecanotes_db_change'));
        const out = await parseJson(res);
        return out || { success: true };
      }
      const err = await parseJson(res);
      throw new Error(err && err.detail ? err.detail : 'Review submission failed');
    },

    async getReviewStats() {
      const res = await request('/api/reviews/stats');
      if (res && res.ok) {
        return await parseJson(res);
      }
      return null;
    },

    async getSubjects(year = 'All') {
      const param = year && year !== 'All' ? `?year=${encodeURIComponent(year)}` : '';
      const res = await request(`/api/subjects${param}`);
      if (res && res.ok) {
        return await parseJson(res) || [];
      }
      return null;
    },

    // ================= ADMIN & OWNER ENDPOINTS =================
    async adminLogin(email, password) {
      const res = await request('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (res && res.ok) {
        const data = await parseJson(res);
        if (data && data.token) {
          sessionStorage.setItem(TOKEN_KEY, data.token);
          return data;
        }
        throw new Error('Invalid response from server.');
      }

      let errorDetail = 'Invalid email or password.';
      if (res) {
        const errData = await parseJson(res);
        if (errData && errData.detail) {
          errorDetail = errData.detail;
        } else if (res.status === 404 || res.status === 502) {
          errorDetail = `Backend API endpoint not found on port ${window.location.port || '8000'}. Make sure the Python backend is running on port 8000.`;
        } else {
          errorDetail = `Authentication failed (Status ${res.status}).`;
        }
      } else {
        errorDetail = 'Backend server is not running on port 8000. Please start the server by running run_server.bat or open http://localhost:8000/admin.html.';
      }
      throw new Error(errorDetail);
    },

    async adminMe() {
      const token = sessionStorage.getItem(TOKEN_KEY);
      if (!token) return false;
      const res = await request('/api/admin/me');
      return !!(res && res.ok);
    },

    async adminLogout() {
      await request('/api/admin/logout', { method: 'POST' });
      sessionStorage.removeItem(TOKEN_KEY);
    },

    async changePassword(currentPassword, newPassword) {
      const res = await request('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });
      if (res && res.ok) {
        return await parseJson(res);
      }
      const err = await parseJson(res);
      throw new Error(err && err.detail ? err.detail : 'Password change failed.');
    },

    async getPendingUploads() {
      const res = await request('/api/admin/pending');
      if (res && res.ok) return await parseJson(res) || [];
      return [];
    },

    async verifyResource(id, formData) {
      const res = await request(`/api/admin/verify/${id}`, {
        method: 'POST',
        body: formData
      });
      if (res && res.ok) {
        window.dispatchEvent(new CustomEvent('ecanotes_db_change'));
        const out = await parseJson(res);
        return out || { success: true };
      }
      const err = await parseJson(res);
      throw new Error(err && err.detail ? err.detail : 'Verification failed');
    },

    async publishDirect(formData) {
      const res = await request('/api/admin/publish-direct', {
        method: 'POST',
        body: formData
      });
      if (res && res.ok) {
        window.dispatchEvent(new CustomEvent('ecanotes_db_change'));
        const out = await parseJson(res);
        return out || { success: true };
      }
      const err = await parseJson(res);
      throw new Error(err && err.detail ? err.detail : 'Direct publishing failed');
    },

    async rejectUpload(id) {
      const res = await request(`/api/admin/reject/${id}`, {
        method: 'DELETE'
      });
      if (res && res.ok) {
        window.dispatchEvent(new CustomEvent('ecanotes_db_change'));
        return true;
      }
      return false;
    },

    async unpublishResource(id) {
      const res = await request(`/api/admin/resources/${id}`, {
        method: 'DELETE'
      });
      if (res && res.ok) {
        window.dispatchEvent(new CustomEvent('ecanotes_db_change'));
        return true;
      }
      return false;
    },

    async getPendingReviews() {
      const res = await request('/api/admin/reviews/pending');
      if (res && res.ok) return await parseJson(res) || [];
      return [];
    },

    async publishReview(id) {
      const res = await request(`/api/admin/reviews/${id}/publish`, {
        method: 'POST'
      });
      if (res && res.ok) {
        window.dispatchEvent(new CustomEvent('ecanotes_db_change'));
        const out = await parseJson(res);
        return out || { success: true };
      }
      return null;
    },

    async rejectReview(id) {
      const res = await request(`/api/admin/reviews/${id}/reject`, {
        method: 'DELETE'
      });
      if (res && res.ok) {
        window.dispatchEvent(new CustomEvent('ecanotes_db_change'));
        return true;
      }
      return false;
    },

    async unpublishReview(id) {
      const res = await request(`/api/admin/reviews/${id}/unpublish`, {
        method: 'DELETE'
      });
      if (res && res.ok) {
        window.dispatchEvent(new CustomEvent('ecanotes_db_change'));
        return true;
      }
      return false;
    },

    // ================= SUBJECT MANAGEMENT =================
    async createSubject(name, year) {
      const res = await request('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, year })
      });
      if (res && res.ok) {
        window.dispatchEvent(new CustomEvent('ecanotes_db_change'));
        return await parseJson(res);
      }
      const err = await parseJson(res);
      throw new Error(err && err.detail ? err.detail : 'Failed to create subject');
    },

    async updateSubject(id, name, year) {
      const res = await request(`/api/subjects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, year })
      });
      if (res && res.ok) {
        window.dispatchEvent(new CustomEvent('ecanotes_db_change'));
        return await parseJson(res);
      }
      const err = await parseJson(res);
      throw new Error(err && err.detail ? err.detail : 'Failed to update subject');
    },

    async deleteSubject(id) {
      const res = await request(`/api/subjects/${id}`, {
        method: 'DELETE'
      });
      if (res && res.ok) {
        window.dispatchEvent(new CustomEvent('ecanotes_db_change'));
        return await parseJson(res) || { success: true };
      }
      const err = await parseJson(res);
      throw new Error(err && err.detail ? err.detail : 'Failed to delete subject');
    },

    async getAdminStats() {
      const res = await request('/api/admin/stats');
      if (res && res.ok) return await parseJson(res);
      return null;
    },

    async getSQLData() {
      const res = await request('/api/admin/sql');
      if (res && res.ok) return await parseJson(res);
      return null;
    }
  };
})();

window.EcaAPI = EcaAPI;
