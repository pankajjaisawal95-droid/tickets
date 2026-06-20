import { createContext, useCallback, useContext, useState } from "react";

// No-op default so calling useToast() outside the provider never throws (it just
// won't render a toast) — a missing provider can't break the booking flow.
const NOOP = { show: () => {}, success: () => {}, error: () => {}, info: () => {} };
const ToastContext = createContext(NOOP);

/** useToast() → { success, error, info, show } */
export const useToast = () => useContext(ToastContext);

let counter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, type = "info", ms = 3500) => {
      const id = ++counter;
      setToasts((list) => [...list, { id, message, type }]);
      if (ms > 0) setTimeout(() => remove(id), ms);
      return id;
    },
    [remove]
  );

  const api = {
    show: push,
    success: (m, ms) => push(m, "success", ms),
    error: (m, ms) => push(m, "error", ms),
    info: (m, ms) => push(m, "info", ms),
  };

  const icon = (type) =>
    type === "success" ? "check_circle" : type === "error" ? "error" : "info";

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.type}`}
            onClick={() => remove(t.id)}
          >
            <span className="material-symbols-outlined">{icon(t.type)}</span>
            <span className="toast-msg">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
