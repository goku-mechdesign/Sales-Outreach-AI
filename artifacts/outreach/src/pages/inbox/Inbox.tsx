import { useState } from "react";
import { useLocation } from "wouter";
import { useListThreads, usePollInbox } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Inbox as InboxIcon, Search, RefreshCw, Flame } from "lucide-react";
import type { ReplyCategory } from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";

const categoryLabel: Record<ReplyCategory, string> = {
  interested: "Interested",
  need_more_info: "Needs more info",
  pricing: "Pricing question",
  meeting_request: "Meeting request",
  not_interested: "Not interested",
  wrong_contact: "Wrong contact",
  out_of_office: "Out of office",
  spam: "Spam",
  other: "Other",
};

export default function Inbox() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ReplyCategory | "all">("all");
  const [hotOnly, setHotOnly] = useState(false);

  const { data, isLoading } = useListThreads({
    search: search || undefined,
    category: category === "all" ? undefined : category,
    isHot: hotOnly ? true : undefined,
    pageSize: 100,
  });

  const pollInbox = usePollInbox({
    mutation: {
      onSuccess: (result) => {
        queryClient.invalidateQueries();
        toast({
          title: "Inbox checked",
          description: `${result.newMessages} new messages, ${result.newlyClassified} classified, ${result.hotLeads} hot leads.`,
        });
      },
      onError: () => toast({ title: "Couldn't check inbox", description: "Gmail may not be connected yet.", variant: "destructive" }),
    },
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Inbox</h1>
          <p className="text-muted-foreground text-sm mt-1">Replies to your campaigns, classified by AI.</p>
        </div>
        <Button variant="outline" onClick={() => pollInbox.mutate()} disabled={pollInbox.isPending} data-testid="button-poll-inbox">
          <RefreshCw className={`h-4 w-4 mr-2 ${pollInbox.isPending ? "animate-spin" : ""}`} />
          Check for new replies
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by company..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" data-testid="input-search-inbox" />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v as ReplyCategory | "all")}>
          <SelectTrigger className="w-48" data-testid="select-category-filter">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {Object.entries(categoryLabel).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={hotOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setHotOnly((v) => !v)}
          data-testid="button-hot-filter"
        >
          <Flame className="h-4 w-4 mr-2" />
          Hot leads
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading threads...</div>
          ) : items.length === 0 ? (
            <div className="p-12 flex flex-col items-center text-center text-muted-foreground">
              <InboxIcon className="h-10 w-10 mb-3 opacity-30" />
              <p className="font-medium text-foreground">No replies yet</p>
              <p className="text-sm mt-1">Once prospects reply, they'll show up here classified by AI.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {items.map((thread) => (
                <div
                  key={thread.id}
                  className="p-4 flex items-start justify-between gap-4 cursor-pointer hover-elevate"
                  onClick={() => setLocation(`/inbox/${thread.id}`)}
                  data-testid={`row-thread-${thread.id}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{thread.companyName}</span>
                      {thread.isHot && (
                        <Badge className="bg-primary text-primary-foreground gap-1">
                          <Flame className="h-3 w-3" /> Hot
                        </Badge>
                      )}
                      {thread.category && (
                        <Badge variant="secondary">{categoryLabel[thread.category]}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">{thread.subject}</p>
                    {thread.aiSummary && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{thread.aiSummary}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(thread.lastMessageAt))} ago
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
