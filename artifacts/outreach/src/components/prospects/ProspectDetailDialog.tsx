import type { Prospect, ProspectStatus } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell, BellOff, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";

export const statusOptions: ProspectStatus[] = [
  "new",
  "approved",
  "rejected",
  "contacted",
  "replied",
  "hot",
  "not_interested",
  "bounced",
];

export const statusVariant: Record<
  ProspectStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  new: "outline",
  approved: "secondary",
  rejected: "destructive",
  contacted: "secondary",
  replied: "default",
  hot: "default",
  not_interested: "destructive",
  bounced: "destructive",
};

export function leadScoreTier(score: number): "High" | "Medium" | "Low" {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

export const leadScoreBadgeClass: Record<"High" | "Medium" | "Low", string> = {
  High: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  Medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  Low: "bg-muted text-muted-foreground",
};

/**
 * Single shared prospect detail/edit surface -- opened from a table row in
 * Prospects or a card in the Pipeline board, so both views edit a prospect
 * the same way instead of maintaining two detail UIs.
 */
export function ProspectDetailDialog({
  prospect,
  open,
  onOpenChange,
  onUpdate,
  onDelete,
}: {
  prospect: Prospect | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: number, data: Record<string, unknown>) => void;
  onDelete: (id: number) => void;
}) {
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setNotes(prospect?.notes ?? "");
  }, [prospect?.id, prospect?.notes]);

  if (!prospect) return null;

  const isSuppressed = !!prospect.unsubscribedAt;
  const isBounced = !!prospect.bouncedAt;
  const tier = leadScoreTier(prospect.leadScore);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-prospect-detail">
        <DialogHeader>
          <DialogTitle>{prospect.companyName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${leadScoreBadgeClass[tier]}`}
              data-testid="badge-detail-lead-score"
            >
              {prospect.leadScore} · {tier}
            </span>
            {isBounced && <Badge variant="destructive">Bounced</Badge>}
            {isSuppressed && <Badge variant="destructive">Suppressed</Badge>}
            <span className="text-xs text-muted-foreground capitalize">{prospect.source}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Contact</div>
              <div>{prospect.contactName || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Email</div>
              <div className="truncate">{prospect.email || "No email on file"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Industry</div>
              <div>{prospect.industry || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Location</div>
              <div>{[prospect.city, prospect.country].filter(Boolean).join(", ") || "—"}</div>
            </div>
            {prospect.website && (
              <div className="col-span-2">
                <div className="text-muted-foreground text-xs">Website</div>
                <div className="truncate">{prospect.website}</div>
              </div>
            )}
          </div>

          {!isSuppressed && !isBounced && (
            <div>
              <Label>Status</Label>
              <Select
                value={prospect.status}
                onValueChange={(status) => onUpdate(prospect.id, { status })}
              >
                <SelectTrigger className="w-full mt-1" data-testid="select-detail-status">
                  <SelectValue>
                    <Badge variant={statusVariant[prospect.status]} className="capitalize">
                      {prospect.status.replace(/_/g, " ")}
                    </Badge>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="detail-notes">Notes</Label>
            <Textarea
              id="detail-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (prospect.notes ?? "")) onUpdate(prospect.id, { notes });
              }}
              className="mt-1"
              rows={3}
              data-testid="textarea-detail-notes"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onUpdate(
                  prospect.id,
                  isSuppressed
                    ? { unsubscribedAt: null, unsubscribeReason: null }
                    : { unsubscribedAt: new Date().toISOString(), unsubscribeReason: "Manually suppressed" },
                )
              }
              data-testid="button-detail-toggle-suppress"
            >
              {isSuppressed ? (
                <>
                  <Bell className="h-4 w-4 mr-2" /> Re-enable outreach
                </>
              ) : (
                <>
                  <BellOff className="h-4 w-4 mr-2" /> Suppress from outreach
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                onDelete(prospect.id);
                onOpenChange(false);
              }}
              data-testid="button-detail-delete"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
