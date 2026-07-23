import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Starts null on both server and client. The actual stored token is only
  // ever read inside useEffect below, which never runs during server-side
  // rendering — only after the real browser has mounted the page. Reading
  // localStorage directly in a useState initializer (the previous code)
  // runs during render itself, which is exactly what crashes prerendering,
  // since there's no localStorage in that Node environment.
  const [token, setToken] = useState(null);
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
      localStorage.removeItem("pickandearn_token");
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("pickandearn_token");
    setToken(stored);
    loadMe(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function login(newToken, newUser, newAgentProfile) {
    localStorage.setItem("pickandearn_token", newToken);
    setToken(newToken);
    setUser(newUser);
    setAgentProfile(newAgentProfile || null);
  }

  function logout() {
    localStorage.removeItem("pickandearn_token");
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
