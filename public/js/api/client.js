(() => {
  "use strict";

  class APIError extends Error {
    constructor(message, options = {}) {
      super(message);
      this.name = "APIError";
      this.status = options.status ?? 0;
      this.code = options.code ?? null;
      this.details = options.details ?? null;
      this.data = options.data ?? null;
    }
  }

  const config = {
    baseUrl: "/api/v1",
    storage: "session",
    tokenKey: "esacco_token",
    headers: {}
  };

  function storageForToken() {
    if (config.storage === "local") return window.localStorage;
    if (config.storage === "session") return window.sessionStorage;
    return null;
  }

  function setToken(token) {
    const storage = storageForToken();
    if (!storage) return;

    if (token) {
      storage.setItem(config.tokenKey, token);
    } else {
      storage.removeItem(config.tokenKey);
    }
  }

  function getToken() {
    try {
      return storageForToken()?.getItem(config.tokenKey) || null;
    } catch {
      return null;
    }
  }

  function makeUrl(path, query) {
    const base = config.baseUrl.replace(/\/+$/, "");
    const endpoint = String(path || "").replace(/^\/+/, "");
    const url = new URL(`${base}/${endpoint}`, window.location.origin);

    if (query && typeof query === "object") {
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;

        if (Array.isArray(value)) {
          value.forEach((item) => url.searchParams.append(key, String(item)));
        } else {
          url.searchParams.set(key, String(value));
        }
      });
    }

    return url.toString();
  }

  async function readResponse(response) {
    if (response.status === 204) return null;

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        return await response.json();
      } catch {
        throw new APIError("The server returned invalid JSON.", {
          status: response.status
        });
      }
    }

    const text = await response.text();
    return text || null;
  }

  function errorFromResponse(response, data) {
    const payload = data && typeof data === "object" ? data : {};
    const serverError = payload.error;
    const message =
      payload.message ||
      (typeof serverError === "string" ? serverError : serverError?.message) ||
      response.statusText ||
      "The request could not be completed.";

    return new APIError(message, {
      status: response.status,
      code: payload.code || serverError?.code || null,
      details: payload.details || serverError?.details || null,
      data
    });
  }

  async function request(path, options = {}) {
    const {
      method = "GET",
      query,
      body,
      headers = {},
      signal,
      credentials = "same-origin"
    } = options;

    const requestHeaders = new Headers({
      Accept: "application/json",
      ...config.headers,
      ...headers
    });

    const token = getToken();
    if (token && !requestHeaders.has("Authorization")) {
      requestHeaders.set("Authorization", `Bearer ${token}`);
    }

    let requestBody;
    if (body !== undefined && body !== null) {
      if (
        body instanceof FormData ||
        body instanceof Blob ||
        body instanceof URLSearchParams ||
        typeof body === "string"
      ) {
        requestBody = body;
      } else {
        requestHeaders.set("Content-Type", "application/json");
        requestBody = JSON.stringify(body);
      }
    }

    let response;
    try {
      response = await fetch(makeUrl(path, query), {
        method: method.toUpperCase(),
        headers: requestHeaders,
        body: requestBody,
        credentials,
        signal
      });
    } catch (error) {
      if (error.name === "AbortError") throw error;

      throw new APIError("Unable to reach the server. Check your connection and try again.", {
        details: error
      });
    }

    const data = await readResponse(response);
    if (!response.ok) {
      throw errorFromResponse(response, data);
    }

    return data;
  }

  const API = {
    APIError,

    configure(options = {}) {
      if (options.baseUrl !== undefined) {
        config.baseUrl = String(options.baseUrl).replace(/\/+$/, "");
      }

      if (options.storage !== undefined) {
        if (!["session", "local", "none"].includes(options.storage)) {
          throw new TypeError('storage must be "session", "local", or "none".');
        }
        config.storage = options.storage;
      }

      if (options.tokenKey !== undefined) {
        config.tokenKey = String(options.tokenKey);
      }

      if (options.headers !== undefined) {
        config.headers = { ...options.headers };
      }
    },

    setToken,
    getToken,
    clearToken() {
      setToken(null);
    },

    request,

    get(path, options = {}) {
      return request(path, { ...options, method: "GET" });
    },

    post(path, body, options = {}) {
      return request(path, { ...options, method: "POST", body });
    },

    put(path, body, options = {}) {
      return request(path, { ...options, method: "PUT", body });
    },

    patch(path, body, options = {}) {
      return request(path, { ...options, method: "PATCH", body });
    },

    delete(path, options = {}) {
      return request(path, { ...options, method: "DELETE" });
    }
  };

  window.API = API;
})();
