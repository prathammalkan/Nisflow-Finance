"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  Send,
  Bot,
  User,
  Loader2,
  X,
  Trash2,
  Mic,
  MicOff,
  CheckCircle2,
  ArrowDownRight,
  ArrowUpRight,
  ArrowRightLeft,
  Users,
  Wallet,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAccounts } from '@/lib/hooks/use-accounts';
import { usePeople } from '@/lib/hooks/use-people';
import { formatINR } from '@/lib/finance/money';
import { toast } from 'sonner';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ParsedAction {
  actionType: 'transaction' | 'payable' | 'receivable';
  amount: number;
  description?: string;
  type?: 'expense' | 'income' | 'transfer';
  direction?: 'in' | 'out';
  accountName?: string;
  accountId?: string;
  personName?: string;
  personId?: string;
  date?: string;
  notes?: string;
}

const SUGGESTIONS = [
  'Paid ₹350 for lunch from Kotak',
  'I borrowed ₹5,000 from Rahul',
  'Lent ₹2,000 to Amit',
  'How much did I spend this month?',
];

function extractActionAndText(content: string): { cleanText: string; action: ParsedAction | null } {
  const match = content.match(/\[ACTION\]([\s\S]*?)\[\/ACTION\]/);
  if (!match) {
    return { cleanText: content, action: null };
  }

  const rawJson = match[1].trim();
  const cleanText = content.replace(/\[ACTION\][\s\S]*?\[\/ACTION\]/, '').trim();

  try {
    const action = JSON.parse(rawJson) as ParsedAction;
    return { cleanText, action };
  } catch (e) {
    return { cleanText, action: null };
  }
}

