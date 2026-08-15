"use client";

import { useChat } from '@ai-sdk/react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Send, Bot, User, Loader2, X, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

const SUGGESTIONS = [
  'How much did I spend this month?',
  'What is my current net worth?',
  'Which account has the most balance?',
  'What were my top expenses this month?',
];

export function CompanionDrawer() {
  const [open, setOpen] = useState(false);
  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages } = useChat() as any;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSuggestion = (text: string) => {
    // Directly submit the suggestion without needing to press send
    const fakeEvent = { preventDefault: () => {} } as any;
    handleInputChange({ target: { value: text } } as any);
    // Use a short timeout to let state update, then submit
    setTimeout(() => {
      const form = document.getElementById('nisflow-ai-form') as HTMLFormElement | null;
      if (form) form.requestSubmit();
    }, 50);
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  return (
    <>
      {/* Floating trigger button — clears bottom nav on mobile */}
      <Button
        size="icon"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 md:bottom-6 md:right-6 h-13 w-13 rounded-full shadow-xl z-50 bg-primary hover:bg-primary/90"
        aria-label="Open AI Finance Assistant"
      >
        <Sparkles className="h-5 w-5 text-primary-foreground" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md flex flex-col p-0 border-l h-full"
        >
          <SheetHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              NisFlow Finance AI
            </SheetTitle>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={handleClearChat}
                  title="Clear conversation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-5">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-sm">Finance Assistant</p>
                  <p className="text-xs text-muted-foreground max-w-[220px]">
                    Ask about your accounts, transactions, spending, or net worth.
                  </p>
                </div>
                <div className="w-full space-y-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSuggestion(s)}
                      className="w-full text-left text-xs px-3 py-2.5 rounded-lg border bg-muted/50 hover:bg-muted transition-colors text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m: any) => (
                <div
                  key={m.id}
                  className={cn(
                    'flex flex-col gap-1 max-w-[88%]',
                    m.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
                  )}
                >
                  <div
                    className={cn(
                      'flex items-center gap-1.5 text-[10px] text-muted-foreground',
                      m.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                    )}
                  >
                    {m.role === 'user'
                      ? <User className="h-3 w-3" />
                      : <Bot className="h-3 w-3" />
                    }
                    {m.role === 'user' ? 'You' : 'NisFlow AI'}
                  </div>
                  <div
                    className={cn(
                      'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed',
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm'
                    )}
                  >
                    {m.content && (
                      <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-0 prose-p:leading-relaxed">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    )}
                    {m.toolInvocations?.map((inv: any) => {
                      if ('result' in inv) {
                        return (
                          <p key={inv.toolCallId} className="mt-1.5 text-[10px] opacity-60 flex items-center gap-1">
                            ✓ Checked your {
                              inv.toolName === 'getTransactions' ? 'transactions'
                              : inv.toolName === 'getNetWorth' ? 'net worth'
                              : inv.toolName === 'getAccounts' ? 'accounts'
                              : inv.toolName === 'getSpendingSummary' ? 'spending summary'
                              : inv.toolName
                            }
                          </p>
                        );
                      }
                      return (
                        <p key={inv.toolCallId} className="mt-1.5 text-[10px] opacity-60 flex items-center gap-1">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" /> Fetching data…
                        </p>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex items-center gap-2 text-muted-foreground text-xs mr-auto">
                <Loader2 className="h-3 w-3 animate-spin" />
                Thinking…
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="p-3 border-t bg-background">
            <form
              id="nisflow-ai-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (input?.trim()) handleSubmit(e);
              }}
              className="flex items-center gap-2"
            >
              <Input
                value={input || ''}
                onChange={handleInputChange}
                placeholder="Ask about your finances…"
                className="flex-1 h-9 text-sm"
                disabled={isLoading}
                autoComplete="off"
              />
              <Button
                type="submit"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={isLoading || !input?.trim()}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </form>
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              Finance data only · Powered by Gemini
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
