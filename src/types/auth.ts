export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  isEmailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Token {
  token: string;
  expires: string;
}

export interface Tokens {
  access: Token;
  refresh: Token;
}

export interface LoginResponse {
  user: User;
  tokens: Tokens;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export type DeviceLocation = [number, number]; // [longitude, latitude]
