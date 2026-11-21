import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ChevronRight, Files, Menu, Pencil, Trash2 } from "lucide-react";
import { api, errorText } from "../api/client";
import { useAuth } from "../context/Auth";
import { useInterface } from "../context/Interface";
import { useChatStream } from "../hooks/useChatStream";
import { useCollection } from "../hooks/useCollection";
import { useDocuments } from "../hooks/useDocuments";
import ChatPane from "../components/ChatPane";
import Sidebar from "../components/Sidebar";
import { Library, SourcePanel } from "../components/Library";
import { Dialog, IconButton, ThemeButton } from "../components/Primitives";

function EditDialog({ action, onDismiss, onDelete, onCommit }) {
  const editing = action.kind === "rename";
  const doc = action.kind === "deleteDoc";
  const title = editing ? "Manage conversation" : doc ? "Delete document?" : "Delete conversation?";
  const [value, setValue] = useState(action.item.title ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function submit(e) {
    e.preventDefault();
    if (pending.current || (editing && !value.trim())) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError("");
    try { await onCommit(action, value.trim(), controller.signal); }
    catch (e) { if (!controller.signal.aborted) setError(errorText(e, "Couldn’t save that change. Please try again.")); }
    finally { pending.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  return <Dialog title={title} onDismiss={() => { if (!busy) onDismiss(); }}>
    <form className="edit-form" onSubmit={submit}>
      {editing ? <><label htmlFor="chat-title">Conversation title</label>
        <div className="field"><Pencil size={16} /><input id="chat-title" autoFocus required maxLength={200} value={value}
          onChange={(e) => setValue(e.target.value)} /></div></> :
        <p>{doc ? <>Deleting <strong>{action.item.filename}</strong> removes it from your library and chats that use it.</> :
          <>Deleting <strong>{action.item.title}</strong> also deletes its messages.</>}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        {editing && <IconButton label="Delete this conversation" className="danger-text" disabled={busy} onClick={onDelete}><Trash2 size={17} /></IconButton>}
        <button type="button" className="secondary" disabled={busy} onClick={onDismiss}>Cancel</button>
        <button className={editing ? "primary" : "danger-button"} disabled={busy || (editing && !value.trim())}>
          {editing ? "Save changes" : "Delete"}</button>
      </div>
    </form>
  </Dialog>;
}

export default function Workspace() {
  const { chatId = null } = useParams();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { notify } = useInterface();
  const chats = useCollection("/conversations", "conversations");
  const documents = useDocuments();
  const stream = useChatStream(chatId);
  const [selected, setSelected] = useState(() => new Set());
  const [draft, setDraft] = useState("");
  const [panel, setPanel] = useState(null);
  const [source, setSource] = useState(null);
  const [action, setAction] = useState(null);
  const [creating, setCreating] = useState(false);
  const pending = useRef(null);
  const mounted = useRef(false);
  const active = chats.items.find((item) => item._id === chatId);
  const available = chatId ? new Set(active?.docIds ?? []) : selected;
  const readyIds = documents.items.filter((doc) => doc.status === "ready" && available.has(doc._id)).map((doc) => doc._id);
  const title = active?.title || (chatId ? "Conversation" : "New chat");
  useEffect(() => { document.title = title + " · DocChat"; }, [title]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pending.current?.abort(); };
  }, []);
  useEffect(() => {
    setDraft(""); setPanel(null); setSource(null); setAction(null); setCreating(false);
    return () => { pending.current?.abort(); pending.current = null; };
  }, [chatId]);

  function newChat() {
    pending.current?.abort(); pending.current = null;
    setCreating(false); setDraft(""); setPanel(null);
    navigate("/workspace");
  }
  function toggle(id) {
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  async function send(question) {
    if (pending.current || stream.streaming || stream.loading || !readyIds.length) return;
    let id = chatId;
    if (!id) {
      const controller = new AbortController();
      pending.current = controller;
      setCreating(true);
      try {
        const { data } = await api.post("/conversations", {
          title: Array.from(question.replace(/\s+/g, " ")).slice(0, 80).join(""), docIds: readyIds
        }, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const chat = data.conversation ?? data;
        id = chat._id;
        chats.update((all) => [chat, ...all.filter((item) => item._id !== id)]);
      } catch (e) {
        if (!controller.signal.aborted) notify(errorText(e, "Couldn’t create the conversation."), true);
        return;
      } finally {
        if (pending.current === controller) pending.current = null;
        if (!controller.signal.aborted) setCreating(false);
      }
      navigate("/workspace/" + id, { replace: true });
    }
    setDraft("");
    await stream.send(id, question, !chatId);
    if (mounted.current) void chats.refresh();
  }
  async function commit({ kind, item }, value, signal) {
    if (kind === "rename") {
      const { data } = await api.patch("/conversations/" + item._id, { title: value }, { signal });
      if (signal.aborted) return;
      chats.update((all) => [data.conversation ?? data, ...all.filter((chat) => chat._id !== item._id)]);
    } else if (kind === "deleteChat") {
      await api.delete("/conversations/" + item._id, { signal });
      if (signal.aborted) return;
      chats.update((all) => all.filter((chat) => chat._id !== item._id));
      if (item._id === chatId) navigate("/workspace", { replace: true });
    } else {
      await api.delete("/documents/" + item._id, { signal });
      if (signal.aborted) return;
      documents.update((all) => all.filter((doc) => doc._id !== item._id));
      setSelected((old) => { const next = new Set(old); next.delete(item._id); return next; });
      chats.update((all) => all.map((chat) => ({ ...chat, docIds: chat.docIds.filter((id) => id !== item._id) })));
    }
    notify(kind === "rename" ? "Conversation renamed." : kind === "deleteChat" ? "Conversation deleted." : "Document deleted.");
    setAction(null);
  }
  const sidebarProps = { chats, documents, user, activeId: chatId, onNew: newChat, onLibrary: () => setPanel("library"),
    onManage: (item) => { setPanel(null); setAction({ kind: "rename", item }); }, onSignOut: signOut };
  return <div className="workspace">
    <a className="skip-link" href="#chat-main">Skip to chat</a>
    <div className="desktop-sidebar"><Sidebar {...sidebarProps} /></div>
    <main id="chat-main" tabIndex={-1} className="chat-main">
      <header className="workspace-header">
        <IconButton label="Open navigation" className="nav-toggle" onClick={() => setPanel("nav")}><Menu size={20} /></IconButton>
        <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong title={title}>{title}</strong></div>
        <div className="header-actions"><button className="header-library" onClick={() => setPanel("library")} aria-label="Open library">
          <Files size={16} /><span>Library</span></button><ThemeButton /></div>
      </header>
      <ChatPane chatId={chatId} stream={stream} draft={draft} setDraft={setDraft} readyCount={readyIds.length}
        documents={documents} creating={creating} onSend={send} onNew={newChat} onSource={setSource} onLibrary={() => setPanel("library")} />
    </main>
    {panel === "nav" && <Dialog variant="nav" title="Navigation" hideHeader onDismiss={() => setPanel(null)}>
      <Sidebar {...sidebarProps} onClose={() => setPanel(null)} /></Dialog>}
    {panel === "library" && <Library documents={documents} selected={selected} onToggle={toggle}
      onDelete={(item) => setAction({ kind: "deleteDoc", item })} onDismiss={() => setPanel(null)} />}
    {source && <SourcePanel source={source} onDismiss={() => setSource(null)} />}
    {action && <EditDialog key={action.kind + action.item._id} action={action} onDismiss={() => setAction(null)}
      onDelete={() => setAction({ kind: "deleteChat", item: action.item })} onCommit={commit} />}
  </div>;
}
