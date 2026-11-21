import { useId, useLayoutEffect, useRef } from "react";
import { BookOpenText, Moon, Sun, X } from "lucide-react";
import { useInterface } from "../context/Interface";

export function Brand({ light = false }) {
  return <span className={"brand" + (light ? " brand-light" : "")}>
    <span className="brand-symbol"><BookOpenText aria-hidden="true" size={23} strokeWidth={1.8} /></span>
    DocChat
  </span>;
}

export function IconButton({ label, children, className = "", ...props }) {
  return <button type="button" className={"icon-button " + className} title={label} aria-label={label} {...props}>{children}</button>;
}

export function ThemeButton() {
  const { theme, toggleTheme } = useInterface();
  const Icon = theme === "light" ? Moon : Sun;
  return <IconButton label={"Use " + (theme === "light" ? "dark" : "light") + " theme"} onClick={toggleTheme}><Icon size={18} /></IconButton>;
}

export function Dialog({ title, onDismiss, children, variant = "center", hideHeader = false }) {
  const ref = useRef(null);
  const heading = useId();
  const { registerLayer } = useInterface();
  useLayoutEffect(() => {
    const node = ref.current;
    node.showModal();
    const unregister = registerLayer(node);
    return () => { unregister(); node.close(); };
  }, [registerLayer]);
  return <dialog ref={ref} className={"dialog dialog-" + variant} aria-labelledby={heading}
    onCancel={(e) => { e.preventDefault(); onDismiss(); }}
    onClick={(e) => {
      if (e.target !== e.currentTarget) return;
      const r = e.currentTarget.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onDismiss();
    }}>
    {hideHeader ? <h2 id={heading} className="sr-only">{title}</h2> : <header className="dialog-header">
      <h2 id={heading}>{title}</h2><IconButton label={"Close " + title.toLowerCase()} onClick={onDismiss}><X size={19} /></IconButton>
    </header>}
    {children}
  </dialog>;
}

export function Skeleton({ count = 3, label = "Loading" }) {
  return <div className="skeleton-group" role="status" aria-label={label}>
    {Array.from({ length: count }, (_, i) => <span key={i} className="skeleton-line" />)}
  </div>;
}
