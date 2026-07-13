import { Link, useLocation } from "wouter";
import { useClerk } from "@clerk/react";
import { 
  LayoutDashboard, 
  Users, 
  Send, 
  Inbox as InboxIcon, 
  Activity, 
  Puzzle, 
  Settings as SettingsIcon,
  LogOut,
  Bell,
  Kanban
} from "lucide-react";
import { 
  useListNotifications, 
  useGetUnreadNotificationCount, 
  useMarkNotificationRead 
} from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Prospects", href: "/prospects", icon: Users },
  { name: "Pipeline", href: "/pipeline", icon: Kanban },
  { name: "Campaigns", href: "/campaigns", icon: Send },
  { name: "Inbox", href: "/inbox", icon: InboxIcon },
  { name: "AI Activity", href: "/ai-activity", icon: Activity },
  { name: "Integrations", href: "/integrations", icon: Puzzle },
  { name: "Settings", href: "/settings", icon: SettingsIcon },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: unreadCountData } = useGetUnreadNotificationCount();
  const { data: notificationsData, refetch: refetchNotifications } = useListNotifications({ unreadOnly: true });
  const markRead = useMarkNotificationRead();

  const handleMarkRead = async (id: number) => {
    await markRead.mutateAsync({ id });
    refetchNotifications();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background font-sans text-foreground">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-sidebar flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <img src={`${basePath}/logo.svg`} alt="Outreach AI" className="h-8 w-8 mr-3" />
          <span className="font-bold text-lg text-sidebar-foreground">Outreach AI</span>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navigation.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link 
                key={item.name} 
                href={item.href}
                className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className={`mr-3 h-5 w-5 flex-shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-border">
          <button 
            onClick={() => signOut({ redirectUrl: basePath || "/" })}
            className="flex w-full items-center px-3 py-2 text-sm font-medium text-sidebar-foreground rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <LogOut className="mr-3 h-5 w-5 text-muted-foreground" />
            Log out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 shrink-0 shadow-sm z-10">
          <div className="font-medium text-lg capitalize">
            {location.split('/')[1]?.replace('-', ' ') || 'Dashboard'}
          </div>
          
          <div className="flex items-center space-x-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-9 w-9">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  {unreadCountData?.count ? (
                    <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-primary text-white text-[10px]">
                      {unreadCountData.count}
                    </Badge>
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0 shadow-md">
                <div className="px-4 py-3 border-b border-border flex justify-between items-center bg-muted/30">
                  <span className="font-medium">Notifications</span>
                  {unreadCountData?.count ? (
                    <Badge variant="secondary" className="text-xs">{unreadCountData.count} unread</Badge>
                  ) : null}
                </div>
                <ScrollArea className="h-80">
                  {notificationsData && notificationsData.length > 0 ? (
                    <div className="flex flex-col">
                      {notificationsData.map((notif) => (
                        <div key={notif.id} className={`p-4 border-b border-border text-sm hover:bg-muted/50 transition-colors ${!notif.isRead ? 'bg-primary/5' : ''}`}>
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-semibold">{notif.title}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{formatDistanceToNow(new Date(notif.createdAt))} ago</span>
                          </div>
                          <p className="text-muted-foreground text-xs mb-2 leading-relaxed">{notif.body}</p>
                          {!notif.isRead && (
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleMarkRead(notif.id)}>
                              Mark as read
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center justify-center h-full">
                      <Bell className="h-8 w-8 mb-3 opacity-20" />
                      <p>No new notifications</p>
                    </div>
                  )}
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
        </header>
        
        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-background p-6">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
