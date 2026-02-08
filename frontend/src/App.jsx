import React, { useMemo, useState } from "react";

const DEFAULT_PROMPT = "Draft a friendly welcome message for a new user.";

const initialStatus = {
  state: "idle",
  label: "Idle",
};

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
    second: "2-digit",
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

export default function App() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [sessionId, setSessionId] = useState("");
  const [responseText, setResponseText] = useState("");
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState(initialStatus);

  const apiBaseUrl = useMemo(() => {
    if (import.meta.env.VITE_API_BASE_URL) {
      return import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "");
    }
    return "";
  }, []);

  const statusDotClass = useMemo(() => {
    if (status.state === "streaming") {
      return "status-dot pending";
    }
    if (status.state === "error") {
      return "status-dot error";
    }
    return "status-dot";
  }, [status.state]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus({ state: "streaming", label: statusMap.streaming.label });
    setResponseText("");
    setEvents([]);
    setSessionId("");

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
          const timestamp = formatTimestamp(new Date());
          setEvents((prev) => [
            ...prev,
            {
              id: `${eventItem.event}-${timestamp}-${prev.length}`,
              event: eventItem.event,
              timestamp,
            },
          ]);

          if (eventItem.data?.session_id) {
            setSessionId(eventItem.data.session_id);
          }
          if (eventItem.event === "delta") {
            setResponseText((prev) => `${prev}${eventItem.data.text ?? ""}`);
          }
          if (eventItem.event === "done") {
            setResponseText(eventItem.data.text ?? "");
            setStatus({ state: "complete", label: statusMap.complete.label });
          }
        });
      }

      if (status.state === "streaming") {
        setStatus({ state: "complete", label: statusMap.complete.label });
      }
    } catch (error) {
      setStatus({ state: "error", label: statusMap.error.label });
      setEvents((prev) => [
        ...prev,
        {
          id: `error-${prev.length}`,
          event: "error",
          timestamp: formatTimestamp(new Date()),
        },
      ]);
      setResponseText(
        `Something went wrong while streaming the response. ${error.message}`,
      );
    }
  };

  return (
    <div className="app">
      <header>
        <h1>Slibed LLM Messaging</h1>
        <p>Start a session and stream tokens from the create session endpoint.</p>
      </header>
      <main>
        <div className="layout">
          <section className="card">
            <form onSubmit={handleSubmit}>
              <label htmlFor="prompt">Message to send</label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Type your message here..."
              />
              <div className="controls">
                <button type="submit" disabled={!prompt || status.state === "streaming"}>
                  {status.state === "streaming" ? "Streaming..." : "Create session"}
                </button>
                <div className="badge">
                  <span className={statusDotClass} />
                  {status.label}
                </div>
              </div>
              <p className="helper">
                This sends a POST to <code>/api/v1/chat/</code> with a
                <code>parts</code> array containing your text prompt.
              </p>
              <p className="footer-note">
                Tip: set <code>VITE_API_BASE_URL</code> to point at your backend if
                it runs on another host.
              </p>
            </form>
          </section>

          <section className="card">
            <h3>Streaming response</h3>
            <p className="helper">
              Session ID: <strong>{sessionId || "Pending"}</strong>
            </p>
            <div className="response">
              {responseText || "Response will appear here once streaming starts."}
            </div>
            <h4>Event timeline</h4>
            <ul className="event-log">
              {events.length === 0 && <li>No events yet.</li>}
              {events.map((eventItem) => (
                <li key={eventItem.id}>
                  <strong>{eventItem.event}</strong> · {eventItem.timestamp}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
