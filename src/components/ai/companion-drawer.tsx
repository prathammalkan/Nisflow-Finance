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
  Users,
  Wallet,
  Calendar,
  AlertCircle,
  RotateCcw,
  Landmark,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { formatINR } from '@/lib/finance/money';
import { toast } from 'sonner';
import { executeAIFinancialAction, AIFinancialActionPayload, AIActionType } from '@/lib/ledger/ai';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

const SUGGESTIONS = [
  'Paid ₹350 for lunch from Kotak',
  'I borrowed ₹5,000 from Rahul',
  'Lent ₹2,000 to Amit',
  'Paid EMI ₹15,000 for Car Loan from HDFC',
];

function normalizeActionPayload(raw: any): AIFinancialActionPayload | null {
  if (!raw || typeof raw !== 'object') return null;

  let actionType: AIActionType = raw.actionType || 'expense';

  // Map legacy action types for backwards compatibility
  if (raw.actionType === 'payable') actionType = 'borrowing';
  else if (raw.actionType === 'receivable') actionType = 'lending';
  else if (raw.actionType === 'transaction') {
    if (raw.type === 'income' || raw.direction === 'in') actionType = 'income';
    else if (raw.type === 'transfer') actionType = 'transfer';
    else actionType = 'expense';
  }

  return {
    actionType,
    actionId: raw.actionId || raw.id,
    amount: raw.amount || 0,
    currency: raw.currency || 'INR',
    description: raw.description,
    date: raw.date,
    notes: raw.notes,
    accountId: raw.accountId,
    accountName: raw.accountName,
    toAccountId: raw.toAccountId,
    toAccountName: raw.toAccountName,
    personId: raw.personId,
    personName: raw.personName,
    repaymentId: raw.repaymentId,
    loanId: raw.loanId,
    loanName: raw.loanName,
    principalAmount: raw.principalAmount,
    interestAmount: raw.interestAmount,
    assetSymbol: raw.assetSymbol,
    assetName: raw.assetName,
    quantity: raw.quantity,
    pricePerUnit: raw.pricePerUnit,
    holdingAccountId: raw.holdingAccountId,
    costBasis: raw.costBasis,
    realizedGainLoss: raw.realizedGainLoss,
    originalJournalEntryId: raw.originalJournalEntryId,
    reversalReason: raw.reversalReason,
  };
}

function extractActionAndText(content: string): { cleanText: string; action: AIFinancialActionPayload | null } {
  const match = content.match(/\[ACTION\]([\s\S]*?)\[\/ACTION\]/);
  if (!match) {
    return { cleanText: content, action: null };
  }

  const rawJson = match[1].trim();
  const cleanText = content.replace(/\[ACTION\][\s\S]*?\[\/ACTION\]/, '').trim();

  try {
    const rawAction = JSON.parse(rawJson);
    const action = normalizeActionPayload(rawAction);
    return { cleanText, action };
  } catch {
    return { cleanText, action: null };
  }
}

