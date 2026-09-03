"use client";

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export function AiInsightCard() {
  const [insight, setInsight] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateInsight = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/insights', { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || `Request failed (${res.status})`);
      }
      const data = await res.json();
      if (data.insight) {
        setInsight(data.insight);
        setHasGenerated(true);
      } else {
        throw new Error('No insight returned from AI.');
      }
    } catch (e: any) {
      console.error('Failed to generate insight', e);
      setError(e?.message || 'Could not generate insight. Please try again.');
      setHasGenerated(true); // show error state, not initial state
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full border-primary/20 shadow-sm relative overflow-hidden">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base text-primary">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          AI Financial Summary
        </CardTitle>
        {hasGenerated && (
          <Button
            variant="ghost"
            size="icon"
            onClick={generateInsight}
            disabled={isLoading}
            className="h-8 w-8 rounded-full"
            title="Refresh insight"
            aria-label="Refresh AI insight"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!hasGenerated ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-3">
            <p className="text-sm text-muted-foreground flex-1">
              Get a smart summary of your financial health this month based on your actual transactions.
            </p>
            <Button onClick={generateInsight} disabled={isLoading} variant="outline" size="sm" className="shrink-0 gap-2">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Get AI Summary
                </>
              )}
            </Button>
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 py-3 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        ) : (
          <div className="prose prose-sm max-w-none text-muted-foreground prose-p:leading-relaxed prose-strong:text-foreground">
            {insight ? <ReactMarkdown>{insight}</ReactMarkdown> : <p>Could not load insight.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
