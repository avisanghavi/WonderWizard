import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage, ContentBlock, ParsedSyllabus, SyllabusUploadResponse, DIYGuide } from '../../shared/types';
import MessageBubble from './components/MessageBubble';
import SuggestionPills from './components/SuggestionPills';
import TypingIndicator from './components/TypingIndicator';
import SyllabusUpload from './components/SyllabusUpload';
import SyllabusBar from './components/SyllabusBar';
import WeeklyMysteryBanner from './components/WeeklyMysteryBanner';

function generateId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const WELCOME_MESSAGES: ChatMessage[] = [
  {
    id: 'welcome-1',
    role: 'assistant',
    content: [
      { type: 'text', text: "Hey there! \uD83D\uDC4B I'm LabBuddy, your AI learning partner!" },
      {
        type: 'text',
        text: "Tell me what you're curious about and I'll design a hands-on activity just for you \u2014 science experiments, math challenges, writing projects, engineering builds, art+science mashups, anything! What sounds fun?",
      },
      {
        type: 'suggestions',
        options: [
          '\uD83C\uDF0B Make a volcano erupt!',
          '\uD83D\uDD22 A math puzzle I can touch',
          '\u270D\uFE0F Creative writing challenge',
          '\uD83C\uDF09 Build a bridge that holds weight',
          '\uD83C\uDFA8 Art meets science',
          '\uD83E\uDDEC How does my body work?',
          '\uD83D\uDCDA Upload my school syllabus',
        ],
      },
    ],
    timestamp: Date.now(),
  },
];

interface ChatViewProps {
  childAge: number;
  initialMessage?: string;
  onSyllabiChange?: (syllabi: ParsedSyllabus[]) => void;
  onOpenCurriculumMap?: () => void;
  onOpenDIYGuide?: (guide: DIYGuide) => void;
  childId?: string;
}

