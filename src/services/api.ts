import type {
  LoginCredentials,
  LoginResponse,
  DeviceLocation,
} from "../types/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class ApiService {
  private static accessToken: string | null = null;
  private static refreshToken: string | null = null;
  private static accessTokenExpiry: Date | null = null;
  private static refreshTimeout: number | null = null;

  static setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    sessionStorage.setItem("access_token", accessToken);
    sessionStorage.setItem("refresh_token", refreshToken);
  }

  static setAccessToken(token: string) {
    this.accessToken = token;
    sessionStorage.setItem("access_token", token);
  }

  static getAccessToken(): string | null {
    if (!this.accessToken) {
      this.accessToken = sessionStorage.getItem("access_token");
    }
    return this.accessToken;
  }

  static getRefreshToken(): string | null {
    if (!this.refreshToken) {
      this.refreshToken = sessionStorage.getItem("refresh_token");
    }
    return this.refreshToken;
  }

  static setExpiry(expires: string) {
    this.accessTokenExpiry = new Date(expires);
    sessionStorage.setItem("access_token_expiry", expires);
  }

  static getExpiry(): Date | null {
    if (!this.accessTokenExpiry) {
      const expiry = sessionStorage.getItem("access_token_expiry");
      if (expiry) {
        this.accessTokenExpiry = new Date(expiry);
      }
    }
    return this.accessTokenExpiry;
  }

  static isTokenExpired(): boolean {
    const expiry = this.getExpiry();
    if (!expiry) return true;

    const now = new Date();
    const timeUntilExpiry = expiry.getTime() - now.getTime();
    // Consider token expired if less than 5 minutes remaining
    const bufferTime = 5 * 60 * 1000; // 5 minutes in ms
    return timeUntilExpiry <= bufferTime;
  }

  static async ensureValidToken(): Promise<void> {
    const accessToken = this.getAccessToken();
    const refreshToken = this.getRefreshToken();

    // If no tokens, throw error
    if (!accessToken || !refreshToken) {
      throw new Error("No tokens available");
    }

    // If token is expired or about to expire, refresh it
    if (this.isTokenExpired()) {
      await this.refreshTokens();
    }
  }

  static clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    this.accessTokenExpiry = null;
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("refresh_token");
    sessionStorage.removeItem("access_token_expiry");
    this.stopAutoRefresh();
  }

  static clearAccessToken() {
    this.accessToken = null;
    sessionStorage.removeItem("access_token");
  }

  static startAutoRefresh() {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }
    if (!this.accessTokenExpiry) return;

    const now = new Date();
    const timeUntilExpiry = this.accessTokenExpiry.getTime() - now.getTime();
    const refreshBeforeExpiry = 15 * 60 * 1000; // 15 minutes in ms
    const delay = Math.max(timeUntilExpiry - refreshBeforeExpiry, 0);

    this.refreshTimeout = window.setTimeout(async () => {
      try {
        await this.refreshTokens();
        this.startAutoRefresh(); // Restart with new expiry
      } catch (error) {
        // If refresh fails, stop auto refresh
        console.error("Auto refresh failed:", error);
      }
    }, delay);
  }

  static stopAutoRefresh() {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }
  }

  static async initializeAuth(): Promise<boolean> {
    const accessToken = this.getAccessToken();
    const refreshToken = this.getRefreshToken();
    const expiry = this.getExpiry();

    // No tokens found
    if (!accessToken || !refreshToken) {
      return false;
    }

    // If no expiry info, tokens are invalid
    if (!expiry) {
      this.clearTokens();
      return false;
    }

    // Tokens exist, check if they're valid
    try {
      // If token is expired or about to expire, try to refresh
      if (this.isTokenExpired()) {
        await this.refreshTokens();
      } else {
        // Token is still valid, start auto-refresh
        this.startAutoRefresh();
      }
      return true;
    } catch (error) {
      // If refresh fails, clear tokens and provide detailed error
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if it's a token not found error
      if (errorMessage.includes("Token not found")) {
        console.error("Refresh token is invalid or expired. User needs to login again.");
      }

      this.clearTokens();
      return false;
    }
  }

  static async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      throw new Error("Login failed");
    }

    const data = await response.json();
    const tokens = data.tokens || data;

    if (tokens?.access?.token && tokens?.refresh?.token) {
      this.setTokens(tokens.access.token, tokens.refresh.token);
      this.setExpiry(tokens.access.expires);
      this.startAutoRefresh();
      return data;
    } else {
      throw new Error("Invalid login response structure");
    }
  }

  static async refreshTokens(): Promise<void> {
    const refreshToken = this.getRefreshToken();

    if (!refreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await fetch(`${API_BASE_URL}/auth/refresh-tokens`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      let errorMessage = "Token refresh failed";

      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        console.error("Token refresh failed with status:", response.status);
      }

      this.clearTokens();
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const tokens = data.tokens || data;

    if (tokens?.access?.token && tokens?.refresh?.token) {
      this.setTokens(tokens.access.token, tokens.refresh.token);
      this.setExpiry(tokens.access.expires);
      this.startAutoRefresh();
    } else {
      this.clearTokens();
      throw new Error("Invalid token response structure");
    }
  }

  static async getDeviceLocations(): Promise<DeviceLocation[]> {
    // Ensure token is valid before making request
    try {
      await this.ensureValidToken();
    } catch (error) {
      this.clearTokens();
      throw new Error("Unauthorized");
    }

    const token = this.getAccessToken();

    if (!token) {
      throw new Error("No access token available");
    }

    let response = await fetch(`${API_BASE_URL}/device-locations`, {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    // Auto refresh token if 401 (backup mechanism)
    if (response.status === 401) {
      try {
        await this.refreshTokens();
        // Retry with new token
        const newToken = this.getAccessToken();
        response = await fetch(`${API_BASE_URL}/device-locations`, {
          method: "GET",
          headers: {
            accept: "application/json",
            Authorization: `Bearer ${newToken}`,
          },
        });
      } catch (error) {
        this.clearTokens();
        throw new Error("Unauthorized");
      }
    }

    if (response.status === 304) {
      // Not Modified - data hasn't changed, return empty array to indicate no update needed
      return [];
    }

    if (!response.ok) {
      throw new Error("Failed to fetch device locations");
    }

    const data: DeviceLocation[] = await response.json();
    return data;
  }

  // Debug helpers - can be called from browser console
  static debugAuthStatus() {
    const status = {
      hasAccessToken: !!this.getAccessToken(),
      hasRefreshToken: !!this.getRefreshToken(),
      expiry: this.getExpiry()?.toISOString() || "not set",
      isExpired: this.isTokenExpired(),
      accessTokenPreview: this.getAccessToken()?.substring(0, 30) + "...",
      refreshTokenPreview: this.getRefreshToken()?.substring(0, 30) + "...",
    };
    console.table(status);
    return status;
  }

  static forceLogout() {
    console.log("[Auth] Force logout - clearing all tokens");
    this.clearTokens();
    window.location.reload();
  }
}

// Expose to window for debugging (only in development)
if (import.meta.env.DEV) {
  (window as any).ApiService = ApiService;
  console.log("[Dev] ApiService exposed to window for debugging");
  console.log("[Dev] Available commands:");
  console.log("  - ApiService.debugAuthStatus() - Check current auth status");
  console.log("  - ApiService.forceLogout() - Clear tokens and reload");
}
