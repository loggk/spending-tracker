import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import type { AssistantChatMessage, AssistantCitedTransaction } from '@spending-tracker/shared';
import { BotIcon, RotateCcwIcon, SendIcon, SparklesIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { askAssistant } from '@/lib/api';
import { formatAmount, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

interface DisplayMessage extends AssistantChatMessage {
  id: string;
  citedTransactions?: AssistantCitedTransaction[];
}

interface AssistantDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STORAGE_KEY = 'spending-tracker-assistant-messages';

const SUGGESTED_QUESTIONS = [
  'How much did I spend this month?',
  'What was my highest grocery bill?',
  'Compare dining spend this month vs last month',
  'How much did I spend this weekend?',
  'What were my top 3 largest purchases?',
];

function loadSavedMessages(): DisplayMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DisplayMessage[];
  } catch {
    return [];
  }
}

export function AssistantDrawer({ open, onOpenChange }: AssistantDrawerProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>(loadSavedMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // Ignore storage errors
    }
  }, [messages]);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, messages, isLoading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // 5 lines max height: ~120px (~20px per line + padding)
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift + Enter creates a new line
        return;
      }
      // Enter without Shift submits
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      void handleSend();
    }
  }

  async function handleSend(textToSend?: string) {
    const text = (textToSend ?? input).trim();
    if (!text || isLoading) return;

    const userMsg: DisplayMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: text,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setIsLoading(true);

    try {
      // Send chat history without local UI IDs
      const payload: AssistantChatMessage[] = nextMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await askAssistant(payload);

      const assistantMsg: DisplayMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: response.reply,
        citedTransactions: response.citedTransactions,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      toast.error('Assistant error', {
        description: err instanceof Error ? err.message : 'Unable to query assistant at this time',
      });
    } finally {
      setIsLoading(false);
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    void handleSend();
  }

  function handleClear() {
    setMessages([]);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex h-full flex-col p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md border bg-muted">
                <SparklesIcon className="h-4 w-4 text-foreground" />
              </div>
              <SheetTitle className="text-sm font-semibold">Financial Assistant</SheetTitle>
            </div>

            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                  title="Clear conversation"
                >
                  <RotateCcwIcon className="h-3 w-3" />
                  <span>Clear</span>
                </Button>
              )}
              <SheetClose
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  />
                }
              >
                <XIcon className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </SheetClose>
            </div>
          </div>
          <SheetDescription className="sr-only">
            Conversational assistant for querying your spending with zero model training
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable Conversation Area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border bg-muted/40">
                <BotIcon className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-medium">Ask anything about your spending</h3>

              <div className="mt-6 flex w-full flex-col gap-2">
                {SUGGESTED_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => void handleSend(question)}
                    className="flex w-full items-center justify-between rounded-lg border bg-card p-2.5 text-left text-xs transition-colors hover:bg-muted/50"
                  >
                    <span>{question}</span>
                    <span className="text-muted-foreground">→</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn('flex flex-col', m.role === 'user' ? 'items-end' : 'items-start')}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm',
                      m.role === 'user'
                        ? 'rounded-br-xs bg-primary text-primary-foreground'
                        : 'rounded-bl-xs border bg-muted/40 text-foreground',
                    )}
                  >
                    <FormattedMessage content={m.content} />

                    {m.citedTransactions && m.citedTransactions.length > 0 && (
                      <div className="mt-3 space-y-1.5 border-t pt-2">
                        <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                          Referenced transactions ({m.citedTransactions.length})
                        </span>
                        <div className="space-y-1">
                          {m.citedTransactions.map((tx) => (
                            <div
                              key={tx.id}
                              className="flex items-center justify-between rounded border bg-background/80 px-2 py-1 text-[11px]"
                            >
                              <div className="min-w-0 pr-2">
                                <div className="truncate font-medium">{tx.description}</div>
                                <div className="text-[10px] text-muted-foreground">
                                  {formatDate(tx.date)}
                                  {tx.categoryName ? ` · ${tx.categoryName}` : ''}
                                </div>
                              </div>
                              <span className="shrink-0 font-medium text-foreground">
                                {formatAmount(tx.amountCents)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex items-start">
                  <div className="rounded-2xl rounded-bl-xs border bg-muted/40 px-3.5 py-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/60" />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/60 delay-150" />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/60 delay-300" />
                      <span className="ml-1 text-[11px]">Calculating with Bedrock...</span>
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="border-t bg-background p-3 sm:p-4">
          <form onSubmit={handleFormSubmit} className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your spending..."
              disabled={isLoading}
              className="min-h-[38px] max-h-[120px] w-full min-w-0 resize-none overflow-y-auto rounded-lg border border-input bg-transparent px-2.5 py-2 text-xs leading-5 transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 sm:text-sm dark:bg-input/30"
              autoFocus
            />
            <Button
              type="submit"
              size="icon-sm"
              disabled={!input.trim() || isLoading}
              className="h-[38px] w-[38px] shrink-0"
              title="Send question (Enter, or Shift+Enter for new line)"
            >
              <SendIcon className="h-4 w-4" />
              <span className="sr-only">Send</span>
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Formats simple markdown bold, list items, and line breaks without an external heavy parser */
function FormattedMessage({ content }: { content: string }) {
  const paragraphs = content.split('\n\n');

  return (
    <div className="space-y-2">
      {paragraphs.map((para, pIdx) => {
        const lines = para.split('\n');

        return (
          <div key={pIdx} className="space-y-1">
            {lines.map((line, lIdx) => {
              const trimmed = line.trim();

              // Bullet line
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={lIdx} className="flex items-start gap-1.5 pl-1">
                    <span className="text-muted-foreground">•</span>
                    <span>{renderInlineFormatting(trimmed.slice(2))}</span>
                  </div>
                );
              }

              // Standard text line
              return <p key={lIdx}>{renderInlineFormatting(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

function renderInlineFormatting(text: string) {
  // Matches **bold text**
  const parts = text.split(/(\*\*.*?\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}
