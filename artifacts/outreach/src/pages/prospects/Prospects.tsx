import { useState } from "react";
import {
  useListProspects,
  useCreateProspect,
  useDiscoverProspects,
  useBulkUpdateProspectStatus,
  useUpdateProspect,
  useDeleteProspect,
  getListProspectsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Prospect, ProspectStatus } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Sparkles, Trash2, Search, Users, BellOff, Bell, ArrowUpDown } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ProspectDetailDialog,
  statusOptions,
  statusVariant,
  leadScoreTier,
  leadScoreBadgeClass,
} from "@/components/prospects/ProspectDetailDialog";

export default function Prospects() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | "all">("all");
  const [selected, setSelected] = useState<number[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [sortByScore, setSortByScore] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data, isLoading } = useListProspects({
    search: search || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    pageSize: 100,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListProspectsQueryKey() });

  const createProspect = useCreateProspect({
    mutation: {
      onSuccess: () => {
        invalidate();
        setAddOpen(false);
        toast({ title: "Prospect added" });
      },
    },
  });

  const discoverProspects = useDiscoverProspects({
    mutation: {
      onSuccess: (result) => {
        invalidate();
        setDiscoverOpen(false);
        toast({
          title: `Discovery finished`,
          description: `${result.created.length} new prospects added${
            result.duplicatesSkipped ? `, ${result.duplicatesSkipped} duplicates skipped` : ""
          }. Providers used: ${result.providersUsed.join(", ") || "none"}.${
            result.providersSkipped.length
              ? ` Skipped (not configured): ${result.providersSkipped.join(", ")}.`
              : ""
          }`,
        });
      },
      onError: () => {
        toast({ title: "Discovery failed", variant: "destructive" });
      },
    },
  });

  const bulkUpdate = useBulkUpdateProspectStatus({
    mutation: {
      onSuccess: () => {
        invalidate();
        setSelected([]);
        toast({ title: "Prospects updated" });
      },
    },
  });

  const updateProspect = useUpdateProspect({
    mutation: { onSuccess: () => invalidate() },
  });

  const deleteProspect = useDeleteProspect({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Prospect deleted" });
      },
    },
  });

  const items: Prospect[] = data?.items ?? [];
  const sortedItems = sortByScore ? [...items].sort((a, b) => b.leadScore - a.leadScore) : items;

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? items.map((p) => p.id) : []);
  };

  const toggleOne = (id: number, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Prospects</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Companies you can reach out to, sourced manually or via AI discovery.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={discoverOpen} onOpenChange={setDiscoverOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-discover">
                <Sparkles className="h-4 w-4 mr-2" />
                AI Discovery
              </Button>
            </DialogTrigger>
            <DiscoverDialog
              onSubmit={(input) => discoverProspects.mutate({ data: input })}
              isPending={discoverProspects.isPending}
            />
          </Dialog>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-prospect">
                <Plus className="h-4 w-4 mr-2" />
                Add prospect
              </Button>
            </DialogTrigger>
            <AddProspectDialog
              onSubmit={(input) => createProspect.mutate({ data: input })}
              isPending={createProspect.isPending}
            />
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search companies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            data-testid="input-search-prospects"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ProspectStatus | "all")}>
          <SelectTrigger className="w-44" data-testid="select-status-filter">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statusOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selected.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground">{selected.length} selected</span>
            <Select
              onValueChange={(status) =>
                bulkUpdate.mutate({ data: { ids: selected, status: status as ProspectStatus } })
              }
            >
              <SelectTrigger className="w-48" data-testid="select-bulk-status">
                <SelectValue placeholder="Set status..." />
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
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading prospects...</div>
          ) : items.length === 0 ? (
            <div className="p-12 flex flex-col items-center text-center text-muted-foreground">
              <Users className="h-10 w-10 mb-3 opacity-30" />
              <p className="font-medium text-foreground">No prospects yet</p>
              <p className="text-sm mt-1">Add one manually or run AI discovery to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selected.length === items.length}
                      onCheckedChange={(c) => toggleAll(!!c)}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() => setSortByScore((v) => !v)}
                      data-testid="button-sort-score"
                    >
                      Score
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedItems.map((p) => {
                  const isSuppressed = !!p.unsubscribedAt;
                  const isBounced = !!p.bouncedAt;
                  return (
                  <TableRow key={p.id} data-testid={`row-prospect-${p.id}`}>
                    <TableCell>
                      <Checkbox
                        checked={selected.includes(p.id)}
                        onCheckedChange={(c) => toggleOne(p.id, !!c)}
                        data-testid={`checkbox-prospect-${p.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="font-medium hover:underline text-left"
                        onClick={() => setDetailId(p.id)}
                        data-testid={`button-open-detail-${p.id}`}
                      >
                        {p.companyName}
                      </button>
                      <div className="text-xs text-muted-foreground">
                        {p.industry || "—"}
                        {p.website ? ` · ${p.website.replace(/^https?:\/\//, "")}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{p.contactName || "—"}</div>
                      <div className="text-xs text-muted-foreground">{p.email || "No email on file"}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {[p.city, p.country].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground capitalize">{p.source}</span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${leadScoreBadgeClass[leadScoreTier(p.leadScore)]}`}
                        data-testid={`badge-lead-score-${p.id}`}
                      >
                        {p.leadScore} · {leadScoreTier(p.leadScore)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {isBounced ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="destructive" data-testid={`badge-bounced-${p.id}`}>
                              Bounced
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>{p.bounceReason || "Email address bounced"}</TooltipContent>
                        </Tooltip>
                      ) : isSuppressed ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="destructive" data-testid={`badge-suppressed-${p.id}`}>
                              Suppressed
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>{p.unsubscribeReason || "Unsubscribed"}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Select
                          value={p.status}
                          onValueChange={(status) =>
                            updateProspect.mutate({ id: p.id, data: { status: status as ProspectStatus } })
                          }
                        >
                          <SelectTrigger className="w-36 h-8" data-testid={`select-status-${p.id}`}>
                            <SelectValue>
                              <Badge variant={statusVariant[p.status]} className="capitalize">
                                {p.status.replace(/_/g, " ")}
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
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() =>
                                updateProspect.mutate({
                                  id: p.id,
                                  data: isSuppressed
                                    ? { unsubscribedAt: null, unsubscribeReason: null }
                                    : {
                                        unsubscribedAt: new Date().toISOString(),
                                        unsubscribeReason: "Manually suppressed",
                                      },
                                })
                              }
                              data-testid={`button-toggle-suppress-${p.id}`}
                            >
                              {isSuppressed ? (
                                <Bell className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <BellOff className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {isSuppressed ? "Re-enable outreach" : "Suppress from outreach"}
                          </TooltipContent>
                        </Tooltip>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => deleteProspect.mutate({ id: p.id })}
                          data-testid={`button-delete-prospect-${p.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ProspectDetailDialog
        prospect={items.find((p) => p.id === detailId) ?? null}
        open={detailId !== null}
        onOpenChange={(open) => !open && setDetailId(null)}
        onUpdate={(id, data) => updateProspect.mutate({ id, data })}
        onDelete={(id) => {
          deleteProspect.mutate({ id });
          setDetailId(null);
        }}
      />
    </div>
  );
}

function AddProspectDialog({
  onSubmit,
  isPending,
}: {
  onSubmit: (input: {
    companyName: string;
    website?: string;
    industry?: string;
    country?: string;
    city?: string;
    email?: string;
    contactName?: string;
  }) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    companyName: "",
    website: "",
    industry: "",
    country: "",
    city: "",
    email: "",
    contactName: "",
  });

  return (
    <DialogContent data-testid="dialog-add-prospect">
      <DialogHeader>
        <DialogTitle>Add a prospect</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label htmlFor="companyName">Company name</Label>
          <Input
            id="companyName"
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            data-testid="input-company-name"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="contactName">Contact name</Label>
            <Input
              id="contactName"
              value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="industry">Industry</Label>
            <Input
              id="industry"
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="website">Website</Label>
            <Input id="website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="city">City</Label>
            <Input id="city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="country">Country</Label>
            <Input id="country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!form.companyName || isPending}
          onClick={() =>
            onSubmit({
              companyName: form.companyName,
              website: form.website || undefined,
              industry: form.industry || undefined,
              country: form.country || undefined,
              city: form.city || undefined,
              email: form.email || undefined,
              contactName: form.contactName || undefined,
            })
          }
          data-testid="button-submit-add-prospect"
        >
          Add prospect
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function DiscoverDialog({
  onSubmit,
  isPending,
}: {
  onSubmit: (input: {
    industry: string;
    country: string;
    city?: string;
    keywords?: string;
    companySize?: string;
    count: number;
  }) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    industry: "",
    country: "",
    city: "",
    keywords: "",
    companySize: "",
    count: 10,
  });

  return (
    <DialogContent data-testid="dialog-discover">
      <DialogHeader>
        <DialogTitle>AI prospect discovery</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">
        Runs across your configured discovery providers (Apollo) and skips
        any that aren't connected yet.
      </p>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="disc-industry">Industry</Label>
            <Input
              id="disc-industry"
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              data-testid="input-discover-industry"
            />
          </div>
          <div>
            <Label htmlFor="disc-country">Country</Label>
            <Input
              id="disc-country"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              data-testid="input-discover-country"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="disc-city">City (optional)</Label>
            <Input id="disc-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="disc-size">Company size (optional)</Label>
            <Input
              id="disc-size"
              value={form.companySize}
              onChange={(e) => setForm({ ...form, companySize: e.target.value })}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="disc-keywords">Keywords (optional)</Label>
          <Input
            id="disc-keywords"
            value={form.keywords}
            onChange={(e) => setForm({ ...form, keywords: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="disc-count">How many prospects</Label>
          <Input
            id="disc-count"
            type="number"
            min={1}
            max={50}
            value={form.count}
            onChange={(e) => setForm({ ...form, count: Number(e.target.value) })}
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!form.industry || !form.country || isPending}
          onClick={() =>
            onSubmit({
              industry: form.industry,
              country: form.country,
              city: form.city || undefined,
              keywords: form.keywords || undefined,
              companySize: form.companySize || undefined,
              count: form.count,
            })
          }
          data-testid="button-submit-discover"
        >
          {isPending ? "Discovering..." : "Run discovery"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
