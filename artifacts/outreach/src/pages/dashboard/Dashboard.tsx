import { useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Users, Send, MessageSquareReply, Flame, Clock } from "lucide-react";

const stats = [
  { key: "prospectsImported" as const, label: "Prospects imported", icon: Users },
  { key: "emailsSent" as const, label: "Emails sent", icon: Send },
  { key: "replies" as const, label: "Replies received", icon: MessageSquareReply },
  { key: "interestedLeads" as const, label: "Interested prospects", icon: Flame },
  { key: "followupsPending" as const, label: "Follow-ups pending", icon: Clock },
];

const categoryLabel: Record<string, string> = {
  interested: "Interested",
  pricing: "Asked about pricing",
  meeting_request: "Wants a meeting",
  need_more_info: "Wants more info",
  not_interested: "Not interested",
  wrong_contact: "Wrong contact",
  out_of_office: "Out of office",
  spam: "Spam",
  other: "Other",
};

export default function Dashboard() {
  const { data, isLoading } = useGetDashboardSummary();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          A snapshot of your outbound pipeline right now.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((stat) => (
          <Card key={stat.key} data-testid={`card-stat-${stat.key}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-3xl font-bold" data-testid={`text-stat-${stat.key}`}>
                  {data?.[stat.key] ?? 0}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {!isLoading && data?.prospectsImported === 0 && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No prospects yet. Head to <span className="font-medium text-foreground">Prospects</span> to
            add companies manually or run AI discovery, then build your first campaign.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who's interested</CardTitle>
          <p className="text-sm text-muted-foreground">
            Every reply the agent flagged as a hot lead, most recent first.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !data?.interestedProspects?.length ? (
            <p className="text-sm text-muted-foreground">No interested prospects yet.</p>
          ) : (
            <div className="space-y-2">
              {data.interestedProspects.map((p) => (
                <div
                  key={p.threadId}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                  data-testid={`row-interested-${p.threadId}`}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {p.contactName ? `${p.contactName} · ${p.companyName}` : p.companyName}
                    </div>
                    {p.summary && (
                      <div className="text-xs text-muted-foreground truncate">{p.summary}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.email && <span className="text-xs text-muted-foreground">{p.email}</span>}
                    <Badge variant="secondary">{categoryLabel[p.category] ?? p.category}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
