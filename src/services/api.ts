import type {
  LoginCredentials,
  LoginResponse,
  DeviceLocation,
} from "../types/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class ApiService {
  private static accessToken: string | null = null;
  private static refreshToken: string | null = null;

  static setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("refresh_token", refreshToken);
  }

  static setAccessToken(token: string) {
    this.accessToken = token;
    localStorage.setItem("access_token", token);
  }

  static getAccessToken(): string | null {
    if (!this.accessToken) {
      this.accessToken = localStorage.getItem("access_token");
    }
    return this.accessToken;
  }

  static getRefreshToken(): string | null {
    if (!this.refreshToken) {
      this.refreshToken = localStorage.getItem("refresh_token");
    }
    return this.refreshToken;
  }

  static clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
  }

  static clearAccessToken() {
    this.accessToken = null;
    localStorage.removeItem("access_token");
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

    const data: LoginResponse = await response.json();
    this.setTokens(data.tokens.access.token, data.tokens.refresh.token);
    return data;
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
      this.clearTokens();
      throw new Error("Token refresh failed");
    }

    const data: LoginResponse = await response.json();
    this.setTokens(data.tokens.access.token, data.tokens.refresh.token);
  }

  static async getDeviceLocations(): Promise<DeviceLocation[]> {
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

    // Auto refresh token if 401
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

    if (!response.ok) {
      throw new Error("Failed to fetch device locations");
    }

    const data: DeviceLocation[] = await response.json();
    return data;
  }
}
