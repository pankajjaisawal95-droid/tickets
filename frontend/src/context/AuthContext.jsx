import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [showLogin, setShowLogin] = useState(false);
  const [loginMobile, setLoginMobile] = useState("");
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  /* LOAD LOGIN ON REFRESH */
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const storedToken = localStorage.getItem("token");

    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser));
      setToken(storedToken);
    }
  }, []);

  /* The axios interceptor fires this when the token can't be refreshed —
     drop the dead session and prompt the user to log in again. */
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setToken(null);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setSessionExpired(true);
      setShowLogin(true);
    };
    window.addEventListener("auth:session-expired", onExpired);
    return () => window.removeEventListener("auth:session-expired", onExpired);
  }, []);

  const openLogin = (prefillMobile = "") => {
    setLoginMobile(typeof prefillMobile === "string" ? prefillMobile : "");
    setShowLogin(true);
  };
  const closeLogin = () => {
    setShowLogin(false);
    setSessionExpired(false);
  };

  const login = (userData, jwtToken) => {
    setUser(userData);
    setToken(jwtToken);
    localStorage.setItem("user", JSON.stringify(userData));
    localStorage.setItem("token", jwtToken);
    setSessionExpired(false);
    window.dispatchEvent(new CustomEvent("auth:login")); // re-arm the expiry prompt
    closeLogin();
  };

  /* Merge updated fields into the stored user (e.g. after editing profile). */
  const updateUser = (partial) => {
    setUser((prev) => {
      const next = { ...(prev || {}), ...partial };
      localStorage.setItem("user", JSON.stringify(next));
      return next;
    });
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    localStorage.removeItem("cart-storage");
  };

  return (
    <AuthContext.Provider
      value={{
        showLogin,
        loginMobile,
        openLogin,
        closeLogin,
        login,
        updateUser,
        logout,
        user,
        token,
        sessionExpired,
        isLoggedIn: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
