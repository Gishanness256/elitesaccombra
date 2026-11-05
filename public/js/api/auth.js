(() => {
  "use strict";

  if (!window.API) {
    throw new Error("Load public/js/api/client.js before api/auth.js.");
  }

  const API = window.API;
  const AUTH_PATH = "/auth";

  function responseData(response) {
    return response?.data ?? response;
  }

  function extractToken(response) {
    const data = responseData(response);
    return data?.accessToken || data?.access_token || data?.token || null;
  }

  function extractUser(response) {
    const data = responseData(response);
    return data?.user ?? data?.currentUser ?? data ?? null;
  }

  async function login(identifier, password) {
    const response = await API.post(`${AUTH_PATH}/login`, {
      identifier: String(identifier ?? "").trim(),
      password: String(password ?? "")
    });

    const token = extractToken(response);
    if (token) API.setToken(token);

    return {
      user: extractUser(response),
      token,
      response
    };
  }

  async function logout() {
    try {
      if (API.getToken()) {
        await API.post(`${AUTH_PATH}/logout`);
      }
    } finally {
      API.clearToken();
    }
  }

  async function currentUser() {
    if (!API.getToken()) return null;

    const response = await API.get(`${AUTH_PATH}/me`);
    return extractUser(response);
  }

  API.auth = {
    login,
    logout,
    currentUser
  };
})();