export function CompanionDrawer() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [actionStatuses, setActionStatuses] = useState<Record<string, 'pending' | 'success' | 'dismissed'>>({});
  const [isExecutingAction, setIsExecutingAction] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const queryClient = useQueryClient();
  const { data: accounts } = useAccounts();
  const { data: people } = usePeople();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
    };
  }, []);

  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error('Voice input is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-IN';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setInput(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          toast.error('Microphone permission was denied. Please allow microphone access.');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('Failed to initialize speech recognition', err);
      setIsListening(false);
      toast.error('Could not start microphone.');
    }
  };

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isLoading) return;

    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
      setIsListening(false);
    }

    setError(null);
    setInput('');

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    const assistantMessageId = `assistant-${Date.now()}`;
    const newMessages = [...messages, userMessage];

    // Optimistically show user message and empty assistant message
    setMessages([
      ...newMessages,
      { id: assistantMessageId, role: 'assistant', content: '' },
    ]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body received from server.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulatedContent += chunk;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: accumulatedContent }
              : msg
          )
        );
      }
    } catch (err: any) {
      console.error('Chat error:', err);
      setError(err?.message || 'Failed to get a response. Please try again.');
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessageId));
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteAction = async (msgId: string, action: ParsedAction) => {
    setIsExecutingAction((prev) => ({ ...prev, [msgId]: true }));
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User is not authenticated');

      if (action.actionType === 'payable' || action.actionType === 'receivable') {
        let counterpartyId = action.personId;

        // If personId is not resolved, find or create person
        if (!counterpartyId && action.personName) {
          const matched = people?.find(
            (p) => p.name.toLowerCase() === action.personName?.toLowerCase()
          );

          if (matched) {
            counterpartyId = matched.id;
          } else {
            // Create new counterparty
            const { data: newPerson, error: pError } = await (supabase.from('counterparties') as any)
              .insert({
                user_id: user.id,
                name: action.personName,
                type: 'Other',
              })
              .select()
              .single();

            if (pError) throw pError;
            counterpartyId = newPerson.id;
            queryClient.invalidateQueries({ queryKey: ['people'] });
          }
        }

        if (!counterpartyId) {
          throw new Error('Counterparty / Person is required for this action.');
        }

        const table = action.actionType === 'payable' ? 'payables' : 'receivables';
        const { error: insError } = await (supabase.from(table) as any).insert({
          user_id: user.id,
          counterparty_id: counterpartyId,
          amount: Number(action.amount),
          notes: action.description || action.notes || null,
          due_date: action.date || null,
          status: 'PENDING',
        });

        if (insError) throw insError;

        queryClient.invalidateQueries({ queryKey: ['payables'] });
        queryClient.invalidateQueries({ queryKey: ['receivables'] });
        queryClient.invalidateQueries({ queryKey: ['people'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });

        toast.success(
          action.actionType === 'payable'
            ? `Recorded borrowing of ${formatINR(action.amount)} from ${action.personName || 'person'}`
            : `Recorded receivable of ${formatINR(action.amount)} from ${action.personName || 'person'}`
        );
      } else {
        // Transaction action
        let targetAccountId = action.accountId;
        if (!targetAccountId && action.accountName) {
          const matched = accounts?.find(
            (a) => a.name.toLowerCase().includes(action.accountName?.toLowerCase() || '')
          );
          if (matched) targetAccountId = matched.id;
        }

        // Fallback to first active account
        if (!targetAccountId && accounts && accounts.length > 0) {
          targetAccountId = accounts[0].id;
        }

        if (!targetAccountId) {
          throw new Error('No account found. Please create an account first.');
        }

        const dir = action.direction || (action.type === 'income' ? 'in' : 'out');
        const txType = action.type || (dir === 'in' ? 'income' : 'expense');

        const { error: txError } = await (supabase.from('transactions') as any).insert({
          user_id: user.id,
          account_id: targetAccountId,
          amount: Number(action.amount),
          type: txType,
          direction: dir,
          description: action.description || 'Transaction via AI Assistant',
          notes: action.notes || null,
          date: action.date ? new Date(action.date).toISOString() : new Date().toISOString(),
          status: 'confirmed',
        });

        if (txError) throw txError;

        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });

        toast.success(`Recorded ${txType} of ${formatINR(action.amount)}!`);
      }

      setActionStatuses((prev) => ({ ...prev, [msgId]: 'success' }));
    } catch (err: any) {
      console.error('Failed to execute action:', err);
      toast.error(err.message || 'Failed to record entry');
    } finally {
      setIsExecutingAction((prev) => ({ ...prev, [msgId]: false }));
    }
  };

  const handleDismissAction = (msgId: string) => {
    setActionStatuses((prev) => ({ ...prev, [msgId]: 'dismissed' }));
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleSuggestion = (suggestionText: string) => {
    sendMessage(suggestionText);
  };

  const handleClearChat = () => {
    setMessages([]);
    setError(null);
    setActionStatuses({});
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
                  <p className="font-semibold text-sm">Finance Assistant & Voice Logger</p>
                  <p className="text-xs text-muted-foreground max-w-[240px]">
                    Ask about your finances, or use voice/text to log expenses, income, borrowings & lent money.
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
              messages.map((m) => {
                const { cleanText, action } = extractActionAndText(m.content);
                const actionStatus = actionStatuses[m.id] || 'pending';
                const isExecuting = isExecutingAction[m.id] || false;

                return (
                  <div
                    key={m.id}
                    className={cn(
                      'flex flex-col gap-1.5 max-w-[92%]',
                      m.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
                    )}
                  >
                    <div
                      className={cn(
                        'flex items-center gap-1.5 text-[10px] text-muted-foreground',
                        m.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                      )}
                    >
                      {m.role === 'user' ? (
                        <User className="h-3 w-3" />
                      ) : (
                        <Bot className="h-3 w-3" />
                      )}
                      {m.role === 'user' ? 'You' : 'NisFlow AI'}
                    </div>

                    {/* Text Bubble */}
                    <div
                      className={cn(
                        'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed',
                        m.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-sm'
                          : 'bg-muted text-foreground rounded-bl-sm'
                      )}
                    >
                      {cleanText ? (
                        <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-0 prose-p:leading-relaxed">
                          <ReactMarkdown>{cleanText}</ReactMarkdown>
                        </div>
                      ) : m.role === 'assistant' && !action ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Thinking…
                        </div>
                      ) : null}
                    </div>

                    {/* Proposed Action Card (if action detected) */}
                    {action && (
                      <div className="w-full mt-1 rounded-xl border bg-card text-card-foreground p-3 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {action.actionType === 'payable' ? (
                              <Badge variant="destructive" className="text-[10px] uppercase font-semibold">
                                Borrowed Money (Payable)
                              </Badge>
                            ) : action.actionType === 'receivable' ? (
                              <Badge variant="default" className="text-[10px] uppercase font-semibold bg-emerald-600">
                                Lent Money (Receivable)
                              </Badge>
                            ) : action.type === 'income' ? (
                              <Badge variant="default" className="text-[10px] uppercase font-semibold bg-emerald-600">
                                Income Entry
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                                Expense Entry
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs font-bold text-foreground">
                            {formatINR(action.amount)}
                          </span>
                        </div>

                        <div className="space-y-1 text-xs text-muted-foreground">
                          {action.description && (
                            <p className="font-medium text-foreground">{action.description}</p>
                          )}
                          {action.personName && (
                            <div className="flex items-center gap-1">
                              <Users className="h-3 w-3 text-muted-foreground" />
                              <span>Person: <strong className="text-foreground">{action.personName}</strong></span>
                            </div>
                          )}
                          {action.accountName && (
                            <div className="flex items-center gap-1">
                              <Wallet className="h-3 w-3 text-muted-foreground" />
                              <span>Account: <strong className="text-foreground">{action.accountName}</strong></span>
                            </div>
                          )}
                          {action.date && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              <span>Date: {action.date}</span>
                            </div>
                          )}
                        </div>

                        {/* Action Card Controls */}
                        {actionStatus === 'pending' ? (
                          <div className="flex items-center gap-2 pt-1 border-t">
                            <Button
                              size="sm"
                              className="flex-1 h-8 text-xs font-medium"
                              disabled={isExecuting}
                              onClick={() => handleExecuteAction(m.id, action)}
                            >
                              {isExecuting ? (
                                <>
                                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                  Adding…
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                  Confirm & Add
                                </>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs px-2.5"
                              disabled={isExecuting}
                              onClick={() => handleDismissAction(m.id)}
                            >
                              Dismiss
                            </Button>
                          </div>
                        ) : actionStatus === 'success' ? (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium pt-1 border-t">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Successfully recorded into your database!
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground italic pt-1 border-t">
                            Action dismissed.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {error && (
              <div className="p-3 text-xs bg-destructive/10 text-destructive rounded-lg border border-destructive/20 text-center">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Listening Indicator */}
          {isListening && (
            <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/20 flex items-center justify-between text-xs text-destructive animate-pulse">
              <div className="flex items-center gap-2 font-medium">
                <span className="h-2 w-2 rounded-full bg-destructive animate-ping" />
                Listening to your voice… speak now
              </div>
              <button
                type="button"
                onClick={toggleListening}
                className="underline hover:opacity-80 text-[11px]"
              >
                Done
              </button>
            </div>
          )}

          {/* Input area */}
          <div className="p-3 border-t bg-background">
            <form onSubmit={handleFormSubmit} className="flex items-center gap-1.5">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isListening ? "Listening..." : "Type or speak financial actions…"}
                className="flex-1 h-9 text-sm"
                disabled={isLoading}
                autoComplete="off"
              />

              {/* Microphone Toggle Button */}
              <Button
                type="button"
                size="icon"
                variant={isListening ? "destructive" : "outline"}
                className={cn(
                  "h-9 w-9 shrink-0 transition-all",
                  isListening && "ring-2 ring-destructive ring-offset-2 animate-pulse"
                )}
                onClick={toggleListening}
                title={isListening ? "Stop listening" : "Voice input (Microphone)"}
                aria-label={isListening ? "Stop voice input" : "Start voice input"}
                disabled={isLoading}
              >
                {isListening ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>

              {/* Send Button */}
              <Button
                type="submit"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={isLoading || !input.trim()}
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </Button>
            </form>
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              Speak or type to log transactions & debts · Review before confirming
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

