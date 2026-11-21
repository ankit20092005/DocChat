import { Ellipsis, Files, HardDrive, LogOut, MessageSquare, Plus, X } from "lucide-react";
import { Link } from "react-router";
import { fileSize } from "../hooks/useDocuments";
import { Brand, IconButton, Skeleton } from "./Primitives";

export default function Sidebar({ chats, documents, user, activeId, onNew, onLibrary, onManage, onSignOut, onClose }) {
  const used = documents.items.reduce((total, doc) => total + doc.sizeBytes, 0);
  const total = 200 * 1024 * 1024;
  return <aside className="sidebar" aria-label="Workspace navigation">
    <div className="side-brand"><Brand />{onClose && <IconButton label="Close navigation" onClick={onClose}><X size={19} /></IconButton>}</div>
    <div className="side-actions">
      <button type="button" className="primary new-chat" onClick={onNew}><Plus size={18} />New chat</button>
      <button type="button" className="library-nav" onClick={onLibrary}><Files size={18} /><span>Document library</span>
        <span className="count">{documents.items.length}</span></button>
    </div>
    <nav className="chat-nav" aria-label="Conversations">
      <h2>Conversations</h2>
      {chats.loading ? <Skeleton label="Loading conversations" /> : chats.error ?
        <button className="text-button" onClick={chats.refresh}>Retry conversations</button> :
        !chats.items.length && <p className="side-empty">Your chats will appear here.</p>}
      {chats.items.map((chat) => <div key={chat._id} className={"nav-row" + (activeId === chat._id ? " active" : "")}>
        <Link to={"/workspace/" + chat._id} onClick={onClose} title={chat.title} aria-current={activeId === chat._id ? "page" : undefined}>
          <MessageSquare size={16} /><span>{chat.title}</span>
        </Link>
        <IconButton label={"Manage " + chat.title} onClick={() => onManage(chat)}><Ellipsis size={17} /></IconButton>
      </div>)}
    </nav>
    <div className="storage">
      <div className="storage-title"><HardDrive size={15} />Storage</div>
      <progress value={Math.min(used, total)} max={total} aria-label="Document storage used" />
      <small>{fileSize(used)} of 200 MB used</small>
    </div>
    <div className="account"><span className="avatar">{user.email.slice(0, 1).toUpperCase()}</span>
      <div className="account-text"><strong>My account</strong><span title={user.email}>{user.email}</span></div>
      <IconButton label="Sign out" onClick={onSignOut}><LogOut size={17} /></IconButton>
    </div>
  </aside>;
}
