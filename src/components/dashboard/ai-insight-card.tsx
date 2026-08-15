"use client";

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export function AiInsightCard() {
  const [insight, setInsight] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  const generateInsight = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/ai/insights', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.insight) {
          setInsight(data.insight);
          setHasGenerated(true);
        }
      }
    } catch (e) {
      console.error('Failed to generate insight', e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
        <Sparkles className="w-32 h-32" />
      </div>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg text-primary">
          <Sparkles className="h-5 w-5" />
          AI Monthly Insight
        </CardTitle>
        {hasGenerated && (
          <Button variant="ghost" size="icon" onClick={generateInsight} disabled={isLoading} className="h-8 w-8 rounded-full">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!hasGenerated ? (
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
            <p className="text-sm text-muted-foreground max-w-[250px]">
              Generate a smart summary of your financial health this month based on your transactions.
            </p>
            <Button onClick={generateInsight} disabled={isLoading} className="shadow-md transition-transform hover:scale-105">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Insight
                </>
              )}
            </Button>
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
