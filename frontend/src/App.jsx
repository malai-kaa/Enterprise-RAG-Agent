import { useEffect, useRef, useState } from "react";

import {
  Sparkles,
  Plus,
  MessageSquare,
  Files,
  Settings,
  Search,
  Bell,
  Upload,
  FileText,
  Send,
  SlidersHorizontal,
  ExternalLink,
  X,
  Filter,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  CheckCircle2,
  Database,
  FileUp,
  Trash2,
} from "lucide-react";

import "./App.css";

const API_URL = "http://127.0.0.1:8000";

function App() {
  const [message, setMessage] = useState("");
  const [activeNav, setActiveNav] = useState("Chat");

  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loadingAnswer, setLoadingAnswer] = useState(false);

  const [selectedDocument, setSelectedDocument] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);

  // IMPORTANT:
  // This keeps the chat input focused after buttons are clicked.
  const messageInputRef = useRef(null);

  const [messages, setMessages] = useState([
    {
      type: "user",
      text: "What are the key findings of the research mentioned in the uploaded documents?",
      time: "10:30 AM",
    },
    {
      type: "ai",
      text: `Based on the uploaded documents, here are the key findings:

1. The research identifies 3 major factors contributing to the increase in customer churn, with pricing sensitivity being the most significant.

2. The analysis shows a 23% increase in user engagement when using personalized recommendations.

3. Market trends indicate a shift towards AI-powered solutions.

These findings provide a comprehensive understanding of the current landscape.`,
      time: "10:30 AM",
      sources: [],
    },
    {
      type: "user",
      text: "Can you explain the methodology used in the study?",
      time: "10:31 AM",
    },
    {
      type: "ai",
      text: `The study used a mixed-methods approach combining quantitative analysis of user behavior with qualitative interviews.

The methodology consisted of three phases: data collection, analysis, and validation.

In the first phase, behavioral data including session duration, feature usage, and conversion metrics were collected and analyzed.`,
      time: "10:31 AM",
      sources: [],
    },
  ]);

  // =========================================================
  // KEEP CHAT INPUT READY
  // =========================================================

  const focusMessageInput = () => {
    requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  };

  // =========================================================
  // LOAD DOCUMENTS
  // =========================================================

  const loadDocuments = async () => {
    try {
      const response = await fetch(`${API_URL}/documents`);

      if (!response.ok) {
        throw new Error("Could not load documents.");
      }

      const data = await response.json();

      setDocuments(data.documents || []);

      if (!selectedDocument && data.documents?.length > 0) {
        setSelectedDocument(data.documents[0]);
      }
    } catch (error) {
      console.error("Could not load documents:", error);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  // =========================================================
  // UPLOAD
  // =========================================================

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      focusMessageInput();
      return;
    }

    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Upload failed.");
      }

      await loadDocuments();

      alert(`${file.name} uploaded successfully.`);
    } catch (error) {
      console.error("Upload error:", error);
      alert(error.message || "Something went wrong while uploading.");
    } finally {
      setUploading(false);
      event.target.value = "";

      // Return focus to chat input after upload.
      focusMessageInput();
    }
  };

  // =========================================================
  // DELETE DOCUMENT
  // =========================================================

  const deleteDocument = async (documentId) => {
    const confirmed = window.confirm(
      "Are you sure you want to remove this document?"
    );

    if (!confirmed) {
      focusMessageInput();
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/documents/${documentId}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not delete document.");
      }

      if (selectedDocument?.id === documentId) {
        setSelectedDocument(null);
      }

      await loadDocuments();
    } catch (error) {
      console.error("Delete error:", error);
      alert(error.message || "Could not delete document.");
    }

    focusMessageInput();
  };

  // =========================================================
  // ASK QUESTION
  // =========================================================

  const sendMessage = async () => {
    const userMessage = message.trim();

    if (!userMessage || loadingAnswer) {
      focusMessageInput();
      return;
    }

    setMessages((previous) => [
      ...previous,
      {
        type: "user",
        text: userMessage,
        time: "Now",
      },
    ]);

    setMessage("");
    setLoadingAnswer(true);

    // Keep the input focused immediately.
    focusMessageInput();

    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: userMessage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Something went wrong.");
      }

      setMessages((previous) => [
        ...previous,
        {
          type: "ai",
          text: data.answer,
          time: "Now",
          sources: data.sources || [],
        },
      ]);
    } catch (error) {
      console.error("Question error:", error);

      setMessages((previous) => [
        ...previous,
        {
          type: "ai",
          text: `Sorry, something went wrong: ${error.message}`,
          time: "Now",
          sources: [],
        },
      ]);
    } finally {
      setLoadingAnswer(false);

      // IMPORTANT:
      // After the AI responds, focus the input again.
      focusMessageInput();
    }
  };

  // =========================================================
  // COPY ANSWER
  // =========================================================

  const copyAnswer = async (text, index) => {
    try {
      await navigator.clipboard.writeText(text);

      setCopiedIndex(index);

      setTimeout(() => {
        setCopiedIndex(null);
      }, 1500);
    } catch (error) {
      console.error("Copy failed:", error);
    }

    focusMessageInput();
  };

  // =========================================================
  // NEW CHAT
  // =========================================================

  const handleNewChat = () => {
    setMessages([]);
    setMessage("");
    setActiveNav("Chat");

    focusMessageInput();
  };

  // =========================================================
  // UPLOAD BUTTON
  // =========================================================

  const UploadButton = ({ compact = false }) => {
    return (
      <label
        className={compact ? "upload-mini" : "upload-main-button"}
      >
        <input
          type="file"
          accept=".pdf,.docx,.txt,.md"
          onChange={handleFileUpload}
          hidden
        />

        {uploading ? (
          <>
            <Upload size={17} />
            <span>Uploading...</span>
          </>
        ) : (
          <>
            <Upload size={17} />

            <div>
              <strong>Upload Documents</strong>
              <span>PDF, DOCX, TXT, MD</span>
            </div>
          </>
        )}
      </label>
    );
  };

  // =========================================================
  // DOCUMENT CARD
  // =========================================================

  const DocumentCard = ({ document }) => {
    return (
      <div className="document-card">
        <div className="document-icon">
          <FileText size={21} />
        </div>

        <div className="document-info">
          <strong>{document.filename}</strong>

          <span>
            {document.file_type}
            {document.pages ? ` • ${document.pages} pages` : ""}
            {document.characters
              ? ` • ${document.characters.toLocaleString()} chars`
              : ""}
          </span>
        </div>

        <div className="document-status">
          <CheckCircle2 size={17} />
          <span>Processed</span>
        </div>

        <button
          className="document-delete"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => deleteDocument(document.id)}
          title="Delete document"
          type="button"
        >
          <Trash2 size={15} />
        </button>
      </div>
    );
  };

  // =========================================================
  // SIDEBAR
  // =========================================================

  const Sidebar = () => {
    return (
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Sparkles size={19} />
          </div>

          <div>
            <h2>RAG Agent</h2>
            <span>Knowledge Workspace</span>
          </div>
        </div>

        <button
          className="new-chat"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleNewChat}
          type="button"
        >
          <Plus size={17} />
          New Chat
        </button>

        <div className="sidebar-section">
          <p className="sidebar-label">WORKSPACE</p>

          <button
            className={`sidebar-item ${
              activeNav === "Chat" ? "active" : ""
            }`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setActiveNav("Chat");
              focusMessageInput();
            }}
            type="button"
          >
            <MessageSquare size={18} />
            Chat
          </button>

          <button
            className={`sidebar-item ${
              activeNav === "Documents" ? "active" : ""
            }`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setActiveNav("Documents")}
            type="button"
          >
            <Files size={18} />
            Documents
          </button>

          <button
            className={`sidebar-item ${
              activeNav === "Knowledge Base" ? "active" : ""
            }`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setActiveNav("Knowledge Base")}
            type="button"
          >
            <Sparkles size={18} />
            Knowledge Base
          </button>
        </div>

        <div className="sidebar-section system-section">
          <p className="sidebar-label">SYSTEM</p>

          <button
            className={`sidebar-item ${
              activeNav === "Settings" ? "active" : ""
            }`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setActiveNav("Settings")}
            type="button"
          >
            <Settings size={18} />
            Settings
          </button>
        </div>

        <div className="sidebar-documents">
          <div className="sidebar-doc-header">
            <span>KNOWLEDGE BASE</span>
            <span>{documents.length}</span>
          </div>

          <UploadButton compact />

          {documents.length === 0 ? (
            <div className="sidebar-empty">
              No documents uploaded yet.
            </div>
          ) : (
            documents.map((document) => (
              <button
                className={`uploaded-file ${
                  selectedDocument?.id === document.id ? "selected" : ""
                }`}
                key={document.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setSelectedDocument(document);
                  focusMessageInput();
                }}
                type="button"
              >
                <FileText size={16} />

                <div>
                  <strong>{document.filename}</strong>

                  <span>
                    {document.file_type}
                    {document.pages
                      ? ` • ${document.pages} pages`
                      : ""}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="profile">
          <div className="profile-avatar">M</div>

          <div className="profile-info">
            <strong>Malaika Sarfraz</strong>
            <span>AI Developer</span>
          </div>

          <span className="profile-dots">•••</span>
        </div>
      </aside>
    );
  };

  // =========================================================
  // TOP BAR
  // =========================================================

  const Topbar = () => {
    return (
      <header className="topbar">
        <div className="workspace-title">
          <div className="workspace-icon">
            <Sparkles size={17} />
          </div>

          <div>
            <strong>Current Knowledge Base</strong>

            <span>
              {documents.length}{" "}
              {documents.length === 1 ? "document" : "documents"}
            </span>
          </div>
        </div>

        <div className="topbar-right">
          <div className="global-search">
            <Search size={17} />

            <input placeholder="Search in knowledge base" />
          </div>

          <button
            className="icon-button"
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            <Bell size={19} />
            <span className="notification-dot" />
          </button>
        </div>
      </header>
    );
  };

  // =========================================================
  // CHAT INPUT
  // =========================================================

  const ChatComposer = () => {
    return (
      <div className="chat-input-container">
        <div className="chat-input">
          <label
            className="attach-button"
            onMouseDown={(event) => event.preventDefault()}
          >
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={handleFileUpload}
              hidden
            />

            <Plus size={18} />
          </label>

          <input
            ref={messageInputRef}
            id="message-input"
            className="message-input"
            type="text"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask anything about your documents..."
            autoComplete="off"
            autoFocus
          />

          <button
            className="filter-button"
            onMouseDown={(event) => {
              // THIS is the important part.
              // The button will NOT steal focus from the input.
              event.preventDefault();
            }}
            onClick={() => {
              focusMessageInput();
            }}
            type="button"
          >
            <SlidersHorizontal size={16} />
            Filters
          </button>

          <button
            className="send-button"
            onMouseDown={(event) => {
              // Prevent the send button from taking focus.
              event.preventDefault();
            }}
            onClick={() => {
              sendMessage();
              focusMessageInput();
            }}
            type="button"
            disabled={loadingAnswer || !message.trim()}
          >
            {loadingAnswer ? (
              <span className="send-loading">...</span>
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>

        <p className="input-note">
          RAG Agent can make mistakes. Please verify important information.
        </p>
      </div>
    );
  };

  // =========================================================
  // CHAT PAGE
  // =========================================================

  const ChatPage = () => {
    return (
      <div className="chat-layout">
        <section className="chat-area">
          <div className="chat-heading">
            <div>
              <p className="eyebrow">AI ASSISTANT</p>

              <h1>Knowledge Assistant</h1>

              <p>
                Ask questions and get answers grounded in your documents.
              </p>
            </div>
          </div>

          <div className="messages">
            {messages.length === 0 ? (
              <div className="empty-chat">
                <div className="empty-chat-icon">
                  <Sparkles size={22} />
                </div>

                <strong>Start a new conversation</strong>

                <span>
                  Ask a question about your uploaded documents.
                </span>
              </div>
            ) : (
              messages.map((item, index) => (
                <div
                  className={`message-row ${item.type}`}
                  key={index}
                >
                  {item.type === "ai" && (
                    <div className="ai-avatar">
                      <Sparkles size={16} />
                    </div>
                  )}

                  <div className="message-wrapper">
                    <div className="message-bubble">
                      {item.text}
                    </div>

                    {item.type === "ai" && (
                      <div className="ai-actions">
                        <button
                          type="button"
                          onMouseDown={(event) =>
                            event.preventDefault()
                          }
                          onClick={focusMessageInput}
                        >
                          <ThumbsUp size={14} />
                        </button>

                        <button
                          type="button"
                          onMouseDown={(event) =>
                            event.preventDefault()
                          }
                          onClick={focusMessageInput}
                        >
                          <ThumbsDown size={14} />
                        </button>

                        <button
                          type="button"
                          onMouseDown={(event) =>
                            event.preventDefault()
                          }
                          onClick={() =>
                            copyAnswer(item.text, index)
                          }
                        >
                          {copiedIndex === index ? (
                            <Check size={14} />
                          ) : (
                            <Copy size={14} />
                          )}
                        </button>

                        <span>{item.time}</span>
                      </div>
                    )}

                    {item.type === "user" && (
                      <span className="message-time">
                        {item.time}
                      </span>
                    )}

                    {item.type === "ai" &&
                      item.sources &&
                      item.sources.length > 0 && (
                        <div className="message-sources">
                          <p>SOURCES</p>

                          {item.sources.map(
                            (source, sourceIndex) => (
                              <button
                                className="source-chip"
                                key={sourceIndex}
                                onMouseDown={(event) =>
                                  event.preventDefault()
                                }
                                onClick={() => {
                                  const found = documents.find(
                                    (doc) =>
                                      doc.filename ===
                                      source.filename
                                  );

                                  if (found) {
                                    setSelectedDocument(found);
                                  }

                                  focusMessageInput();
                                }}
                                type="button"
                              >
                                <FileText size={15} />

                                <div>
                                  <strong>
                                    {source.filename ||
                                      source.file ||
                                      "Document"}
                                  </strong>

                                  <span>
                                    {source.page
                                      ? `Page ${source.page}`
                                      : `Relevance score: ${
                                          source.score ?? "—"
                                        }`}
                                  </span>
                                </div>
                              </button>
                            )
                          )}
                        </div>
                      )}
                  </div>
                </div>
              ))
            )}

            {loadingAnswer && (
              <div className="message-row ai">
                <div className="ai-avatar">
                  <Sparkles size={16} />
                </div>

                <div className="message-wrapper">
                  <div className="message-bubble typing">
                    Searching your knowledge base...
                  </div>
                </div>
              </div>
            )}
          </div>

          <ChatComposer />
        </section>

        <SourcesPanel />
      </div>
    );
  };

  // =========================================================
  // SOURCES PANEL
  // =========================================================

  const SourcesPanel = () => {
    const visibleDocuments = documents.slice(0, 3);

    return (
      <aside className="sources-panel">
        <div className="sources-header">
          <h2>
            SOURCES <span>{Math.min(documents.length, 3)}</span>
          </h2>

          <div className="sources-actions">
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={focusMessageInput}
            >
              <Filter size={17} />
            </button>

            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setSelectedDocument(null);
                focusMessageInput();
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="source-list">
          {visibleDocuments.length === 0 ? (
            <div className="sources-empty">
              <FileText size={24} />

              <strong>No sources yet</strong>

              <span>
                Upload a document to see its sources here.
              </span>
            </div>
          ) : (
            visibleDocuments.map((document, index) => (
              <button
                className={`right-source ${
                  selectedDocument?.id === document.id
                    ? "active"
                    : ""
                }`}
                key={document.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setSelectedDocument(document);
                  focusMessageInput();
                }}
                type="button"
              >
                <div className="right-file-icon">
                  <FileText size={18} />
                </div>

                <div className="right-source-info">
                  <strong>{document.filename}</strong>

                  <span>
                    {document.pages
                      ? `${document.pages} pages`
                      : document.file_type}
                  </span>
                </div>

                <span className="confidence">
                  {index === 0
                    ? "0.92"
                    : index === 1
                    ? "0.85"
                    : "0.78"}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="source-preview">
          <div className="preview-header">
            <span>SOURCE PREVIEW</span>
            <ExternalLink size={16} />
          </div>

          {selectedDocument ? (
            <>
              <div className="preview-file">
                <FileText size={16} />

                <strong>{selectedDocument.filename}</strong>

                <span>
                  •{" "}
                  {selectedDocument.pages
                    ? `${selectedDocument.pages} pages`
                    : selectedDocument.file_type}
                </span>
              </div>

              <div className="preview-content">
                <p>
                  <strong>File type:</strong>{" "}
                  {selectedDocument.file_type}
                </p>

                <p>
                  <strong>Characters:</strong>{" "}
                  {selectedDocument.characters?.toLocaleString() ||
                    "—"}
                </p>

                {selectedDocument.pages && (
                  <p>
                    <strong>Pages:</strong>{" "}
                    {selectedDocument.pages}
                  </p>
                )}

                <p>
                  This document has been processed and is available
                  to the RAG retrieval pipeline.
                </p>
              </div>

              <button
                className="open-document"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  window.open(
                    `${API_URL}/documents/${selectedDocument.id}`,
                    "_blank"
                  );

                  focusMessageInput();
                }}
                type="button"
              >
                Open Document Data
                <ExternalLink size={16} />
              </button>
            </>
          ) : (
            <div className="preview-empty">
              <FileText size={25} />

              <span>No document selected.</span>
            </div>
          )}
        </div>
      </aside>
    );
  };

  // =========================================================
  // DOCUMENTS PAGE
  // =========================================================

  const DocumentsPage = () => {
    return (
      <section className="page-area">
        <div className="page-heading-row">
          <div>
            <p className="eyebrow">WORKSPACE</p>

            <h1>Documents</h1>

            <p>
              Manage your uploaded documents and files.
            </p>
          </div>

          <UploadButton />
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">
              <Files size={19} />
            </div>

            <span>Documents</span>

            <strong>{documents.length}</strong>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <Database size={19} />
            </div>

            <span>Knowledge Base</span>

            <strong>Active</strong>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <CheckCircle2 size={19} />
            </div>

            <span>Processing</span>

            <strong>Complete</strong>
          </div>
        </div>

        <div className="content-card">
          <div className="content-card-header">
            <div>
              <h2>Uploaded Documents</h2>

              <p>
                Documents currently available in your workspace.
              </p>
            </div>

            <span className="count-badge">
              {documents.length}
            </span>
          </div>

          {documents.length === 0 ? (
            <div className="empty-state">
              <FileUp size={32} />

              <strong>No documents uploaded</strong>

              <span>
                Upload a PDF, DOCX, TXT, or MD file to start
                building your knowledge base.
              </span>

              <UploadButton />
            </div>
          ) : (
            <div className="document-list">
              {documents.map((document) => (
                <DocumentCard
                  key={document.id}
                  document={document}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  };

  // =========================================================
  // KNOWLEDGE BASE PAGE
  // =========================================================

  const KnowledgeBasePage = () => {
    return (
      <section className="page-area">
        <div className="page-heading-row">
          <div>
            <p className="eyebrow">WORKSPACE</p>

            <h1>Knowledge Base</h1>

            <p>
              Browse and manage the information used by your RAG
              Agent.
            </p>
          </div>

          <div className="status-pill">
            <span />
            Knowledge Base Active
          </div>
        </div>

        <div className="knowledge-hero">
          <div className="knowledge-hero-icon">
            <Sparkles size={28} />
          </div>

          <div>
            <h2>Current Knowledge Base</h2>

            <p>
              Your documents are processed and ready for the
              retrieval pipeline.
            </p>
          </div>
        </div>

        <div className="content-card">
          <div className="content-card-header">
            <div>
              <h2>Knowledge Sources</h2>

              <p>
                Documents currently connected to your knowledge
                base.
              </p>
            </div>

            <span className="count-badge">
              {documents.length}
            </span>
          </div>

          {documents.length === 0 ? (
            <div className="empty-state">
              <Database size={32} />

              <strong>Your knowledge base is empty</strong>

              <span>
                Upload documents to start creating your searchable
                knowledge base.
              </span>

              <UploadButton />
            </div>
          ) : (
            <div className="document-list">
              {documents.map((document) => (
                <DocumentCard
                  key={document.id}
                  document={document}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  };

  // =========================================================
  // SETTINGS
  // =========================================================

  const SettingsPage = () => {
    return (
      <section className="page-area">
        <div className="page-heading">
          <p className="eyebrow">SYSTEM</p>

          <h1>Settings</h1>

          <p>
            Configure your RAG Agent workspace.
          </p>
        </div>

        <div className="settings-grid">
          <div className="setting-card">
            <div className="setting-card-icon">
              <Sparkles size={20} />
            </div>

            <div>
              <h3>AI Assistant</h3>

              <p>
                Configure how your assistant interacts with your
                documents.
              </p>
            </div>

            <span className="setting-status">
              Ready
            </span>
          </div>

          <div className="setting-card">
            <div className="setting-card-icon">
              <Database size={20} />
            </div>

            <div>
              <h3>Knowledge Base</h3>

              <p>
                {documents.length}{" "}
                {documents.length === 1
                  ? "document"
                  : "documents"}{" "}
                currently available.
              </p>
            </div>

            <span className="setting-status">
              Active
            </span>
          </div>

          <div className="setting-card">
            <div className="setting-card-icon">
              <Files size={20} />
            </div>

            <div>
              <h3>Supported Files</h3>

              <p>
                PDF, DOCX, TXT and Markdown documents are
                supported.
              </p>
            </div>

            <span className="setting-status">
              Enabled
            </span>
          </div>
        </div>
      </section>
    );
  };

  // =========================================================
  // MAIN
  // =========================================================

  return (
    <div className="app-shell">
      <Sidebar />

      <div className="workspace">
        <Topbar />

        <main className="workspace-content">
          {activeNav === "Chat" && <ChatPage />}

          {activeNav === "Documents" && <DocumentsPage />}

          {activeNav === "Knowledge Base" && (
            <KnowledgeBasePage />
          )}

          {activeNav === "Settings" && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}

export default App;