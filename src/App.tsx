import { useState, useEffect } from "react";
import Login from "./components/Login";
import MapView from "./components/MapView";
import { ApiService } from "./services/api";
import type { User } from "./types/auth";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    // Initialize auth on app load
    const initAuth = async () => {
      try {
        const isValid = await ApiService.initializeAuth();
        setIsAuthenticated(isValid);

        // If tokens were found but validation failed, show message
        if (!isValid && (ApiService.getAccessToken() || ApiService.getRefreshToken())) {
          setInitError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        }
      } catch (error) {
        console.error("Auth initialization error:", error);
        setIsAuthenticated(false);
      } finally {
        setIsInitializing(false);
      }
    };

    initAuth();
  }, []);

  const handleLoginSuccess = (_loggedInUser: User) => {
    setInitError(null);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    ApiService.clearTokens();
    setIsAuthenticated(false);
  };

  // Show loading while checking auth status
  if (isInitializing) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          background: "#0a0a0a",
          color: "#fff",
          fontSize: "18px",
        }}
      >
        Đang kiểm tra phiên đăng nhập...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} initError={initError} />;
  }

  return <MapView onLogout={handleLogout} />;
}
