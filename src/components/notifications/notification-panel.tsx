'use client';

import { useState } from 'react';
import { Bell, Check, Clock, AlertTriangle, ArrowDownToLine, TrendingUp, Calendar, CheckSquare, Info } from 'lucide-react';
import { useNotifications, useMarkNotificationRead, useMarkAllRead, AppNotification } from '@/lib/hooks/use-notifications';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRouter } from 'next/navigation';

export function NotificationPanel() {
  const { data: notifications, isLoading } = useNotifications();
  const { mutate: markRead } = useMarkNotificationRead();
  const { mutate: markAllRead, isPending: isMarkingAll } = useMarkAllRead();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const unreadCount = notifications?.filter(n => !n.is_read).length || 0;

  const handleNotificationClick = (notification: AppNotification) => {
    if (!notification.is_read) {
      markRead(notification.id);
    }
    if (notification.link) {
      setOpen(false);
      router.push(notification.link);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'overdue_receivable': return <ArrowDownToLine className="h-4 w-4 text-red-500" />;
      case 'budget_warning': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'large_transaction': return <TrendingUp className="h-4 w-4 text-blue-500" />;
      case 'ipo_status': return <Calendar className="h-4 w-4 text-purple-500" />;
      case 'monthly_closing_reminder': return <Clock className="h-4 w-4 text-emerald-500" />;
      case 'reconciliation_needed': return <CheckSquare className="h-4 w-4 text-amber-500" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="inline-flex h-9 w-9 relative items-center justify-center rounded-md border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-3 w-3 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle>Notifications</SheetTitle>
            {unreadCount > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => markAllRead()}
                disabled={isMarkingAll}
                className="text-xs h-8"
              >
                <Check className="mr-2 h-3 w-3" />
                Mark all as read
              </Button>
            )}
          </div>
        </SheetHeader>
        
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                    <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications?.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground p-4 text-center">
              <Bell className="h-8 w-8 mb-2 opacity-20" />
              <p className="text-sm">You have no notifications</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications?.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    "w-full text-left flex items-start gap-3 p-4 transition-colors hover:bg-muted/50",
                    !notification.is_read ? "bg-primary/5" : ""
                  )}
                >
                  <div className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                    !notification.is_read ? "bg-background border-primary/20" : "bg-muted border-transparent"
                  )}>
                    {getIcon(notification.type)}
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn(
                        "text-sm font-medium leading-none",
                        !notification.is_read ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {notification.title}
                      </p>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {notification.description}
                    </p>
                  </div>
                  {!notification.is_read && (
                    <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
