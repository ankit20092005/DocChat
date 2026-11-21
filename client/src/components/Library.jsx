import { useRef, useState } from "react";
import { BookMarked, Check, FileText, FileUp, LoaderCircle, Trash2, X } from "lucide-react";
import { fileSize } from "../hooks/useDocuments";
import { Dialog, IconButton, Skeleton } from "./Primitives";

const statusIcons = { ready: Check, processing: LoaderCircle, failed: X };

export function Library({ documents, selected, onToggle, onDelete, onDismiss }) {
  const picker = useRef(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const { items, progress, uploadFiles, loading, error, refresh } = documents;
  const count = items.filter((doc) => doc.status === "ready" && selected.has(doc._id)).length;
  return <Dialog title="Document library" variant="sheet" onDismiss={onDismiss}>
    <div className="sheet-body">
      <p className="panel-intro">Upload PDFs and select which ones to use in your next chat.</p>
      <input ref={picker} className="sr-only" type="file" tabIndex={-1} multiple accept="application/pdf,.pdf" aria-label="PDF files"
        onChange={(e) => { const files = Array.from(e.target.files); e.target.value = ""; void uploadFiles(files); }} />
      <button type="button" className={"drop-zone" + (dragging ? " dragging" : "")} aria-disabled={!!progress}
        onClick={() => { if (!progress) picker.current.click(); }}
        onDragEnter={(e) => { e.preventDefault(); depth.current++; setDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = progress ? "none" : "copy"; }}
        onDragLeave={(e) => { e.preventDefault(); if (--depth.current <= 0) { depth.current = 0; setDragging(false); } }}
        onDrop={(e) => { e.preventDefault(); depth.current = 0; setDragging(false); void uploadFiles(Array.from(e.dataTransfer.files)); }}>
        <span className="upload-icon"><FileUp size={24} /></span><strong>{dragging ? "Drop to upload" : "Drop PDFs here or browse"}</strong>
        <small>Up to 50 MB per PDF · 500 pages</small>
      </button>
      {progress && <div className="upload-progress" role="status">
        <div><span>Uploading {progress.name}</span><strong>{progress.percent}%</strong></div>
        <progress aria-label="Upload progress" value={progress.percent} max={100} />
        {progress.total > 1 && <small>File {progress.index} of {progress.total}</small>}
      </div>}
      <div className="section-label"><h3>Your documents</h3><span>{items.length} of 10</span></div>
      {loading && <Skeleton label="Loading documents" />}
      {error && <div className="inline-error"><span>{error}</span><button className="text-button" onClick={refresh}>Retry</button></div>}
      {!loading && !error && !items.length && <div className="library-empty"><BookMarked size={28} /><h4>No documents yet</h4>
        <p>Upload your first PDF to start a chat with it.</p></div>}
      <ul className="doc-list">{items.map((doc) => {
        const Status = statusIcons[doc.status] ?? FileText;
        return <li key={doc._id}>
          <div className="doc-row"><input type="checkbox" checked={doc.status === "ready" && selected.has(doc._id)} disabled={doc.status !== "ready"}
            aria-label={"Use " + doc.filename + " in new chats"} onChange={() => onToggle(doc._id)} />
            <div className="doc-info"><strong>{doc.filename}</strong><small>
              {fileSize(doc.sizeBytes)}{doc.pages > 0 && " · " + doc.pages + (doc.pages === 1 ? " page" : " pages")}</small>
              <span className={"status status-" + doc.status}><Status size={12} className={doc.status === "processing" ? "spin" : ""} />{doc.status}</span>
            </div>
            <IconButton label={"Delete " + doc.filename} onClick={() => onDelete(doc)}><Trash2 size={16} /></IconButton>
          </div>
          {doc.status === "failed" && <p className="doc-error">{doc.error || "Processing failed. Try uploading the PDF again."}</p>}
        </li>;
      })}</ul>
    </div>
    <footer className="sheet-footer"><span>{count} selected for new chats</span><button className="primary" onClick={onDismiss}>Done</button></footer>
  </Dialog>;
}

export function SourcePanel({ source, onDismiss }) {
  return <Dialog title="Source details" variant="sheet" onDismiss={onDismiss}>
    <div className="sheet-body source-body">
      <span className="file-stamp"><FileText size={25} /></span><h3>{source.filename}</h3>
      <dl className="source-metrics"><div><dt>Page</dt><dd>{source.page}</dd></div>
        <div><dt>Relevance score</dt><dd>{Number.isFinite(source.score) ? source.score.toFixed(3) : "Unavailable"}</dd></div></dl>
      <h4>Document excerpt</h4><blockquote>{source.text}</blockquote>
    </div>
  </Dialog>;
}
