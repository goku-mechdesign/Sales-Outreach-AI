import { useMemo, useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  useListProspects,
  useUpdateProspect,
  useDeleteProspect,
  getListProspectsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Prospect, ProspectStatus } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import {
  ProspectDetailDialog,
  statusOptions,
  leadScoreTier,
  leadScoreBadgeClass,
} from "@/components/prospects/ProspectDetailDialog";

const columnLabel: Record<ProspectStatus, string> = {
  new: "New",
  approved: "Approved",
  rejected: "Rejected",
  contacted: "Contacted",
  replied: "Replied",
  hot: "Hot",
  not_interested: "Not interested",
  bounced: "Bounced",
};

export default function Pipeline() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data, isLoading } = useListProspects({ pageSize: 100 });
  const items: Prospect[] = data?.items ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListProspectsQueryKey() });

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

  const columns = useMemo(() => {
    const byStatus = new Map<ProspectStatus, Prospect[]>(
      statusOptions.map((s) => [s, [] as Prospect[]]),
    );
    for (const p of items) {
      byStatus.get(p.status)?.push(p);
    }
    return byStatus;
  }, [items]);

  const detailProspect = items.find((p) => p.id === detailId) ?? null;

  const handleDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }
    const prospectId = Number(draggableId);
    const prospect = items.find((p) => p.id === prospectId);
    // Bounced/suppressed prospects are locked from status changes everywhere
    // else in the app (Prospects table, shared detail dialog) -- mirror that
    // here instead of letting a drag silently create an inconsistent state.
    if (prospect && (prospect.bouncedAt || prospect.unsubscribedAt)) {
      toast({
        title: "Status locked",
        description: prospect.bouncedAt
          ? "This prospect bounced and can't change stage."
          : "This prospect is suppressed and can't change stage.",
        variant: "destructive",
      });
      return;
    }
    const newStatus = destination.droppableId as ProspectStatus;
    updateProspect.mutate({ id: prospectId, data: { status: newStatus } });
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading pipeline...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Drag a card to a new stage, or click it for full details.
        </p>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {statusOptions.map((status) => {
            const prospects = columns.get(status) ?? [];
            return (
              <div key={status} className="w-72 shrink-0 flex flex-col">
                <div className="flex items-center justify-between px-1 pb-2">
                  <h2 className="text-sm font-semibold">{columnLabel[status]}</h2>
                  <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                    {prospects.length}
                  </span>
                </div>
                <Droppable droppableId={status}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 min-h-24 space-y-2 rounded-md p-2 border transition-colors ${
                        snapshot.isDraggingOver
                          ? "bg-primary/5 border-primary/30"
                          : "bg-muted/30 border-transparent"
                      }`}
                      data-testid={`column-${status}`}
                    >
                      {prospects.map((p, index) => {
                        const tier = leadScoreTier(p.leadScore);
                        const isBounced = !!p.bouncedAt;
                        const isSuppressed = !!p.unsubscribedAt;
                        const isLocked = isBounced || isSuppressed;
                        return (
                          <Draggable
                            key={p.id}
                            draggableId={String(p.id)}
                            index={index}
                            isDragDisabled={isLocked}
                          >
                            {(dragProvided, dragSnapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                              >
                                <Card
                                  className={`hover:shadow-md transition-shadow ${
                                    isLocked ? "cursor-pointer opacity-80" : "cursor-pointer"
                                  } ${dragSnapshot.isDragging ? "shadow-lg ring-1 ring-primary/40" : ""}`}
                                  onClick={() => setDetailId(p.id)}
                                  data-testid={`card-prospect-${p.id}`}
                                >
                                  <CardContent className="p-3 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="font-medium text-sm leading-tight">
                                        {p.companyName}
                                      </div>
                                      {isBounced ? (
                                        <span className="text-[10px] font-medium text-destructive shrink-0">
                                          Bounced
                                        </span>
                                      ) : isSuppressed ? (
                                        <span className="text-[10px] font-medium text-destructive shrink-0">
                                          Suppressed
                                        </span>
                                      ) : null}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {p.contactName || "No contact"}
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span
                                        className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${leadScoreBadgeClass[tier]}`}
                                      >
                                        {p.leadScore} · {tier}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground">
                                        {formatDistanceToNow(new Date(p.updatedAt))} ago
                                      </span>
                                    </div>
                                  </CardContent>
                                </Card>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                      {prospects.length === 0 && (
                        <div className="text-xs text-muted-foreground text-center py-6">No prospects</div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      <ProspectDetailDialog
        prospect={detailProspect}
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
