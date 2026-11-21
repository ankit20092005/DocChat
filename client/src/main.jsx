import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import "@fontsource-variable/dm-sans";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "./styles.css";
import { AuthProvider, useAuth } from "./context/Auth";
import { InterfaceProvider } from "./context/Interface";
import { Brand, Skeleton } from "./components/Primitives";
import AuthPage from "./pages/AuthPage";
const Workspace = lazy(() => import("./pages/Workspace"));

function Gate({ privatePage = false }) {
  const { status, retry, signOut } = useAuth();
  const location = useLocation();
  if (status === "checking" || status === "offline") return <main className="session-state">
    <Brand />{status === "checking" ? <Skeleton label="Loading your workspace" /> : <>
      <h1>Workspace unavailable</h1><p>Check your connection and try again.</p>
      <button className="primary" onClick={retry}>Try again</button><button className="text-button" onClick={signOut}>Sign out</button>
    </>}
  </main>;
  if (privatePage && status !== "signed") return <Navigate replace to="/login" state={{ from: location.pathname }} />;
  if (!privatePage && status === "signed") {
    const from = location.state?.from;
    return <Navigate replace to={typeof from === "string" && /^\/workspace(?:\/|$)/.test(from) ? from : "/workspace"} />;
  }
  return <Outlet />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode><BrowserRouter><InterfaceProvider><AuthProvider><Routes>
    <Route element={<Gate />}><Route path="/login" element={<AuthPage key="login" />} />
      <Route path="/register" element={<AuthPage key="register" register />} /></Route>
    <Route element={<Gate privatePage />}><Route path="/workspace/:chatId?" element={
      <Suspense fallback={<main className="session-state"><Brand /><Skeleton label="Opening workspace" /></main>}><Workspace /></Suspense>
    } /></Route>
    <Route path="*" element={<Navigate replace to="/workspace" />} />
  </Routes></AuthProvider></InterfaceProvider></BrowserRouter></StrictMode>
);
