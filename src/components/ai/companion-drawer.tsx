"use client";

import { useChat } from '@ai-sdk/react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Send, Bot, User, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

export function CompanionDrawer() {
  const [open, setOpen] = useState(false);
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat() as any;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 bg-primary hover:bg-primary/90 transition-transform hover:scale-105"
        >
          <Sparkles className="h-6 w-6 text-primary-foreground" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0 border-l h-full">
        <SheetHeader className="p-4 border-b bg-muted/30">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            NisFlow AI Companion
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-8 space-y-4">
              <Bot className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm">
                I'm your financial AI companion. Ask me anything about your spending, net worth, or budgets.
              </p>
              <div className="flex flex-col gap-2 w-full mt-4">
                <Button variant="outline" size="sm" onClick={() => handleInputChange({ target: { value: 'How much did I spend this month?' } } as any)}>
                  "How much did I spend this month?"
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleInputChange({ target: { value: 'What is my current net worth?' } } as any)}>
                  "What is my current net worth?"
                </Button>
              </div>
            </div>
          ) : (
            messages.map((m: any) => (
              <div
                key={m.id}
                className={cn(
                  "flex flex-col gap-2 max-w-[85%]",
                  m.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                )}
              >
                <div
                  className={cn(
                    "flex items-center gap-2 text-xs text-muted-foreground mb-1",
                    m.role === 'user' ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  {m.role === 'user' ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                  {m.role === 'user' ? 'You' : 'NisFlow AI'}
                </div>
                <div
                  className={cn(
                    "px-4 py-2.5 rounded-2xl text-sm prose prose-sm max-w-none",
                    m.role === 'user' 
                      ? "bg-primary text-primary-foreground rounded-br-sm" 
                      : "bg-muted text-foreground rounded-bl-sm"
                  )}
                >
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                  
                  {m.toolInvocations?.map((toolInvocation: any) => {
                    const toolCallId = toolInvocation.toolCallId;
                    
                    if ('result' in toolInvocation) {
                      return (
                        <div key={toolCallId} className="mt-2 text-xs opacity-70 bg-black/10 dark:bg-white/10 p-2 rounded">
                          ✓ Checked your {toolInvocation.toolName === 'getTransactions' ? 'transactions' : toolInvocation.toolName === 'getNetWorth' ? 'net worth' : 'accounts'}
                        </div>
                      );
                    }
                    
                    return (
                      <div key={toolCallId} className="mt-2 text-xs opacity-70 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Fetching data...
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
          {isLoading && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex items-center gap-2 text-muted-foreground text-xs mr-auto">
              <Loader2 className="h-3 w-3 animate-spin" />
              Thinking...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t bg-background">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) handleSubmit(e);
            }}
            className="flex items-center gap-2"
          >
            <Input
              value={input}
              onChange={handleInputChange}
              placeholder="Ask about your finances..."
              className="flex-1"
              disabled={isLoading}
            />
            <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
