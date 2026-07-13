import { useState } from "react";
import { useGetSettings, useUpdateSettings, useListCampaigns } from "@workspace/api-client-react";
import type { ReplyCategory, AutoDiscoveryCadence } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const CADENCE_OPTIONS: { value: AutoDiscoveryCadence; label: string }[] = [
  { value: "manual", label: "Off (manual only)" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

const REPLY_CATEGORY_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "need_more_info", label: "Requests for more info", hint: "Basic questions about the product/service" },
  { value: "pricing", label: "Pricing questions", hint: "Asks about cost, plans, or quotes" },
  { value: "meeting_request", label: "Meeting requests", hint: "Wants to book a call or demo" },
  { value: "interested", label: "General interest", hint: "Positive reply without a specific ask" },
  { value: "not_interested", label: "Not interested", hint: "Polite decline acknowledgment" },
  { value: "wrong_contact", label: "Wrong contact", hint: "Asks to be forwarded to someone else" },
  { value: "out_of_office", label: "Out of office", hint: "Automated OOO replies" },
  { value: "spam", label: "Spam", hint: "Irrelevant / junk replies" },
];

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings();
  const { toast } = useToast();
  const [form, setForm] = useState<Record<string, string>>({});
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplyHoldHotLeads, setAutoReplyHoldHotLeads] = useState(true);
  const [notifyOnAutoReply, setNotifyOnAutoReply] = useState(true);
  const [autoReplyCategories, setAutoReplyCategories] = useState<ReplyCategory[]>([]);
  const [autoDiscoveryEnabled, setAutoDiscoveryEnabled] = useState(false);
  const [autoDiscoveryCadence, setAutoDiscoveryCadence] = useState<AutoDiscoveryCadence>("manual");
  const [autoEnrollCampaignId, setAutoEnrollCampaignId] = useState<string>("none");
  const [loaded, setLoaded] = useState(false);
  const { data: campaigns } = useListCampaigns();

  if (settings && !loaded) {
    setForm({
      companyName: settings.companyName ?? "",
      companyDescription: settings.companyDescription ?? "",
      products: settings.products ?? "",
      services: settings.services ?? "",
      emailSignature: settings.emailSignature ?? "",
      notificationEmail: settings.notificationEmail ?? "",
      maxEmailsPerDay: String(settings.maxEmailsPerDay ?? 50),
      followupDays: (settings.followupDays ?? []).join(", "),
      autoDiscoveryTargetCount: String(settings.autoDiscoveryTargetCount ?? 25),
      autoDiscoveryIndustry: settings.autoDiscoveryIndustry ?? "",
      autoDiscoveryCountry: settings.autoDiscoveryCountry ?? "",
      autoDiscoveryCity: settings.autoDiscoveryCity ?? "",
      autoDiscoveryKeywords: settings.autoDiscoveryKeywords ?? "",
      autoDiscoveryCompanySize: settings.autoDiscoveryCompanySize ?? "",
      sendPacingSeconds: String(settings.sendPacingSeconds ?? 20),
    });
    setAutoReplyEnabled(settings.autoReplyEnabled ?? false);
    setAutoReplyHoldHotLeads(settings.autoReplyHoldHotLeads ?? true);
    setNotifyOnAutoReply(settings.notifyOnAutoReply ?? true);
    setAutoReplyCategories(settings.autoReplyCategories ?? []);
    setAutoDiscoveryEnabled(settings.autoDiscoveryEnabled ?? false);
    setAutoDiscoveryCadence(settings.autoDiscoveryCadence ?? "manual");
    setAutoEnrollCampaignId(
      settings.autoEnrollCampaignId != null ? String(settings.autoEnrollCampaignId) : "none",
    );
    setLoaded(true);
  }

  const toggleCategory = (value: ReplyCategory) => {
    setAutoReplyCategories((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value],
    );
  };

  const updateSettings = useUpdateSettings({
    mutation: {
      onSuccess: () => toast({ title: "Settings saved" }),
      onError: () => toast({ title: "Couldn't save settings", variant: "destructive" }),
    },
  });

  const handleSave = () => {
    const followupDays = form.followupDays
      .split(",")
      .map((d) => Number(d.trim()))
      .filter((n) => !Number.isNaN(n));

    updateSettings.mutate({
      data: {
        companyName: form.companyName,
        companyDescription: form.companyDescription,
        products: form.products,
        services: form.services,
        emailSignature: form.emailSignature,
        notificationEmail: form.notificationEmail || undefined,
        maxEmailsPerDay: Number(form.maxEmailsPerDay) || 50,
        followupDays,
        autoReplyEnabled,
        autoReplyHoldHotLeads,
        notifyOnAutoReply,
        autoReplyCategories,
        autoDiscoveryEnabled,
        autoDiscoveryCadence,
        autoDiscoveryTargetCount: Number(form.autoDiscoveryTargetCount) || 25,
        autoDiscoveryIndustry: form.autoDiscoveryIndustry || undefined,
        autoDiscoveryCountry: form.autoDiscoveryCountry || undefined,
        autoDiscoveryCity: form.autoDiscoveryCity || undefined,
        autoDiscoveryKeywords: form.autoDiscoveryKeywords || undefined,
        autoDiscoveryCompanySize: form.autoDiscoveryCompanySize || undefined,
        autoEnrollCampaignId: autoEnrollCampaignId === "none" ? null : Number(autoEnrollCampaignId),
        sendPacingSeconds: Number(form.sendPacingSeconds) || 20,
      },
    });
  };

  if (isLoading || !loaded) {
    return <div className="text-sm text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          The context the AI uses to write on your behalf, and your outreach limits.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="companyName">Company name</Label>
            <Input id="companyName" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} data-testid="input-company-name" />
          </div>
          <div>
            <Label htmlFor="companyDescription">Company description</Label>
            <Textarea id="companyDescription" rows={3} value={form.companyDescription} onChange={(e) => setForm({ ...form, companyDescription: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="products">Products</Label>
            <Input id="products" value={form.products} onChange={(e) => setForm({ ...form, products: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="services">Services</Label>
            <Input id="services" value={form.services} onChange={(e) => setForm({ ...form, services: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="emailSignature">Email signature</Label>
            <Textarea id="emailSignature" rows={3} value={form.emailSignature} onChange={(e) => setForm({ ...form, emailSignature: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Outreach behavior</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="notificationEmail">Notification email</Label>
            <Input id="notificationEmail" value={form.notificationEmail} onChange={(e) => setForm({ ...form, notificationEmail: e.target.value })} data-testid="input-notification-email" />
          </div>
          <div>
            <Label htmlFor="maxEmailsPerDay">Max emails per day</Label>
            <Input id="maxEmailsPerDay" type="number" min={1} max={500} value={form.maxEmailsPerDay} onChange={(e) => setForm({ ...form, maxEmailsPerDay: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="followupDays">Follow-up schedule (days after send, comma separated)</Label>
            <Input id="followupDays" placeholder="3, 7, 14" value={form.followupDays} onChange={(e) => setForm({ ...form, followupDays: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agent autonomy</CardTitle>
          <p className="text-sm text-muted-foreground">
            Control how much of your pipeline the agent runs on its own. Categories not selected below still get an
            AI-drafted reply, but it waits in your inbox for you to approve and send.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <Label htmlFor="autoReplyEnabled">Let the agent auto-send replies</Label>
              <p className="text-xs text-muted-foreground">Master switch. Off means every reply always waits for you.</p>
            </div>
            <Switch id="autoReplyEnabled" checked={autoReplyEnabled} onCheckedChange={setAutoReplyEnabled} data-testid="switch-auto-reply-enabled" />
          </div>

          <div className={autoReplyEnabled ? "space-y-3" : "space-y-3 opacity-50 pointer-events-none"}>
            <Label>Auto-send without review for:</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {REPLY_CATEGORY_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-start gap-2 rounded-md border p-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={autoReplyCategories.includes(opt.value as ReplyCategory)}
                    onCheckedChange={() => toggleCategory(opt.value as ReplyCategory)}
                    data-testid={`checkbox-category-${opt.value}`}
                  />
                  <span>
                    <span className="font-medium">{opt.label}</span>
                    <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <Label htmlFor="autoReplyHoldHotLeads">Always hold hot leads for my review</Label>
              <p className="text-xs text-muted-foreground">
                Overrides the categories above -- a reply flagged hot never sends without you.
              </p>
            </div>
            <Switch
              id="autoReplyHoldHotLeads"
              checked={autoReplyHoldHotLeads}
              onCheckedChange={setAutoReplyHoldHotLeads}
              data-testid="switch-hold-hot-leads"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <Label htmlFor="notifyOnAutoReply">Notify me when the agent auto-sends</Label>
              <p className="text-xs text-muted-foreground">Get a notification every time a reply goes out without your review.</p>
            </div>
            <Switch
              id="notifyOnAutoReply"
              checked={notifyOnAutoReply}
              onCheckedChange={setNotifyOnAutoReply}
              data-testid="switch-notify-auto-reply"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Autonomous discovery</CardTitle>
          <p className="text-sm text-muted-foreground">
            Let the agent search for new prospects on a schedule instead of clicking "Discover" yourself,
            and automatically enroll them into one ongoing campaign.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <Label htmlFor="autoDiscoveryEnabled">Automatically find new prospects</Label>
              <p className="text-xs text-muted-foreground">
                Master switch for scheduled discovery runs.
              </p>
            </div>
            <Switch
              id="autoDiscoveryEnabled"
              checked={autoDiscoveryEnabled}
              onCheckedChange={setAutoDiscoveryEnabled}
              data-testid="switch-auto-discovery-enabled"
            />
          </div>

          <div className={autoDiscoveryEnabled ? "space-y-4" : "space-y-4 opacity-50 pointer-events-none"}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="autoDiscoveryCadence">How often</Label>
                <Select
                  value={autoDiscoveryCadence}
                  onValueChange={(v) => setAutoDiscoveryCadence(v as AutoDiscoveryCadence)}
                >
                  <SelectTrigger id="autoDiscoveryCadence" data-testid="select-discovery-cadence">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CADENCE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="autoDiscoveryTargetCount">Prospects per run</Label>
                <Input
                  id="autoDiscoveryTargetCount"
                  type="number"
                  min={1}
                  max={100}
                  value={form.autoDiscoveryTargetCount}
                  onChange={(e) => setForm({ ...form, autoDiscoveryTargetCount: e.target.value })}
                  data-testid="input-discovery-target-count"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="autoDiscoveryIndustry">Industry</Label>
                <Input
                  id="autoDiscoveryIndustry"
                  placeholder="e.g. SaaS"
                  value={form.autoDiscoveryIndustry}
                  onChange={(e) => setForm({ ...form, autoDiscoveryIndustry: e.target.value })}
                  data-testid="input-discovery-industry"
                />
              </div>
              <div>
                <Label htmlFor="autoDiscoveryCountry">Country</Label>
                <Input
                  id="autoDiscoveryCountry"
                  placeholder="e.g. United States"
                  value={form.autoDiscoveryCountry}
                  onChange={(e) => setForm({ ...form, autoDiscoveryCountry: e.target.value })}
                  data-testid="input-discovery-country"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="autoDiscoveryCity">City (optional)</Label>
                <Input
                  id="autoDiscoveryCity"
                  value={form.autoDiscoveryCity}
                  onChange={(e) => setForm({ ...form, autoDiscoveryCity: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="autoDiscoveryCompanySize">Company size (optional)</Label>
                <Input
                  id="autoDiscoveryCompanySize"
                  placeholder="e.g. 11-50"
                  value={form.autoDiscoveryCompanySize}
                  onChange={(e) => setForm({ ...form, autoDiscoveryCompanySize: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="autoDiscoveryKeywords">Keywords (optional)</Label>
              <Input
                id="autoDiscoveryKeywords"
                placeholder="e.g. e-commerce, logistics"
                value={form.autoDiscoveryKeywords}
                onChange={(e) => setForm({ ...form, autoDiscoveryKeywords: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="autoEnrollCampaignId">Always-on campaign</Label>
              <p className="text-xs text-muted-foreground mb-1">
                Newly discovered prospects are added here automatically. The agent only sends once you've
                approved that campaign's template.
              </p>
              <Select value={autoEnrollCampaignId} onValueChange={setAutoEnrollCampaignId}>
                <SelectTrigger id="autoEnrollCampaignId" data-testid="select-always-on-campaign">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None &mdash; don't auto-enroll</SelectItem>
                  {(campaigns ?? []).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="sendPacingSeconds">Seconds between autonomous sends</Label>
              <p className="text-xs text-muted-foreground mb-1">
                Spaces out automatic sends so they don't look like a burst to mail providers, protecting your
                sending reputation.
              </p>
              <Input
                id="sendPacingSeconds"
                type="number"
                min={0}
                max={600}
                value={form.sendPacingSeconds}
                onChange={(e) => setForm({ ...form, sendPacingSeconds: e.target.value })}
                data-testid="input-send-pacing-seconds"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateSettings.isPending} data-testid="button-save-settings">
          {updateSettings.isPending ? "Saving..." : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
