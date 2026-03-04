const API_URL = 'http://localhost:8001';

const api = {
    async request(endpoint, options = {}) {
        const token = localStorage.getItem('qvibe_token');

        const headers = {
            ...options.headers,
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // Only set Content-Type if not sending FormData (let the browser set it for FormData)
        if (!(options.body instanceof FormData) && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        const config = {
            ...options,
            headers,
        };

        const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

        try {
            const response = await fetch(`${API_URL}${normalizedEndpoint}`, config);

            if (response.status === 401) {
                // Token might be expired
                console.warn(' [API] Unauthorized (401) - Potential token expiration.');

                // Dispatch a global event for logout handling if needed
                window.dispatchEvent(new CustomEvent('auth:unauthorized'));

                // Clear storage if we're sure it's an auth failure
                localStorage.removeItem('qvibe_token');
                localStorage.removeItem('qvibe_user');

                const error = await response.json().catch(() => ({}));
                throw { status: 401, message: error.detail || 'Session expirée. Veuillez vous reconnecter.', ...error };
            }

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw { status: response.status, ...error };
            }

            return await response.json();
        } catch (error) {
            console.error(` [API] Request to ${endpoint} failed:`, error);
            throw error;
        }
    },

    get(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'GET' });
    },

    post(endpoint, body, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'POST',
            body: body instanceof FormData ? body : JSON.stringify(body)
        });
    },

    put(endpoint, body, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'PUT',
            body: body instanceof FormData ? body : JSON.stringify(body)
        });
    },

    delete(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'DELETE' });
    }
};

export default api;
