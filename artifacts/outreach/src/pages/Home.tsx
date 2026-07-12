import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Send, Inbox, Sparkles, ArrowRight } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const steps = [
  {
    icon: Users,
    title: "Find prospects",
    body: "Discover companies that match your ideal customer profile and pull verified contact emails automatically.",
  },
  {
    icon: Sparkles,
    title: "Write with AI",
    body: "Generate a personalized email template in your voice, with merge tokens filled in per recipient at send time.",
  },
  {
    icon: Send,
    title: "Send campaigns",
    body: "Send through Gmail with a daily cap, then let scheduled follow-ups nudge cold prospects automatically.",
  },
  {
    icon: Inbox,
    title: "Triage replies",
    body: "Every reply is read and classified by AI, with hot leads flagged the moment someone says they're interested.",
  },
];

export default function Home() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={`${basePath}/logo.svg`} alt="Outreach AI" className="h-7 w-7" />
            <span className="font-bold text-lg">Outreach AI</span>
          </div>
          <Button onClick={() => setLocation("/sign-in")} data-testid="button-header-sign-in">
            Sign in
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6">
        <section className="py-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            Built for a one-person outbound desk
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight max-w-3xl mx-auto leading-tight">
            Your entire outbound sales pipeline, run by you and an AI copilot.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
            Outreach AI finds prospects, writes the emails, sends the campaign, and reads the
            replies for you &mdash; so a single founder can run outbound like a full sales team.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button size="lg" onClick={() => setLocation("/sign-in")} data-testid="button-hero-sign-in">
              Sign in to your desk
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-24">
          {steps.map((step) => (
            <Card key={step.title} className="border-border">
              <CardContent className="pt-6">
                <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                  <step.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-1.5">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="max-w-5xl mx-auto px-6 text-sm text-muted-foreground text-center">
          Outreach AI &mdash; a private outbound desk for MechDesign Co.
        </div>
      </footer>
    </div>
  );
}
