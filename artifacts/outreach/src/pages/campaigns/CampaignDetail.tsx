import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetCampaign,
  useUpdateCampaign,
  useGenerateCampaignEmail,
  useSendTestEmail,
  useSendCampaign,
  useScheduleCampaign,
  getGetCampaignQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Sparkles, Send, FlaskConical, CalendarClock } from "lucide-react";
import type { CampaignProspectStatus } from "@workspace/api-client-react";

const prospectStatusVariant: Record<CampaignProspectStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  sent: "secondary",
  replied: "default",
  bounced: "destructive",
  stopped: "destructive",
};

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const campaignId = Number(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: campaign, isLoading } = useGetCampaign(campaignId);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loadedFor, setLoadedFor] = useState<number | null>(null);

  if (campaign && loadedFor !== campaign.id) {
    setSubject(campaign.subject ?? "");
    setBody(campaign.body ?? "");
    setLoadedFor(campaign.id);
  }

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });

  const updateCampaign = useUpdateCampaign({
    mutation: { onSuccess: () => { invalidate(); toast({ title: "Template saved" }); } },
  });
  const generateEmail = useGenerateCampaignEmail({
    mutation: {
      onSuccess: (c) => {
        setSubject(c.subject ?? "");
        setBody(c.body ?? "");
        invalidate();
        toast({ title: "AI draft generated" });
      },
      onError: () => toast({ title: "Generation failed", variant: "destructive" }),
    },
  });
  const sendTest = useSendTestEmail({
    mutation: {
      onSuccess: (result) =>
        toast({
          title: result.success ? "Test email sent" : "Couldn't send test",
          description: result.message,
          variant: result.success ? "default" : "destructive",
        }),
    },
  });
  const sendCampaign = useSendCampaign({
    mutation: {
      onSuccess: (result) => {
        invalidate();
        toast({
          title: "Campaign send finished",
          description: `${result.sent} sent, ${result.failed} failed, ${result.queued} queued for later.`,
        });
      },
      onError: () => toast({ title: "Send failed", variant: "destructive" }),
    },
  });
  const scheduleCampaign = useScheduleCampaign({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Campaign scheduled" }); },
    },
  });

  if (isLoading || !campaign) {
    return <div className="text-sm text-muted-foreground">Loading campaign...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => setLocation("/campaigns")} data-testid="button-back-campaigns">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Campaigns
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{campaign.name}</h1>
            <Badge variant="secondary" className="capitalize">{campaign.status}</Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">{campaign.goal}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => sendTest.mutate({ id: campaignId })} disabled={sendTest.isPending} data-testid="button-send-test">
            <FlaskConical className="h-4 w-4 mr-2" />
            Send test to me
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const inOneHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
              scheduleCampaign.mutate({ id: campaignId, data: { scheduledAt: inOneHour } });
            }}
            disabled={scheduleCampaign.isPending}
            data-testid="button-schedule"
          >
            <CalendarClock className="h-4 w-4 mr-2" />
            Schedule
          </Button>
          <Button onClick={() => sendCampaign.mutate({ id: campaignId })} disabled={sendCampaign.isPending} data-testid="button-send-campaign">
            <Send className="h-4 w-4 mr-2" />
            {sendCampaign.isPending ? "Sending..." : "Send now"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Email template</CardTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => generateEmail.mutate({ id: campaignId })}
            disabled={generateEmail.isPending}
            data-testid="button-generate-email"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {generateEmail.isPending ? "Writing..." : campaign.subject ? "Regenerate with AI" : "Generate with AI"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Use <code className="text-foreground">{"{{contactName}}"}</code> and{" "}
            <code className="text-foreground">{"{{companyName}}"}</code> as merge tokens &mdash; they're
            automatically replaced with each recipient's details when the campaign sends.
          </p>
          <div>
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="input-subject" />
          </div>
          <div>
            <Label htmlFor="body">Body</Label>
            <Textarea id="body" rows={10} value={body} onChange={(e) => setBody(e.target.value)} data-testid="textarea-body" />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateCampaign.mutate({ id: campaignId, data: { subject, body } })}
              disabled={updateCampaign.isPending}
              data-testid="button-save-template"
            >
              Save template
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prospects ({campaign.prospects.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Follow-up stage</TableHead>
                <TableHead>Last email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaign.prospects.map((cp) => (
                <TableRow key={cp.id} data-testid={`row-campaign-prospect-${cp.id}`}>
                  <TableCell className="font-medium">{cp.companyName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{cp.contactEmail || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={prospectStatusVariant[cp.status]} className="capitalize">
                      {cp.status}
                    </Badge>
                    {cp.stoppedReason && (
                      <div className="text-xs text-muted-foreground mt-1">{cp.stoppedReason}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{cp.followupStage}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {cp.lastEmailAt ? new Date(cp.lastEmailAt).toLocaleString() : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
