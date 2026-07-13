import { useState } from "react";
import { useListAiActivity } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Activity, CheckCircle2, XCircle, User, Megaphone } from "lucide-react";
import type { AiActivity as AiActivityEntry, AiActivityKind, AiActivityStatus } from "@workspace/api-client-react";

const kindLabel: Record<AiActivityKind, string> = {
  language_detection: "Language detection",
  email_generation: "Email generation",
  reply_classification: "Reply classification",
  reply_draft: "Reply draft",
  followup_generation: "Follow-up generation",
};

export default function AiActivity() {
  const [kind, setKind] = useState<AiActivityKind | "all">("all");
  const [status, setStatus] = useState<AiActivityStatus | "all">("all");
  const [selected, setSelected] = useState<AiActivityEntry | null>(null);

  const { data, isLoading } = useListAiActivity({
    kind: kind === "all" ? undefined : kind,
    status: status === "all" ? undefined : status,
    pageSize: 100,
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Activity</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Every call made to Gemini on your behalf, with token usage and outcome.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Select value={kind} onValueChange={(v) => setKind(v as AiActivityKind | "all")}>
          <SelectTrigger className="w-52" data-testid="select-kind-filter">
            <SelectValue placeholder="All kinds" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            {Object.entries(kindLabel).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as AiActivityStatus | "all")}>
          <SelectTrigger className="w-40" data-testid="select-status-filter">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading activity...</div>
          ) : items.length === 0 ? (
            <div className="p-12 flex flex-col items-center text-center text-muted-foreground">
              <Activity className="h-10 w-10 mb-3 opacity-30" />
              <p className="font-medium text-foreground">No AI activity yet</p>
              <p className="text-sm mt-1">Generate a campaign email or a reply draft to see it logged here.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Preview</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((a) => (
                  <TableRow
                    key={a.id}
                    data-testid={`row-activity-${a.id}`}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelected(a)}
                  >
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(a.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{kindLabel[a.kind]}</Badge>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="text-sm truncate">{a.status === "error" ? a.errorMessage : a.response}</p>
                      {(a.relatedProspectName || a.relatedCampaignName) && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {a.relatedCampaignName ? `Campaign: ${a.relatedCampaignName}` : ""}
                          {a.relatedCampaignName && a.relatedProspectName ? " · " : ""}
                          {a.relatedProspectName ? `To: ${a.relatedProspectName}` : ""}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {(a.promptTokens ?? 0) + (a.completionTokens ?? 0) || "—"}
                    </TableCell>
                    <TableCell>
                      {a.status === "success" ? (
                        <span className="inline-flex items-center gap-1 text-sm text-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Success
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm text-destructive">
                          <XCircle className="h-3.5 w-3.5" /> Error
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge variant="outline">{kindLabel[selected.kind]}</Badge>
                  {selected.status === "success" ? (
                    <span className="inline-flex items-center gap-1 text-sm text-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Success
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sm text-destructive">
                      <XCircle className="h-3.5 w-3.5" /> Error
                    </span>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {new Date(selected.createdAt).toLocaleString()}
                </DialogDescription>
              </DialogHeader>

              {(selected.relatedCampaignName || selected.relatedProspectName) && (
                <div className="flex flex-col gap-1.5 rounded-md border bg-muted/30 p-3 text-sm">
                  {selected.relatedCampaignName && (
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Campaign:</span>
                      <span className="font-medium">{selected.relatedCampaignName}</span>
                    </div>
                  )}
                  {selected.relatedProspectName && (
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Sent to:</span>
                      <span className="font-medium">{selected.relatedProspectName}</span>
                      {selected.relatedProspectEmail && (
                        <span className="text-muted-foreground">
                          &lt;{selected.relatedProspectEmail}&gt;
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Prompt tokens: {selected.promptTokens ?? "—"}</span>
                <span>Completion tokens: {selected.completionTokens ?? "—"}</span>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Prompt sent to AI
                </p>
                <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
                  {selected.prompt}
                </pre>
              </div>

              {selected.status === "success" ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Response
                  </p>
                  <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
                    {selected.response}
                  </pre>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-destructive">
                    Error
                  </p>
                  <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                    {selected.errorMessage}
                  </pre>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
