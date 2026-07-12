import { useState } from "react";
import {
  useListIntegrations,
  useSetIntegrationCredential,
  useClearIntegrationCredential,
  useSetGmailDisabled,
  getListIntegrationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CheckCircle2, CircleDashed, Pencil, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { IntegrationCategory, IntegrationStatus } from "@workspace/api-client-react";

const categoryLabel: Record<IntegrationCategory, string> = {
  prospect_discovery: "Prospect discovery & enrichment",
  ai: "AI",
  email: "Email",
};

function EditCredentialDialog({ integration }: { integration: IntegrationStatus }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const setCredential = useSetIntegrationCredential();

  const handleSave = () => {
    setCredential.mutate(
      { key: integration.key, data: { values } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListIntegrationsQueryKey() });
          toast({ title: `${integration.displayName} updated` });
          setValues({});
          setOpen(false);
        },
        onError: (err) => {
          toast({
            title: "Failed to save",
            description: err instanceof Error ? err.message : "Unknown error",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          data-testid={`button-edit-${integration.key}`}
        >
          <Pencil className="h-3.5 w-3.5" />
          {integration.configured ? "Update" : "Connect"}
        </Button>
      </DialogTrigger>
      <DialogContent data-testid={`dialog-edit-${integration.key}`}>
        <DialogHeader>
          <DialogTitle>{integration.displayName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{integration.description}</p>
          {integration.fields.map((field) => (
            <div key={field.name} className="space-y-1.5">
              <Label htmlFor={`field-${field.name}`}>{field.label}</Label>
              <Input
                id={`field-${field.name}`}
                type={field.secret ? "password" : "text"}
                placeholder={
                  integration.configured ? "Leave blank to keep current value" : field.label
                }
                value={values[field.name] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                }
                data-testid={`input-${integration.key}-${field.name}`}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={setCredential.isPending}
            data-testid={`button-save-${integration.key}`}
          >
            {setCredential.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IntegrationCard({ integration }: { integration: IntegrationStatus }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const clearCredential = useClearIntegrationCredential();
  const setGmailDisabled = useSetGmailDisabled();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListIntegrationsQueryKey() });

  return (
    <Card data-testid={`card-integration-${integration.key}`}>
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <CardTitle className="text-base">{integration.displayName}</CardTitle>
        {integration.configured && !integration.disabled ? (
          <Badge className="gap-1 bg-primary text-primary-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Connected
          </Badge>
        ) : integration.disabled ? (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <CircleDashed className="h-3.5 w-3.5" />
            Disabled
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <CircleDashed className="h-3.5 w-3.5" />
            Not connected
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{integration.description}</p>

        {integration.editable && (
          <div className="flex items-center gap-2">
            <EditCredentialDialog integration={integration} />
            {integration.configuredVia === "ui" && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground"
                onClick={() =>
                  clearCredential.mutate(
                    { key: integration.key },
                    {
                      onSuccess: () => {
                        invalidate();
                        toast({ title: `${integration.displayName} credentials cleared` });
                      },
                    },
                  )
                }
                disabled={clearCredential.isPending}
                data-testid={`button-clear-${integration.key}`}
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>
        )}
        {integration.configuredVia === "environment" && (
          <p className="text-xs text-muted-foreground">Configured via environment secret.</p>
        )}

        {integration.key === "gmail" && (
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Use Gmail for sending & replies</p>
              {!integration.configured && !integration.disabled ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Not connected yet — ask the assistant to connect the Gmail integration.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Turn off to pause sending/reading mail without disconnecting the account.
                </p>
              )}
            </div>
            <Switch
              checked={integration.configured && !integration.disabled}
              disabled={!integration.configured || setGmailDisabled.isPending}
              onCheckedChange={(checked) =>
                setGmailDisabled.mutate(
                  { data: { disabled: !checked } },
                  {
                    onSuccess: () => {
                      invalidate();
                      toast({ title: checked ? "Gmail enabled" : "Gmail disabled" });
                    },
                  },
                )
              }
              data-testid="switch-gmail-enabled"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
          Every external service that can power your outreach. Connect or update API keys
          directly here — no need to leave the app.
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
                <IntegrationCard key={integration.key} integration={integration} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
