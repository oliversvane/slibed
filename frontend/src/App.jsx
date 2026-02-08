import React, { useMemo, useState } from "react";

import { Button } from "./components/ui/button.jsx";
import { Input } from "./components/ui/input.jsx";
import { Separator } from "./components/ui/separator.jsx";
import { Textarea } from "./components/ui/textarea.jsx";
import { cn } from "./lib/utils.js";

const DEFAULT_PROMPT = "Draft a friendly welcome message for a new user.";

const statusMap = {
  idle: { label: "Idle" },
  streaming: { label: "Streaming" },
  complete: { label: "Complete" },
  error: { label: "Error" },
};

const formatTimestamp = (value) =>
  new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);

const buildPayload = (text) => ({
  parts: [
    {
      type: "text",
      text,
    },
  ],
});

const parseSseChunk = (buffer) => {
  const events = [];
  let nextBuffer = buffer;

  while (nextBuffer.includes("\n\n")) {
    const boundaryIndex = nextBuffer.indexOf("\n\n");
    const rawEvent = nextBuffer.slice(0, boundaryIndex).replace(/\r/g, "");
    nextBuffer = nextBuffer.slice(boundaryIndex + 2);

    if (!rawEvent.trim()) {
      continue;
    }

    const lines = rawEvent.split("\n");
    let event = "message";
    let data = "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.replace("event:", "").trim();
      }
      if (line.startsWith("data:")) {
        data += line.replace("data:", "").trim();
      }
    }

    if (data) {
      try {
        const json = JSON.parse(data);
        events.push({ event, data: json });
      } catch (error) {
        events.push({ event, data: { text: data, error: true } });
      }
    }
  }

  return { events, buffer: nextBuffer };
};

const initialSessions = [
  {
    id: "session-1",
    title: "Welcome sequence copy",
    updatedAt: new Date(Date.now() - 1000 * 60 * 15),
    messages: [
      {
        id: "m1",
        role: "assistant",
        content:
          "Welcome! I'm here to help you craft the perfect onboarding journey.",
      },
    ],
  },
  {
    id: "session-2",
    title: "Product launch outline",
    updatedAt: new Date(Date.now() - 1000 * 60 * 90),
    messages: [
      {
        id: "m2",
        role: "assistant",
        content:
          "Let's map out the product launch beats, from teaser to post-launch nurture.",
      },
    ],
  },
];

