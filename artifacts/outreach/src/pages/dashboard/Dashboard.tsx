import { useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Send, MessageSquareReply, Flame, Clock } from "lucide-react";

const stats = [
  { key: "prospectsImported" as const, label: "Prospects imported", icon: Users },
  { key: "emailsSent" as const, label: "Emails sent", icon: Send },
  { key: "replies" as const, label: "Replies received", icon: MessageSquareReply },
  { key: "interestedLeads" as const, label: "Interested leads", icon: Flame },
  { key: "followupsPending" as const, label: "Follow-ups pending", icon: Clock },
];

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
    </div>
  );
}
