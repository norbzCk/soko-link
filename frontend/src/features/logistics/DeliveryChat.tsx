import { useEffect, useRef, useState } from "react";
import { ChatMessage } from "./useDeliverySocket";

interface DeliveryChatProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onTyping?: (isTyping: boolean) => void;
  currentUserId: number | undefined;
  otherPartyName: string;
  isConnected?: boolean;
  isOtherPartyTyping?: boolean;
}

function messageStateLabel(status?: ChatMessage["status"]) {
  if (status === "read") return "Read";
  if (status === "delivered") return "Delivered";
  if (status === "sent") return "Sent";
  if (status === "sending") return "Sending";
  return "Sent";
}

export function DeliveryChat({
  messages,
  onSend,
  onTyping,
  currentUserId,
  otherPartyName,
  isConnected = false,
  isOtherPartyTyping = false,
}: DeliveryChatProps) {
  const [inputText, setInputText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOtherPartyTyping]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    onSend(inputText.trim());
    onTyping?.(false);
    setInputText("");
  };

  return (
    <div className="glass-card flex h-[420px] flex-col overflow-hidden md:h-[500px]">
      <div className="shrink-0 border-b border-white/60 bg-[linear-gradient(135deg,var(--color-brand-strong),var(--color-brand),var(--color-accent-strong))] p-4 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/16 text-xs font-bold uppercase">
              {otherPartyName[0] || "D"}
            </div>
            <div>
              <h3 className="font-display text-sm font-bold leading-none">{otherPartyName}</h3>
              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/65">Live conversation</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${isConnected ? "bg-emerald-300 animate-pulse" : "bg-white/40"}`} />
            <span className="text-[10px] font-black uppercase tracking-[0.24em] text-white/80">
              {isConnected ? "Connected" : "Reconnecting"}
            </span>
          </div>
        </div>
        {isOtherPartyTyping ? <p className="mt-3 text-xs font-semibold text-white/75">{otherPartyName} is typing...</p> : null}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-slate-50/65 p-4 dark:bg-slate-900/30">
        {!messages.length ? (
          <div className="flex h-full flex-col items-center justify-center space-y-3 p-8 text-center">
            <div className="rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-800">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.003 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Start the conversation</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.sender_id === currentUserId || msg.sender_role === "self";
            return (
              <div key={msg.id || idx} className={`animate-in fade-in slide-in-from-bottom-2 flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[85%] rounded-[1.4rem] p-3 text-sm font-medium shadow-sm ${
                    isMe
                      ? "rounded-tr-md bg-slate-950 text-white dark:bg-brand"
                      : "rounded-tl-md border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  }`}
                >
                  {msg.text}
                </div>
                <div className="mt-1 flex items-center gap-2 px-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  {isMe ? <span>{messageStateLabel(msg.status)}</span> : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={handleSend} className="flex shrink-0 gap-2 border-t border-slate-200 bg-white/90 p-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <input
          value={inputText}
          onChange={(e) => {
            const nextValue = e.target.value;
            setInputText(nextValue);
            onTyping?.(nextValue.trim().length > 0);
          }}
          className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition-all focus:border-brand/30 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          placeholder="Type your message..."
        />
        <button type="submit" className="rounded-2xl bg-brand p-3 text-white shadow-md transition-all hover:bg-brand-strong hover:shadow-lg active:scale-90">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
