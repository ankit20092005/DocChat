import { useLayoutEffect, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlignLeft, ArrowUp, ArrowUpRight, BookOpenText, Copy, FileText, Files, List, Plus, Square } from "lucide-react";
import { useInterface } from "../context/Interface";
import { IconButton, Skeleton } from "./Primitives";

const starters = [
  { Icon: AlignLeft, label: "Summarize key points", question: "Summarize the key points in these documents." },
  { Icon: List, label: "Find supporting evidence", question: "What evidence do these documents give for their main claims?" }
];
const markdownComponents = {
  a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  img: ({ alt }) => alt || null,
  table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>
};

function Welcome({ hasDocuments, readyCount, existing, onLibrary, onNew, onStarter }) {
  const description = readyCount ? "Ask a question and follow each citation back to the page." :
    existing ? "This chat needs a ready PDF. Start a new chat to choose different documents." :
    hasDocuments ? "Select at least one ready document to start asking questions." : "Upload your first PDF to start a conversation with it.";
  return <div className="welcome">
    <div className="desk-banner">
      <img src="/reading-room.webp" alt="" className="desk-art" />
      <div className="desk-copy"><h1>Ask your<br /><em>documents.</em></h1><p>{description}</p>
        {!readyCount && <button className="banner-button" onClick={existing ? onNew : onLibrary}>
          <Plus size={15} />{existing ? "New chat" : hasDocuments ? "Choose documents" : "Upload a PDF"}</button>}
      </div>
    </div>
    {readyCount > 0 && <div className="starter-grid">{starters.map(({ Icon, label, question }) =>
      <button key={label} type="button" onClick={() => onStarter(question)}><Icon size={18} /><span>{label}</span><ArrowUpRight size={15} /></button>
    )}</div>}
  </div>;
}

function Answer({ message, pending, onSource }) {
  const { notify } = useInterface();
  async function copy() {
    try { await navigator.clipboard.writeText(message.content); notify("Answer copied."); }
    catch { notify("Couldn’t copy the answer. Select its text to copy it.", true); }
  }
  return <article className="answer" aria-label="Assistant answer" aria-busy={pending}>
    <header className="answer-heading"><span className="answer-symbol"><BookOpenText size={16} /></span>DocChat</header>
    {message.content ? <div className="markdown"><Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{message.content}</Markdown></div> :
      pending && <div className="thinking" role="status" aria-label="Generating an answer"><i /><i /><i /></div>}
    {message.sources?.length > 0 && <div className="citations" aria-label="Sources">{message.sources.map((source, i) =>
      <button key={source.chunk_id ?? i} className="citation" onClick={() => onSource(source)}>
        <FileText size={13} /><span>{"[" + source.filename + ", p." + source.page + "]"}</span>
      </button>
    )}</div>}
    {!pending && message.content && <IconButton className="copy-answer" label="Copy answer" onClick={copy}><Copy size={15} /></IconButton>}
  </article>;
}

export default function ChatPane({ chatId, stream, draft, setDraft, readyCount, documents, creating, onSend, onSource, onLibrary, onNew }) {
  const scroller = useRef(null);
  const pinned = useRef(true);
  const input = useRef(null);
  const busy = stream.streaming || creating;
  const blocked = stream.loading || stream.phase === "error" || documents.loading || !readyCount;
  useLayoutEffect(() => { pinned.current = true; }, [chatId]);
  useLayoutEffect(() => {
    if (pinned.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [chatId, stream.messages, stream.loading]);
  useLayoutEffect(() => {
    if (!input.current) return;
    input.current.style.height = "auto";
    input.current.style.height = Math.min(input.current.scrollHeight, 140) + "px";
  }, [draft]);
  function submit(e) {
    e.preventDefault();
    if (busy || blocked || !draft.trim()) return;
    pinned.current = true;
    void onSend(draft.trim());
  }
  const status = readyCount ? readyCount + (readyCount === 1 ? " document" : " documents") :
    chatId ? "No ready documents in this chat" : "No ready documents selected";
  return <>
    <section className="chat-scroll" aria-label="Chat messages" ref={scroller} onScroll={() => {
      const el = scroller.current;
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 85;
    }}>
      <div className="reading-column">
        {stream.loading || (!chatId && documents.loading) ? <Skeleton count={4} label="Loading chat" /> :
          stream.phase === "error" ? <div className="load-failed"><h1>Couldn’t open this chat</h1><p>{stream.error}</p>
            <button className="secondary" onClick={stream.reload}>Try again</button></div> :
          stream.messages.length ? <div className="thread" role="log" aria-label="Conversation messages" aria-live="polite"
            aria-busy={stream.streaming}>{stream.messages.map((message, index) =>
            message.role === "user" ? <article key={message._id ?? index} className="question" aria-label="Your question">
              <span>You</span><p>{message.content}</p></article> :
              <Answer key={message._id ?? index} message={message} onSource={onSource} pending={stream.streaming && index === stream.messages.length - 1} />
          )}</div> :
          <Welcome hasDocuments={!!documents.items.length} readyCount={readyCount} existing={!!chatId} onLibrary={onLibrary} onNew={onNew}
            onStarter={(value) => { setDraft(value); input.current?.focus(); }} />}
      </div>
    </section>
    <footer className="composer-region"><div className="composer-wrap">
      <form className="composer" onSubmit={submit}>
        <label htmlFor="question" className="sr-only">Your question</label>
        <textarea id="question" ref={input} rows={1} maxLength={16000} value={draft} disabled={busy}
          placeholder="Ask a question about your documents…" onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault(); e.currentTarget.form.requestSubmit();
            }
          }} />
        <div className="composer-tools"><button type="button" className="document-context" onClick={onLibrary} aria-label={"Open document library. " + status}>
          <Files size={15} /><span>{status}</span></button>
          {stream.streaming ? <button type="button" className="stop-button" onClick={stream.stop}><Square size={12} fill="currentColor" />Stop generating</button> :
            <button className="send-button" disabled={busy || blocked || !draft.trim()} aria-label="Send question" title="Send question"><ArrowUp size={19} /></button>}
        </div>
      </form>
      <p className="composer-note">{stream.streaming ? "Generating an answer…" : "Answers include citations you can open to read the source."}</p>
    </div></footer>
  </>;
}