export default function ChatView({ childAge, initialMessage, onSyllabiChange, onOpenCurriculumMap, onOpenDIYGuide, childId }: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(WELCOME_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [syllabi, setSyllabi] = useState<ParsedSyllabus[]>([]);
  const [showSyllabusUpload, setShowSyllabusUpload] = useState(false);
  const sessionIdRef = useRef(generateId());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastInitialMessageRef = useRef<string | undefined>(undefined);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // Load existing syllabi on mount
  useEffect(() => {
    const loadSyllabi = async () => {
      try {
        const res = await fetch(`/api/syllabus/${sessionIdRef.current}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setSyllabi(data);
          }
        }
      } catch {
        // Silently ignore — syllabi are optional
      }
    };
    loadSyllabi();
  }, []);

  // Notify parent when syllabi change
  useEffect(() => {
    onSyllabiChange?.(syllabi);
  }, [syllabi, onSyllabiChange]);

  // Auto-send initialMessage when it changes
  useEffect(() => {
    if (initialMessage && initialMessage !== lastInitialMessageRef.current) {
      lastInitialMessageRef.current = initialMessage;
      // Small delay so component finishes rendering first
      const timer = setTimeout(() => {
        sendMessageImmediate(initialMessage);
      }, 100);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage]);

  const handleSyllabusUploadComplete = useCallback((response: SyllabusUploadResponse) => {
    setSyllabi(prev => [...prev, response.syllabus]);
    setShowSyllabusUpload(false);

    // Inject a system message about the syllabus
    const unitCount = response.syllabus.units.length;
    const syllabusMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: `\uD83D\uDCDA I've read your ${response.syllabus.subject} syllabus! I can see you're covering ${unitCount} unit${unitCount !== 1 ? 's' : ''} this year.`,
        },
        {
          type: 'text',
          text: "Want me to design hands-on activities that match what you're learning in class?",
        },
        ...(response.suggestedActivities.length > 0
          ? [{ type: 'suggestions' as const, options: response.suggestedActivities }]
          : []),
      ],
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, syllabusMessage]);
  }, []);

  const handleSyllabusRemove = useCallback(async (syllabusId: string) => {
    setSyllabi(prev => prev.filter(s => s.id !== syllabusId));
    try {
      await fetch(`/api/syllabus/${sessionIdRef.current}/${syllabusId}`, {
        method: 'DELETE',
      });
    } catch {
      // Silently ignore delete errors
    }
  }, []);

  const handleSyllabusSelect = useCallback((_syllabus: ParsedSyllabus) => {
    // Open the upload modal to view details — could be expanded to a detail view
    setShowSyllabusUpload(true);
  }, []);

  // Imperative send that bypasses stale closure issues — used by initialMessage effect
  const sendMessageImmediate = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: [{ type: 'text', text: text.trim() }],
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user' as const, text: text.trim() }],
          childAge,
          sessionId: sessionIdRef.current,
        }),
      });

      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const data = await res.json();
      sessionIdRef.current = data.sessionId;
      setMessages((prev) => [...prev, data.message]);
    } catch (err) {
      console.error('Chat error:', err);
      const errorMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: [{ type: 'text', text: "Oops! Something went wrong on my end. \uD83D\uDE05 Could you try saying that again?" }],
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      // Intercept syllabus upload request
      if (text.includes('Upload my school syllabus')) {
        setShowSyllabusUpload(true);
        return;
      }

      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: [{ type: 'text', text: text.trim() }],
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInputText('');
      setIsLoading(true);

      try {
        // Build message history for API: role + text only
        const apiMessages = [...messages, userMessage]
          .filter((m) => m.id !== 'welcome-1')
          .map((m) => ({
            role: m.role,
            text: m.content
              .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
              .map((b) => b.text)
              .join('\n'),
          }))
          .filter((m) => m.text.length > 0);

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiMessages,
            childAge,
            sessionId: sessionIdRef.current,
          }),
        });

        if (!res.ok) {
          throw new Error(`Server responded with ${res.status}`);
        }

        const data = await res.json();
        sessionIdRef.current = data.sessionId;

        setMessages((prev) => [...prev, data.message]);
      } catch (err) {
        console.error('Chat error:', err);
        const errorMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: "Oops! Something went wrong on my end. \uD83D\uDE05 Could you try saying that again?",
            },
          ],
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
        inputRef.current?.focus();
      }
    },
    [isLoading, messages, childAge],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputText);
  };

  const handleSuggestionClick = (text: string) => {
    sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
    }
  };

  return (
    <div className="chat-container">
      <SyllabusBar
        syllabi={syllabi}
        onRemove={handleSyllabusRemove}
        onAdd={() => setShowSyllabusUpload(true)}
        onSelect={handleSyllabusSelect}
        onOpenCurriculumMap={onOpenCurriculumMap}
      />

      <div className="chat-messages">
        {messages.filter((m) => m.role === 'user').length === 0 && (
          <WeeklyMysteryBanner onSendMessage={sendMessage} />
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onSuggestionClick={handleSuggestionClick}
            onSendMessage={sendMessage}
            onOpenDIYGuide={onOpenDIYGuide}
            sessionId={sessionIdRef.current}
            childId={childId}
          />
        ))}
        {isLoading && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-area" onSubmit={handleSubmit}>
        <div className="chat-input-wrapper">
          <button
            type="button"
            className="syllabus-upload-btn"
            onClick={() => setShowSyllabusUpload(true)}
            aria-label="Upload syllabus"
            title="Upload My Syllabus"
          >
            &#128218;
          </button>
          <input
            ref={inputRef}
            className="chat-input"
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What do you want to explore?"
            disabled={isLoading}
            autoFocus
          />
          <button
            type="submit"
            className="chat-send-btn"
            disabled={isLoading || !inputText.trim()}
            aria-label="Send message"
          >
            &#9654;
          </button>
        </div>
        {syllabi.length > 0 && (
          <div className="chat-input-syllabus-indicator">
            {syllabi.length} syllab{syllabi.length === 1 ? 'us' : 'i'} loaded
          </div>
        )}
      </form>

      {showSyllabusUpload && (
        <SyllabusUpload
          sessionId={sessionIdRef.current}
          onUploadComplete={handleSyllabusUploadComplete}
          onClose={() => setShowSyllabusUpload(false)}
          syllabi={syllabi}
        />
      )}
    </div>
  );
}
