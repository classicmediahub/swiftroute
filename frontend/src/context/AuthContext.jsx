import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("swiftroute_token"));
  const [user, setUser] = useState(null);
  const [agentProfile, setAgentProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async (t) => {
    if (!t) {
      setUser(null);
      setAgentProfile(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api.me(t);
      setUser(data.user);
      setAgentProfile(data.agent_profile || null);
    } catch {
      localStorage.removeItem("swiftroute_token");
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function login(newToken, newUser, newAgentProfile) {
    localStorage.setItem("swiftroute_token", newToken);
    setToken(newToken);
    setUser(newUser);
    setAgentProfile(newAgentProfile || null);
  }

  function logout() {
    localStorage.removeItem("swiftroute_token");
    setToken(null);
    setUser(null);
    setAgentProfile(null);
  }

  return (
    <AuthContext.Provider value={{ token, user, agentProfile, loading, login, logout, refresh: () => loadMe(token) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
