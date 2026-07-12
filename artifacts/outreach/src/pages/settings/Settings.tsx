import { useState } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings();
  const { toast } = useToast();
  const [form, setForm] = useState<Record<string, string>>({});
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
    setLoaded(true);
  }

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

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateSettings.isPending} data-testid="button-save-settings">
          {updateSettings.isPending ? "Saving..." : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
