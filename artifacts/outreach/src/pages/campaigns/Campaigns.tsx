import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListCampaigns,
  useCreateCampaign,
  useListProspects,
  getListCampaignsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Send } from "lucide-react";
import type { CampaignStatus } from "@workspace/api-client-react";

const statusVariant: Record<CampaignStatus, "default" | "secondary" | "outline"> = {
  draft: "outline",
  scheduled: "secondary",
  sending: "secondary",
  sent: "default",
  completed: "default",
};

export default function Campaigns() {
  const [, setLocation] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const { data: campaigns, isLoading } = useListCampaigns();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createCampaign = useCreateCampaign({
    mutation: {
      onSuccess: (campaign) => {
        queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
        setCreateOpen(false);
        const skipped = campaign.skippedDuplicateCount ?? 0;
        toast({
          title: "Campaign created",
          description:
            skipped > 0
              ? `${skipped} prospect${skipped === 1 ? "" : "s"} skipped — already active in another campaign.`
              : undefined,
        });
        setLocation(`/campaigns/${campaign.id}`);
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Outreach sequences with an AI-generated template and per-prospect send tracking.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-campaign">
              <Plus className="h-4 w-4 mr-2" />
              New campaign
            </Button>
          </DialogTrigger>
          <CreateCampaignDialog
            onSubmit={(input) => createCampaign.mutate({ data: input })}
            isPending={createCampaign.isPending}
          />
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading campaigns...</div>
      ) : !campaigns || campaigns.length === 0 ? (
        <Card>
          <CardContent className="p-12 flex flex-col items-center text-center text-muted-foreground">
            <Send className="h-10 w-10 mb-3 opacity-30" />
            <p className="font-medium text-foreground">No campaigns yet</p>
            <p className="text-sm mt-1">Create one to start writing and sending outreach emails.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c) => (
            <Card
              key={c.id}
              className="cursor-pointer hover-elevate transition-colors"
              onClick={() => setLocation(`/campaigns/${c.id}`)}
              data-testid={`card-campaign-${c.id}`}
            >
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-tight">{c.name}</h3>
                  <Badge variant={statusVariant[c.status]} className="capitalize shrink-0">
                    {c.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{c.goal}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border">
                  <span>{c.prospectCount} prospects</span>
                  <span>{c.sentCount} sent</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateCampaignDialog({
  onSubmit,
  isPending,
}: {
  onSubmit: (input: {
    name: string;
    goal: string;
    tone: string;
    productDescription: string;
    targetAudience: string;
    cta: string;
    prospectIds: number[];
  }) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    name: "",
    goal: "",
    tone: "friendly and direct",
    productDescription: "",
    targetAudience: "",
    cta: "",
  });
  const [prospectIds, setProspectIds] = useState<number[]>([]);
  const { data: prospectsData } = useListProspects({ pageSize: 100 });
  const prospects = prospectsData?.items ?? [];

  const toggle = (id: number, checked: boolean) => {
    setProspectIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  const valid =
    form.name && form.goal && form.productDescription && form.targetAudience && form.cta && prospectIds.length > 0;

  return (
    <DialogContent className="max-w-lg" data-testid="dialog-create-campaign">
      <DialogHeader>
        <DialogTitle>New campaign</DialogTitle>
      </DialogHeader>
      <ScrollArea className="max-h-[60vh] pr-2">
        <div className="space-y-3">
          <div>
            <Label htmlFor="camp-name">Campaign name</Label>
            <Input id="camp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-campaign-name" />
          </div>
          <div>
            <Label htmlFor="camp-goal">Goal</Label>
            <Input
              id="camp-goal"
              placeholder="e.g. Book intro calls with founders"
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="camp-product">What you offer</Label>
            <Textarea
              id="camp-product"
              value={form.productDescription}
              onChange={(e) => setForm({ ...form, productDescription: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="camp-audience">Target audience</Label>
            <Input
              id="camp-audience"
              value={form.targetAudience}
              onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="camp-tone">Tone</Label>
              <Input id="camp-tone" value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="camp-cta">Call to action</Label>
              <Input id="camp-cta" value={form.cta} onChange={(e) => setForm({ ...form, cta: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Prospects to include ({prospectIds.length} selected)</Label>
            <div className="border border-border rounded-md mt-1 max-h-44 overflow-y-auto">
              {prospects.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No prospects yet — add some first.</p>
              ) : (
                prospects.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover-elevate cursor-pointer"
                  >
                    <Checkbox
                      checked={prospectIds.includes(p.id)}
                      onCheckedChange={(c) => toggle(p.id, !!c)}
                      data-testid={`checkbox-campaign-prospect-${p.id}`}
                    />
                    {p.companyName}
                    <span className="text-xs text-muted-foreground ml-auto">{p.email || "no email"}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
      <DialogFooter>
        <Button disabled={!valid || isPending} onClick={() => onSubmit({ ...form, prospectIds })} data-testid="button-submit-campaign">
          Create campaign
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
