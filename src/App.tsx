import { useState } from "react";
import Login from "./components/Login";
import MapView from "./components/MapView";
import { ApiService } from "./services/api";
import type { User } from "./types/auth";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!ApiService.getAccessToken();
  });

  const handleLoginSuccess = (_loggedInUser: User) => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    ApiService.clearTokens();
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return <MapView onLogout={handleLogout} />;
}
