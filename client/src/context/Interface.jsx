import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { createPortal } from "react-dom";

const Interface = createContext(null);
function Toast({ item, dismiss }) {
  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), item.error ? 7500 : 4500);
    return () => clearTimeout(timer);
  }, [item, dismiss]);
  const Icon = item.error ? CircleAlert : CircleCheck;
  return <div className="toast" role={item.error ? "alert" : "status"}>
    <Icon size={19} className={item.error ? "danger-text" : "accent-text"} />
    <span>{item.text}</span><button className="icon-button" onClick={() => dismiss(item.id)} aria-label="Dismiss notification"><X size={16} /></button>
  </div>;
}

export function InterfaceProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("docchat.theme") === "dark" ? "dark" : "light");
  const [toasts, setToasts] = useState([]);
  const [layers, setLayers] = useState([]);
  const registerLayer = useCallback((node) => {
    setLayers((items) => [...items, node]);
    return () => setLayers((items) => items.filter((item) => item !== node));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("docchat.theme", theme);
  }, [theme]);
  const notify = useCallback((text, error = false) => {
    setToasts((items) => [...items.slice(-2), { id: crypto.randomUUID(), text, error }]);
  }, []);
  const dismiss = useCallback((id) => setToasts((items) => items.filter((item) => item.id !== id)), []);
  return <Interface.Provider value={{ notify, theme, registerLayer, toggleTheme: () => setTheme((t) => t === "light" ? "dark" : "light") }}>
    {children}
    {createPortal(<div className="toast-stack">{toasts.map((item) => <Toast key={item.id} item={item} dismiss={dismiss} />)}</div>, layers.at(-1) ?? document.body)}
  </Interface.Provider>;
}
export const useInterface = () => useContext(Interface);
