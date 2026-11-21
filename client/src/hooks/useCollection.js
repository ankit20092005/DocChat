import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "../api/client";
import { useInterface } from "../context/Interface";

export function useCollection(path, label) {
  const { notify } = useInterface();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const request = useRef(null);
  const failed = useRef(false);
  const refresh = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    try {
      const { data } = await api.get(path, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setItems(data);
      setError("");
      failed.current = false;
    } catch (e) {
      if (controller.signal.aborted) return;
      const message = errorText(e, "Couldn’t load " + label + ".");
      setError(message);
      if (!failed.current) notify(message, true);
      failed.current = true;
    } finally {
      if (request.current === controller) { request.current = null; setLoading(false); }
    }
  }, [path, label, notify]);
  const update = useCallback((change) => {
    request.current?.abort();
    request.current = null;
    setItems(change);
    setLoading(false);
  }, []);
  useEffect(() => {
    void refresh();
    return () => { request.current?.abort(); request.current = null; };
  }, [refresh]);
  return { items, loading, error, refresh, update };
}
