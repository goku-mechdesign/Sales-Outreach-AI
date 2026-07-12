import { useListIntegrations } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, CircleDashed } from "lucide-react";
import type { IntegrationCategory } from "@workspace/api-client-react";

const categoryLabel: Record<IntegrationCategory, string> = {
  prospect_discovery: "Prospect discovery & enrichment",
  ai: "AI",
  email: "Email",
};

export default function Integrations() {
  const { data, isLoading } = useListIntegrations();

  const grouped = (data ?? []).reduce<Record<string, typeof data>>((acc, item) => {
    acc[item.category] = [...(acc[item.category] ?? []), item];
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Every external service that can power your outreach, and whether it's connected.
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading integrations...</div>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {categoryLabel[category as IntegrationCategory] ?? category}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items?.map((integration) => (
                <Card key={integration.key} data-testid={`card-integration-${integration.key}`}>
                  <CardHeader className="flex flex-row items-start justify-between pb-2">
                    <CardTitle className="text-base">{integration.displayName}</CardTitle>
                    {integration.configured ? (
                      <Badge className="gap-1 bg-primary text-primary-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-muted-foreground">
                        <CircleDashed className="h-3.5 w-3.5" />
                        Not connected
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{integration.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