export default function App() {
  const [sessions, setSessions] = useState(initialSessions);
  const [selectedSessionId, setSelectedSessionId] = useState(
    initialSessions[0]?.id ?? null,
  );
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [status, setStatus] = useState({ state: "idle", label: "Idle" });
  const [sessionFilter, setSessionFilter] = useState("");

  const apiBaseUrl = useMemo(() => {
    if (import.meta.env.VITE_API_BASE_URL) {
      return import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "");
    }
    return "";
  }, []);

  const filteredSessions = useMemo(() => {
    if (!sessionFilter.trim()) {
      return sessions;
    }
    return sessions.filter((session) =>
      session.title.toLowerCase().includes(sessionFilter.toLowerCase()),
    );
  }, [sessionFilter, sessions]);

  const selectedSession = sessions.find(
    (session) => session.id === selectedSessionId,
  );

  const createLocalSession = (title) => {
    const newSession = {
      id: `local-${crypto.randomUUID()}`,
      title,
      updatedAt: new Date(),
      messages: [],
      isLocal: true,
    };
    setSessions((prev) => [newSession, ...prev]);
    setSelectedSessionId(newSession.id);
    return newSession;
  };

  const updateSession = (sessionId, updater) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId ? updater(session) : session,
      ),
    );
  };

  const handleNewChat = () => {
    createLocalSession("New conversation");
    setPrompt("");
    setStatus({ state: "idle", label: statusMap.idle.label });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!prompt.trim()) {
      return;
    }

    const activeSession = selectedSession ?? createLocalSession("New chat");

    updateSession(activeSession.id, (session) => ({
      ...session,
      updatedAt: new Date(),
      title:
        session.messages.length === 0
          ? prompt.slice(0, 32)
          : session.title,
      messages: [
        ...session.messages,
        {
          id: `user-${crypto.randomUUID()}`,
          role: "user",
          content: prompt,
        },
        {
          id: `assistant-${crypto.randomUUID()}`,
          role: "assistant",
          content: "",
          streaming: true,
        },
      ],
    }));

    setPrompt("");
    setStatus({ state: "streaming", label: statusMap.streaming.label });

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/chat/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(buildPayload(prompt)),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (!done) {
        const result = await reader.read();
        done = result.done;
        buffer += decoder.decode(result.value || new Uint8Array(), {
          stream: !done,
        });

        const parsed = parseSseChunk(buffer);
        buffer = parsed.buffer;

        parsed.events.forEach((eventItem) => {
          if (eventItem.event === "init") {
            updateSession(activeSession.id, (session) => ({
              ...session,
              apiId: eventItem.data.session_id ?? session.apiId,
            }));
          }
          if (eventItem.event === "delta") {
            updateSession(activeSession.id, (session) => ({
              ...session,
              messages: session.messages.map((message) =>
                message.streaming
                  ? {
                      ...message,
                      content: `${message.content}${eventItem.data.text ?? ""}`,
                    }
                  : message,
              ),
            }));
          }

          if (eventItem.event === "done") {
            updateSession(activeSession.id, (session) => ({
              ...session,
              messages: session.messages.map((message) =>
                message.streaming
                  ? {
                      ...message,
                      content: eventItem.data.text ?? message.content,
                      streaming: false,
                    }
                  : message,
              ),
            }));
            setStatus({ state: "complete", label: statusMap.complete.label });
          }
        });
      }

      if (status.state === "streaming") {
        setStatus({ state: "complete", label: statusMap.complete.label });
      }
    } catch (error) {
      setStatus({ state: "error", label: statusMap.error.label });
      updateSession(activeSession.id, (session) => ({
        ...session,
        messages: session.messages.map((message) =>
          message.streaming
            ? {
                ...message,
                content: `Something went wrong while streaming. ${error.message}`,
                streaming: false,
              }
            : message,
        ),
      }));
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto grid min-h-screen w-full max-w-[1400px] grid-cols-[280px_1fr]">
        <aside className="flex flex-col border-r border-slate-800 bg-slate-900/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Sessions
              </p>
              <h1 className="text-lg font-semibold">Slibed</h1>
            </div>
            <Button variant="outline" className="px-3" onClick={handleNewChat}>
              New
            </Button>
          </div>
          <div className="mt-4">
            <Input
              value={sessionFilter}
              onChange={(event) => setSessionFilter(event.target.value)}
              placeholder="Search sessions"
            />
          </div>
          <Separator className="my-4" />
          <div className="chat-scrollbar flex-1 space-y-2 overflow-y-auto pr-1">
            {filteredSessions.length === 0 && (
              <p className="text-sm text-slate-500">No sessions found.</p>
            )}
            {filteredSessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setSelectedSessionId(session.id)}
                className={cn(
                  "w-full rounded-2xl border border-transparent px-3 py-3 text-left transition",
                  session.id === selectedSessionId
                    ? "border-slate-700 bg-slate-900"
                    : "hover:bg-slate-900/60",
                )}
              >
                <p className="truncate text-sm font-medium text-slate-100">
                  {session.title}
                </p>
                <p className="text-xs text-slate-500">
                  {formatTimestamp(session.updatedAt)}
                </p>
              </button>
            ))}
          </div>
          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400">
            <p className="font-semibold text-slate-200">Create session API</p>
            <p className="mt-1">POST /api/v1/chat/ (SSE stream)</p>
          </div>
        </aside>

        <main className="flex flex-col">
          <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Chat
              </p>
              <h2 className="text-lg font-semibold">
                {selectedSession?.title ?? "Start a new conversation"}
              </h2>
              {selectedSession?.apiId && (
                <p className="text-xs text-slate-500">
                  Session ID: {selectedSession.apiId}
                </p>
              )}
            </div>
            <div
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                status.state === "error"
                  ? "border-red-500/40 text-red-300"
                  : status.state === "streaming"
                    ? "border-amber-400/40 text-amber-200"
                    : "border-emerald-400/40 text-emerald-200",
              )}
            >
              {status.label}
            </div>
          </header>

          <div className="chat-scrollbar flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
              {(selectedSession?.messages ?? []).map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex w-full",
                    message.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-card",
                      message.role === "user"
                        ? "bg-slate-100 text-slate-900"
                        : "bg-slate-900 text-slate-100",
                    )}
                  >
                    {message.content ||
                      (message.streaming && (
                        <span className="text-slate-500">Thinking...</span>
                      ))}
                  </div>
                </div>
              ))}
              {!selectedSession && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-6 py-8 text-center text-slate-300">
                  <p className="text-sm">
                    Select a session on the left or start a new chat to begin.
                  </p>
                </div>
              )}
            </div>
          </div>

          <footer className="border-t border-slate-800 px-6 py-6">
            <form
              onSubmit={handleSubmit}
              className="mx-auto flex w-full max-w-3xl flex-col gap-3"
            >
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Send a message"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Tip: set VITE_API_BASE_URL to point at the backend host.
                </p>
                <Button type="submit" disabled={status.state === "streaming"}>
                  Send
                </Button>
              </div>
            </form>
          </footer>
        </main>
      </div>
    </div>
  );
}
