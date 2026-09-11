"use client";

import { useState } from "react";
import { Sparkles, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

interface AiInsightCardProps {
  className?: string;
}

export function AiInsightCard({ className }: AiInsightCardProps) {
  const [insight, setInsight] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const generateInsight = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/insights", { method: "POST" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || `Request failed (${res.status})`);
      }
      const data = await res.json();
      if (data.insight) {
        setInsight(data.insight);
        setHasGenerated(true);
        setExpanded(true);
      } else {
        throw new Error("No insight returned from AI.");
      }
    } catch (e: any) {
      console.error("Failed to generate insight", e);
      setError(e?.message || "Could not generate insight. Please try again.");
      setHasGenerated(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Quiet contextual entry point
  if (!hasGenerated) {
    return (
      <button
        onClick={generateInsight}
        disabled={isLoading}
        className={cn(
          "flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors",
          className
        )}
        aria-label="Generate AI financial summary"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary/60" />
        ) : (
          <Sparkles className="h-4 w-4 text-primary/60" />
        )}
        <span>{isLoading ? "Analyzing…" : "Ask NisFlow for a summary"}</span>
      </button>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          <Sparkles className="h-4 w-4" />
          AI summary
        </button>
        <button
          onClick={generateInsight}
          disabled={isLoading}
          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Refresh AI insight"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </button>
      </div>

      {expanded && (
        <div className="rounded-xl border border-border/60 bg-card p-4">
          {error ? (
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 text-caution mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          ) : insight ? (
            <div className="prose prose-sm max-w-none text-muted-foreground prose-p:leading-relaxed prose-strong:text-foreground prose-p:my-1">
              <ReactMarkdown>{insight}</ReactMarkdown>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
