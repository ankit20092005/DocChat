import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, forgetToken, readToken, sessionEvent, tokenKey } from "../api/client";
import { useInterface } from "./Interface";

const Auth = createContext(null);
const guest = { status: "guest", user: null };

export function AuthProvider({ children }) {
  const { notify } = useInterface();
  const [state, setState] = useState(() => readToken() ? { status: "checking" } : guest);
  const lookup = useRef(null);
  const sync = useCallback(async () => {
    lookup.current?.abort();
    const token = readToken();
    if (!token) { setState(guest); return; }
    const controller = new AbortController();
    lookup.current = controller;
    setState({ status: "checking" });
    try {
      const { data } = await api.get("/auth/me", { signal: controller.signal });
      if (!controller.signal.aborted && readToken() === token) setState({ status: "signed", user: data.user ?? data });
    } catch {
      if (!controller.signal.aborted && readToken() === token) setState({ status: "offline" });
    }
  }, []);
  useEffect(() => {
    void sync();
    const storage = (e) => { if (e.key === tokenKey || e.key === null) void sync(); };
    window.addEventListener("storage", storage);
    const sessionChanged = (event) => {
      if (event.detail?.expired) notify("Your session expired. Sign in to continue.", true);
      void sync();
    };
    window.addEventListener(sessionEvent, sessionChanged);
    return () => {
      lookup.current?.abort();
      window.removeEventListener("storage", storage);
      window.removeEventListener(sessionEvent, sessionChanged);
    };
  }, [sync, notify]);
  async function signIn(mode, email, password, signal) {
    const { data } = await api.post("/auth/" + mode, { email, password }, { publicRequest: true, signal });
    if (signal.aborted) return;
    lookup.current?.abort();
    localStorage.setItem(tokenKey, data.token);
    setState({ status: "signed", user: data.user });
  }
  return <Auth.Provider value={{ ...state, signIn, retry: sync, signOut: () => forgetToken(readToken()) }}>{children}</Auth.Provider>;
}

export const useAuth = () => useContext(Auth);
