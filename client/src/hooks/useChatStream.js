import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText, openAnswer } from "../api/client";
import { readChatStream } from "../api/stream";
import { useInterface } from "../context/Interface";

const empty = (id) => ({ id, messages: [], phase: "ready", error: "" });

export function useChatStream(chatId) {
  const { notify } = useInterface();
  const [view, setView] = useState(() => empty(null));
  const current = useRef({ id: undefined });

  const select = useCallback((id) => {
    const previous = current.current;
    current.current = { id };
    previous.reader?.abort();
    previous.writer?.abort();
    return current.current;
  }, []);

  const load = useCallback(async (id) => {
    const slot = select(id);
    if (!id) { setView(empty(null)); return; }
    const reader = new AbortController();
    slot.reader = reader;
    setView({ ...empty(id), phase: "loading" });
    try {
      const { data } = await api.get("/conversations/" + id + "/messages", { signal: reader.signal });
      if (current.current === slot) setView({ ...empty(id), messages: data });
    } catch (e) {
      if (current.current !== slot) return;
      const message = errorText(e, "Couldn’t load this conversation.");
      setView({ ...empty(id), phase: "error", error: message });
      notify(message, true);
    } finally { slot.reader = null; }
  }, [select, notify]);

  useEffect(() => {
    if (current.current.id !== chatId) void load(chatId);
  }, [chatId, load]);
  useEffect(() => () => { select(undefined); }, [select]);

  async function send(id, question, fresh = false) {
    // A draft gets its server ID just before routing. Keep that new stream alive on navigation.
    const slot = fresh ? select(id) : current.current;
    if (slot.id !== id || slot.writer || slot.reader) return;
    const writer = new AbortController();
    slot.writer = writer;
    const user = { _id: crypto.randomUUID(), role: "user", content: question };
    const answer = { _id: crypto.randomUUID(), role: "assistant", content: "", sources: [] };
    setView((old) => ({ ...empty(id), phase: "streaming", messages: [...(fresh ? [] : old.messages), user, answer] }));
    function amend(fn) {
      if (current.current !== slot) return;
      setView((old) => old.id !== id ? old : {
        ...old, messages: old.messages.map((m) => m._id === answer._id ? fn(m) : m)
      });
    }
    try {
      const body = await openAnswer(id, question, writer.signal);
      await readChatStream(body,
        (piece) => amend((m) => ({ ...m, content: m.content + piece })),
        (sources) => amend((m) => ({ ...m, sources })), writer.signal);
      if (current.current === slot) setView((old) => ({ ...old, phase: "ready" }));
    } catch (e) {
      if (current.current !== slot) return;
      if (writer.signal.aborted) notify("Generation stopped.");
      else notify(errorText(e, "The answer was interrupted."), true);
      // Express retains accepted questions and commits only completed answers.
      await load(id);
    } finally { slot.writer = null; }
  }
  return {
    ...view, send, reload: () => load(chatId), stop: () => current.current.writer?.abort(),
    loading: view.id !== chatId || view.phase === "loading", streaming: view.phase === "streaming" && view.id === chatId
  };
}
