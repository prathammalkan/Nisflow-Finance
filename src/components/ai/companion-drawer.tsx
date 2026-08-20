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
  ShieldCheck,
  ArrowRightLeft,
  PlusCircle,
} from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { formatINR } from '@/lib/finance/money';
import { toast } from 'sonner';
import { executeAIFinancialAction, AIFinancialActionPayload, AIActionType } from '@/lib/ledger/ai';
import { executeAIActionServer } from '@/app/actions/ledger-ai';
import { generateAccountingPreview } from '@/lib/ai/accounting-preview';

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
  'Create my Zerodha Demat account',
  'Create my BOB bank account',
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
    accountType: raw.accountType,
    toAccountId: raw.toAccountId,
    toAccountName: raw.toAccountName,
    openingBalance: raw.openingBalance,
    personId: raw.personId,
    personName: raw.personName,
    phone: raw.phone,
    email: raw.email,
    relationship: raw.relationship,
    repaymentId: raw.repaymentId,
    loanId: raw.loanId,
    loanName: raw.loanName,
    loanType: raw.loanType,
    principalAmount: raw.principalAmount,
    interestAmount: raw.interestAmount,
    assetSymbol: raw.assetSymbol,
    assetName: raw.assetName,
    quantity: raw.quantity,
    pricePerUnit: raw.pricePerUnit,
    holdingAccountId: raw.holdingAccountId,
    holdingAccountName: raw.holdingAccountName,
    costBasis: raw.costBasis,
    realizedGainLoss: raw.realizedGainLoss,
    categoryName: raw.categoryName,
    categoryId: raw.categoryId,
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

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const supabase = createClient();
  const queryClient = useQueryClient();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Handle Speech Recognition for voice input
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-IN';

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
          setIsListening(false);
        };

        recognition.onerror = () => {
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      toast.error('Speech recognition is not supported in this browser.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  };

  const sendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend.trim(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    const assistantMessageId = `asst-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: assistantMessageId, role: 'assistant', content: '' },
    ]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) {
        let errorMsg = 'Failed to get response from AI';
        try {
          const errData = await response.json();
          errorMsg = errData.error || errorMsg;
        } catch {
          // Keep default
        }
        throw new Error(errorMsg);
      }

      if (!response.body) {
        throw new Error('No response body received from server.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId ? { ...msg, content: fullContent } : msg
          )
        );
      }
    } catch (err: any) {
      console.error('Chat error:', err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: err.message || 'AI service encountered an error. Please try again.', isError: true }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteAction = async (messageId: string, action: AIFinancialActionPayload) => {
    setIsExecutingAction((prev) => ({ ...prev, [messageId]: true }));
    setActionErrors((prev) => ({ ...prev, [messageId]: '' }));

    try {
      const result = await executeAIActionServer(messageId, action);

      if (!result.success) {
        setActionErrors((prev) => ({
          ...prev,
          [messageId]: result.error || 'Failed to record entry in double-entry ledger.',
        }));
        toast.error(result.error || 'Execution failed');
        return;
      }

      setActionStatuses((prev) => ({ ...prev, [messageId]: 'success' }));
      toast.success(result.message || 'Action executed and verified!');

      // Invalidate relevant React Query caches
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['investments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['savings-goals'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    } catch (err: any) {
      console.error('Action execution error:', err);
      setActionErrors((prev) => ({
        ...prev,
        [messageId]: err.message || 'An unexpected error occurred.',
      }));
      toast.error(err.message || 'Failed to execute action');
    } finally {
      setIsExecutingAction((prev) => ({ ...prev, [messageId]: false }));
    }
  };

  const handleDismissAction = (messageId: string) => {
    setActionStatuses((prev) => ({ ...prev, [messageId]: 'dismissed' }));
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
      case 'create_account':
        return <Badge variant="secondary" className="text-[10px] uppercase font-semibold text-blue-600 bg-blue-50 dark:bg-blue-950"><PlusCircle className="mr-1 h-3 w-3" /> New Account</Badge>;
      case 'create_person':
        return <Badge variant="secondary" className="text-[10px] uppercase font-semibold text-cyan-600 bg-cyan-50 dark:bg-cyan-950"><Users className="mr-1 h-3 w-3" /> Add Person</Badge>;
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
        return <Badge variant="outline" className="text-[10px] uppercase font-semibold text-blue-600"><ArrowRightLeft className="mr-1 h-3 w-3" /> Account Transfer</Badge>;
      case 'investment_buy':
        return <Badge variant="secondary" className="text-[10px] uppercase font-semibold text-purple-600"><TrendingUp className="mr-1 h-3 w-3" /> Investment Purchase</Badge>;
      case 'investment_sell':
        return <Badge variant="secondary" className="text-[10px] uppercase font-semibold text-purple-600"><TrendingUp className="mr-1 h-3 w-3" /> Investment Sale</Badge>;
      case 'reversal':
      case 'delete_loan':
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
                  <Trash2 className="h-4 w-4" />
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

          {/* Chat message thread */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-4 text-muted-foreground">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <Bot className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-foreground text-sm">How can I help with your finances today?</h3>
                  <p className="text-xs text-muted-foreground">
                    Ask about your balances, create accounts, record transactions, loans, investments, or debts.
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

                // Generate server-derived accounting preview for financial actions
                const preview = action && action.actionType !== 'create_account' && action.actionType !== 'create_person'
                  ? generateAccountingPreview({
                      actionType: action.actionType,
                      amount: action.amount || 0,
                      sourceAccountName: action.accountName,
                      destAccountName: action.toAccountName || action.holdingAccountName,
                      personName: action.personName,
                      loanName: action.loanName,
                      assetSymbol: action.assetSymbol,
                      categoryName: action.categoryName,
                      principalAmount: action.principalAmount,
                      interestAmount: action.interestAmount,
                      costBasis: action.costBasis,
                      realizedGainLoss: action.realizedGainLoss,
                      description: action.description,
                    })
                  : null;

                const isDestructive = action?.actionType === 'reversal' || action?.actionType === 'delete_loan';
                const isNonFinancial = action?.actionType === 'create_account' || action?.actionType === 'create_person';

                return (
                  <div
                    key={m.id}
                    className={cn(
                      'flex flex-col gap-1.5 max-w-[94%]',
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
                      <div className={cn(
                        "w-full mt-1 rounded-xl border p-3 shadow-sm space-y-3",
                        isDestructive
                          ? "border-destructive/30 bg-destructive/5 text-card-foreground"
                          : "border-border bg-card text-card-foreground"
                      )}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {renderBadge(action)}
                          </div>
                          {Number(action.amount) > 0 && (
                            <span className="text-xs font-bold text-foreground">
                              {formatINR(Number(action.amount))}
                            </span>
                          )}
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
                              <span>{action.actionType === 'investment_buy' || action.actionType === 'investment_sell' ? 'Funding Bank: ' : 'Account: '}<strong className="text-foreground">{action.accountName}</strong></span>
                            </div>
                          )}
                          {(action.holdingAccountName || action.holdingAccountId) && (
                            <div className="flex items-center gap-1">
                              <Landmark className="h-3 w-3 text-muted-foreground" />
                              <span>Investment/Demat: <strong className="text-foreground">{action.holdingAccountName || 'Investment Account'}</strong></span>
                            </div>
                          )}
                          {action.loanName && (
                            <div className="flex items-center gap-1">
                              <Landmark className="h-3 w-3 text-muted-foreground" />
                              <span>Loan: <strong className="text-foreground">{action.loanName}</strong></span>
                            </div>
                          )}
                          {(action.assetSymbol || action.assetName) && (
                            <div className="flex items-center gap-1">
                              <TrendingUp className="h-3 w-3 text-muted-foreground" />
                              <span>Asset/Security: <strong className="text-foreground">{action.assetSymbol || action.assetName}</strong></span>
                            </div>
                          )}
                          {action.date && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              <span>Date: {action.date}</span>
                            </div>
                          )}
                        </div>

                        {/* Server-Generated Accounting Preview */}
                        {preview && (
                          <div className="p-2 rounded-lg bg-muted/60 border border-border/60 text-[11px] space-y-1.5 font-mono">
                            <div className="flex items-center justify-between text-muted-foreground font-sans font-medium text-[10px] uppercase">
                              <span>Accounting Preview</span>
                              <span className={cn(
                                "font-semibold",
                                preview.netWorthEffect.direction === 'POSITIVE' ? 'text-emerald-600 dark:text-emerald-400' :
                                preview.netWorthEffect.direction === 'NEGATIVE' ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'
                              )}>
                                {preview.netWorthEffect.direction === 'POSITIVE' ? `+₹${preview.netWorthEffect.amount}` :
                                 preview.netWorthEffect.direction === 'NEGATIVE' ? `-₹${preview.netWorthEffect.amount}` : 'Net Worth Neutral'}
                              </span>
                            </div>
                            <div className="space-y-0.5">
                              {preview.lines.map((line, idx) => (
                                <div key={idx} className="flex items-center justify-between text-foreground">
                                  <span className="truncate pr-2">
                                    <span className={line.type === 'Dr' ? 'text-blue-500 font-bold' : 'text-amber-500 font-bold'}>
                                      {line.type}
                                    </span>{' '}
                                    {line.accountName}
                                  </span>
                                  <span className="shrink-0 font-medium">₹{line.amount}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Error or Prerequisite state */}
                        {actionStatus === 'pending' && actionErrors[m.id] && (
                          <div
                            className={cn(
                              'p-2 rounded-lg text-xs border space-y-0.5',
                              actionErrors[m.id].toLowerCase().includes('information') ||
                              actionErrors[m.id].toLowerCase().includes('required') ||
                              actionErrors[m.id].toLowerCase().includes('specify') ||
                              actionErrors[m.id].toLowerCase().includes('inactive')
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                : 'bg-destructive/10 text-destructive border-destructive/20'
                            )}
                          >
                            <p className="font-semibold">
                              {actionErrors[m.id].toLowerCase().includes('information') ||
                              actionErrors[m.id].toLowerCase().includes('required') ||
                              actionErrors[m.id].toLowerCase().includes('specify') ||
                              actionErrors[m.id].toLowerCase().includes('inactive')
                                ? 'ℹ️ Action needs information'
                                : '⚠️ Entry was NOT recorded'}
                            </p>
                            <p className="text-[11px] opacity-90">{actionErrors[m.id]}</p>
                          </div>
                        )}

                        {/* Action Card Controls */}
                        {actionStatus === 'pending' ? (
                          <div className="flex items-center gap-2 pt-1 border-t border-border">
                            <Button
                              size="sm"
                              variant={isDestructive ? "destructive" : "default"}
                              className="flex-1 h-8 text-xs font-medium"
                              disabled={isExecuting}
                              onClick={() => handleExecuteAction(m.id, action)}
                            >
                              {isExecuting ? (
                                <>
                                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                  Posting to Ledger…
                                </>
                              ) : isDestructive ? (
                                <>
                                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                                  Confirm Reversal / Deletion
                                </>
                              ) : isNonFinancial ? (
                                <>
                                  <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
                                  Confirm & Create
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
                disabled={isLoading}
                className="h-9 text-xs flex-1"
              />
              <Button
                type="button"
                variant={isListening ? "destructive" : "outline"}
                size="icon"
                onClick={toggleListening}
                disabled={isLoading}
                className="h-9 w-9 shrink-0"
                title={isListening ? "Stop listening" : "Voice input"}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Button
                type="submit"
                size="icon"
                disabled={isLoading || !input.trim()}
                className="h-9 w-9 shrink-0 bg-primary text-primary-foreground"
                aria-label="Send message"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
