import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetThread,
  useGenerateReplyDraft,
  useSendReply,
  getGetThreadQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Sparkles, Send, Flame, MailOpen, MousePointerClick } from "lucide-react";

export default function ThreadDetail() {
  const { id } = useParams<{ id: string }>();
  const threadId = Number(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const [loadedFor, setLoadedFor] = useState<number | null>(null);

  const { data: thread, isLoading } = useGetThread(threadId);

  if (thread && loadedFor !== thread.id) {
    setReply(thread.draftReply ?? "");
    setLoadedFor(thread.id);
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetThreadQueryKey(threadId) });

  const generateDraft = useGenerateReplyDraft({
    mutation: {
      onSuccess: (t) => {
        setReply(t.draftReply ?? "");
        invalidate();
        toast({ title: "Draft generated" });
      },
      onError: () => toast({ title: "Draft generation failed", variant: "destructive" }),
    },
  });

  const sendReply = useSendReply({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Reply sent" });
      },
      onError: () => toast({ title: "Couldn't send reply", description: "Gmail may not be connected yet.", variant: "destructive" }),
    },
  });

  if (isLoading || !thread) {
    return <div className="text-sm text-muted-foreground">Loading thread...</div>;
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => setLocation("/inbox")} data-testid="button-back-inbox">
        <ArrowLeft className="h-4 w-4 mr-1" />
        Inbox
      </Button>

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{thread.companyName}</h1>
          {thread.isHot && (
            <Badge className="bg-primary text-primary-foreground gap-1">
              <Flame className="h-3 w-3" /> Hot lead
            </Badge>
          )}
          {thread.category && <Badge variant="secondary">{thread.category.replace(/_/g, " ")}</Badge>}
        </div>
        <p className="text-muted-foreground text-sm mt-1">{thread.subject}</p>
        {(thread.openCount ?? 0) > 0 || (thread.clickCount ?? 0) > 0 ? (
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1" data-testid="text-thread-open-count">
              <MailOpen className="h-3.5 w-3.5" />
              {thread.openCount ?? 0} {thread.openCount === 1 ? "open" : "opens"}
            </span>
            <span className="flex items-center gap-1" data-testid="text-thread-click-count">
              <MousePointerClick className="h-3.5 w-3.5" />
              {thread.clickCount ?? 0} {thread.clickCount === 1 ? "click" : "clicks"}
            </span>
          </div>
        ) : null}
        {thread.aiSummary && (
          <Card className="mt-3">
            <CardContent className="pt-4 text-sm flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>{thread.aiSummary}</span>
              {typeof thread.categoryConfidence === "number" && (
                <span className="text-xs text-muted-foreground ml-auto shrink-0">
                  {Math.round(thread.categoryConfidence * 100)}% confidence
                </span>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-3">
        {thread.messages.map((m) => (
          <Card key={m.id} className={m.direction === "outgoing" ? "bg-muted/40" : ""} data-testid={`message-${m.id}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {m.direction === "outgoing" ? "You" : thread.companyName} &rarr; {m.toAddress}
                </span>
                <span>{m.sentAt ? new Date(m.sentAt).toLocaleString() : "Draft"}</span>
              </div>
              {m.direction === "outgoing" && ((m.openCount ?? 0) > 0 || (m.clickCount ?? 0) > 0) && (
                <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
                  {(m.openCount ?? 0) > 0 && (
                    <span className="flex items-center gap-1" data-testid={`text-message-open-${m.id}`}>
                      <MailOpen className="h-3.5 w-3.5" />
                      Opened {m.openCount}x
                      {m.lastOpenedAt && ` · last ${new Date(m.lastOpenedAt).toLocaleString()}`}
                    </span>
                  )}
                  {(m.clickCount ?? 0) > 0 && (
                    <span className="flex items-center gap-1" data-testid={`text-message-click-${m.id}`}>
                      <MousePointerClick className="h-3.5 w-3.5" />
                      Clicked {m.clickCount}x
                    </span>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm pt-0">{m.body}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Reply</CardTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => generateDraft.mutate({ id: threadId })}
            disabled={generateDraft.isPending}
            data-testid="button-generate-draft"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {generateDraft.isPending ? "Writing..." : "Draft with AI"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={8}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write or generate a reply..."
            data-testid="textarea-reply"
          />
          <div className="flex justify-end">
            <Button
              onClick={() => sendReply.mutate({ id: threadId, data: { useDraft: false, body: reply } })}
              disabled={!reply.trim() || sendReply.isPending}
              data-testid="button-send-reply"
            >
              <Send className="h-4 w-4 mr-2" />
              {sendReply.isPending ? "Sending..." : "Send reply"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
