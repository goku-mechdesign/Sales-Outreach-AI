import { useState } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import type { ReplyCategory } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

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
  const [loaded, setLoaded] = useState(false);

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
    });
    setAutoReplyEnabled(settings.autoReplyEnabled ?? false);
    setAutoReplyHoldHotLeads(settings.autoReplyHoldHotLeads ?? true);
    setNotifyOnAutoReply(settings.notifyOnAutoReply ?? true);
    setAutoReplyCategories(settings.autoReplyCategories ?? []);
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

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateSettings.isPending} data-testid="button-save-settings">
          {updateSettings.isPending ? "Saving..." : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