export function CompanionDrawer() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [actionStatuses, setActionStatuses] = useState<Record<string, 'pending' | 'success' | 'dismissed'>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [isExecutingAction, setIsExecutingAction] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (open) {
      scrollToBottom();
    }
  }, [messages, open, scrollToBottom]);

  // Clean up speech recognition & active fetches on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
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
          toast.error('Microphone permission was denied. Please allow microphone access in your browser.');
        } else if (event.error !== 'no-speech') {
          toast.error('Voice recognition error. Please try typing instead.');
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

    setInput('');

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    const assistantMessageId = `assistant-${Date.now()}`;
    const newMessages = [...messages.filter((m) => !m.isError), userMessage];

    setMessages([
      ...newMessages,
      { id: assistantMessageId, role: 'assistant', content: '' },
    ]);
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => {
      controller.abort('timeout');
    }, 35000);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        signal: controller.signal,
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = 'NisFlow AI is temporarily unavailable. Try again.';
        if (response.status === 401) {
          errorMessage = 'Session expired. Please sign in again.';
          toast.error('Authentication session expired');
        } else if (response.status === 429) {
          errorMessage = 'Too many requests. Please wait a moment before asking again.';
        } else {
          const errorData = await response.json().catch(() => ({}));
          if (errorData.error) errorMessage = errorData.error;
        }
        throw new Error(errorMessage);
      }

      if (!response.body) {
        throw new Error('No response received from server.');
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

      if (!accumulatedContent.trim()) {
        throw new Error('NisFlow AI was unable to generate a response. Please try again.');
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('Chat error:', err);

      let userFacingError = 'NisFlow AI is temporarily unavailable. Try again.';
      if (err.name === 'AbortError' || err === 'timeout') {
        userFacingError = 'The request took too long. Check your connection and try again.';
      } else if (err.message && (err.message.includes('fetch') || err.message.includes('network') || err.message.includes('Failed to fetch'))) {
        userFacingError = "NisFlow AI couldn't connect. Check your internet connection and try again.";
      } else if (err.message) {
        userFacingError = err.message;
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: userFacingError,
                isError: true,
              }
            : msg
        )
      );
      toast.error(userFacingError);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleExecuteAction = async (msgId: string, action: AIFinancialActionPayload) => {
    setIsExecutingAction((prev) => ({ ...prev, [msgId]: true }));
    setActionErrors((prev) => ({ ...prev, [msgId]: '' }));
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User is not authenticated. Please sign in again.');

      const result = await executeAIFinancialAction(supabase as any, user.id, msgId, action);

      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to execute financial action');
      }

      // Invalidate all related caches
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['people_ledger_summary'] });
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      queryClient.invalidateQueries({ queryKey: ['receivables-summary'] });
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      queryClient.invalidateQueries({ queryKey: ['payables-summary'] });
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['investments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

      toast.success(result.message);
      setActionStatuses((prev) => ({ ...prev, [msgId]: 'success' }));
    } catch (err: any) {
      console.error('Failed to execute action:', err);
      const errMsg = err.message || 'Failed to record entry';
      setActionErrors((prev) => ({ ...prev, [msgId]: errMsg }));
      toast.error(errMsg);
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
    setActionStatuses({});
  };

  const renderBadge = (action: AIFinancialActionPayload) => {
    switch (action.actionType) {
      case 'lending':
        return <Badge className="text-[10px] uppercase font-semibold bg-emerald-600">Lent Money (Receivable)</Badge>;
      case 'borrowing':
        return <Badge variant="destructive" className="text-[10px] uppercase font-semibold">Borrowed Money (Payable)</Badge>;
      case 'receivable_repayment':
        return <Badge className="text-[10px] uppercase font-semibold bg-emerald-600">Receivable Repayment</Badge>;
      case 'payable_repayment':
        return <Badge variant="destructive" className="text-[10px] uppercase font-semibold">Payable Repayment</Badge>;
      case 'loan_emi':
        return <Badge variant="secondary" className="text-[10px] uppercase font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950">Loan EMI Payment</Badge>;
      case 'income':
      case 'investment_dividend':
        return <Badge className="text-[10px] uppercase font-semibold bg-emerald-600">Income Entry</Badge>;
      case 'transfer':
        return <Badge variant="outline" className="text-[10px] uppercase font-semibold text-blue-600">Account Transfer</Badge>;
      case 'investment_buy':
        return <Badge variant="secondary" className="text-[10px] uppercase font-semibold text-purple-600">Investment Buy</Badge>;
      case 'investment_sell':
        return <Badge variant="secondary" className="text-[10px] uppercase font-semibold text-purple-600">Investment Sell</Badge>;
      case 'reversal':
        return <Badge variant="destructive" className="text-[10px] uppercase font-semibold">Reversal / Correction</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px] uppercase font-semibold">Expense Entry</Badge>;
    }
  };

  return (
    <>
      {/* Floating trigger button */}
      <Button
        size="icon"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 h-12 w-12 rounded-full shadow-lg z-40 bg-primary hover:bg-primary/90 text-primary-foreground"
        aria-label="Open AI Finance Assistant"
      >
        <Sparkles className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md flex flex-col p-0 border-l h-[100dvh] max-h-[100dvh]"
        >
          <SheetHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0 shrink-0">
            <SheetTitle className="flex items-center gap-2 text-sm sm:text-base font-semibold">
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

          {/* Messages scrollable area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-sm">Finance Assistant & Voice Logger</p>
                  <p className="text-xs text-muted-foreground max-w-[240px]">
                    Ask about your finances, or use voice/text to log expenses, income, debts & loan EMIs.
                  </p>
                </div>
                <div className="w-full space-y-2 max-w-sm">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSuggestion(s)}
                      className="w-full text-left text-xs px-3 py-2.5 rounded-lg border border-border bg-muted/40 hover:bg-muted transition-colors text-foreground"
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

                if (m.isError) {
                  return (
                    <div key={m.id} className="w-full p-3 text-xs bg-destructive/10 text-destructive rounded-xl border border-destructive/20 space-y-2">
                      <div className="flex items-center gap-2 font-medium">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{m.content}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1 border-destructive/30 hover:bg-destructive/10 text-destructive"
                        onClick={() => {
                          const lastUser = [...messages].reverse().find((msg) => msg.role === 'user');
                          if (lastUser) sendMessage(lastUser.content);
                        }}
                      >
                        <RotateCcw className="h-3 w-3" /> Retry
                      </Button>
                    </div>
                  );
                }

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
                      <div className="w-full mt-1 rounded-xl border border-border bg-card text-card-foreground p-3 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {renderBadge(action)}
                          </div>
                          <span className="text-xs font-bold text-foreground">
                            {formatINR(Number(action.amount))}
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
                          {action.loanName && (
                            <div className="flex items-center gap-1">
                              <Landmark className="h-3 w-3 text-muted-foreground" />
                              <span>Loan: <strong className="text-foreground">{action.loanName}</strong></span>
                            </div>
                          )}
                          {action.assetSymbol && (
                            <div className="flex items-center gap-1">
                              <TrendingUp className="h-3 w-3 text-muted-foreground" />
                              <span>Asset: <strong className="text-foreground">{action.assetSymbol}</strong></span>
                            </div>
                          )}
                          {action.date && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              <span>Date: {action.date}</span>
                            </div>
                          )}
                        </div>

                        {/* Error state if mutation failed */}
                        {actionStatus === 'pending' && actionErrors[m.id] && (
                          <div className="p-2 rounded-lg bg-destructive/10 text-destructive text-xs border border-destructive/20 space-y-0.5">
                            <p className="font-semibold">⚠️ Entry was NOT recorded</p>
                            <p className="text-[11px] opacity-90">{actionErrors[m.id]}</p>
                          </div>
                        )}

                        {/* Action Card Controls */}
                        {actionStatus === 'pending' ? (
                          <div className="flex items-center gap-2 pt-1 border-t border-border">
                            <Button
                              size="sm"
                              className="flex-1 h-8 text-xs font-medium"
                              disabled={isExecuting}
                              onClick={() => handleExecuteAction(m.id, action)}
                            >
                              {isExecuting ? (
                                <>
                                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                  Posting to Ledger…
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                  Confirm & Post to Ledger
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
                          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium pt-1 border-t border-border">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Confirmed and recorded into authoritative double-entry ledger!
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground italic pt-1 border-t border-border">
                            Action dismissed.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Listening Indicator */}
          {isListening && (
            <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/20 flex items-center justify-between text-xs text-destructive animate-pulse shrink-0">
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

          {/* Input area with safe-area padding for mobile */}
          <div
            className="p-3 border-t border-border bg-background shrink-0"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}
          >
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
              Review & confirm before posting to double-entry ledger
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
