"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { subscribeUserToPush } from "@/lib/notifications/vapid";

export function useWebNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (!isSupported) {
      toast.error("Device notifications are not supported on this browser/device.");
      return false;
    }

    try {
      const res = await Notification.requestPermission();
      setPermission(res);

      if (res === "granted") {
        try {
          const subscription = await subscribeUserToPush();
          console.log("Push subscription successful");
          
          // Store the subscription in the database
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          
          if (user) {
            const subData = JSON.parse(JSON.stringify(subscription));
            await (supabase.from("push_subscriptions") as any).insert({
              user_id: user.id,
              endpoint: subData.endpoint,
              p256dh: subData.keys.p256dh,
              auth: subData.keys.auth
            });
          }
        } catch (subErr) {
          console.error("Failed to subscribe to push manager", subErr);
        }

        toast.success("Device push notifications enabled!");
        sendNotification("NisFlow Finance", {
          body: "Device push notifications are now active. You will receive alerts for due payments and budgets.",
          icon: "/icon512_rounded.png",
        });
        return true;
      } else {
        toast.error("Notification permission denied.");
      }
    } catch (err) {
      console.error("Failed to request notification permission", err);
    }
    return false;
  };

  const sendNotification = (title: string, options?: NotificationOptions) => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(title, {
          icon: "/icon.svg",
          badge: "/icon.svg",
          ...options,
        });
      } catch (err) {
        console.error("Failed to display notification", err);
      }
    }
  };

  const checkPendingAlertsAndNotify = async () => {
    if (permission !== "granted") return;

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check overdue receivables
      const { data: receivables } = await (supabase.from("receivables") as any)
        .select("*, counterparties(name)")
        .neq("status", "settled");

      if (receivables && receivables.length > 0) {
        const overdue = receivables.filter((r: any) => new Date(r.due_date) < new Date());
        if (overdue.length > 0) {
          sendNotification("Overdue Receivables Alert", {
            body: `You have ${overdue.length} overdue receivable(s). Check your people dashboard to collect.`,
          });
        }
      }

      // Check due payables
      const { data: payables } = await (supabase.from("payables") as any)
        .select("*, counterparties(name)")
        .neq("status", "settled");

      if (payables && payables.length > 0) {
        const dueSoon = payables.filter((p: any) => new Date(p.due_date) < new Date());
        if (dueSoon.length > 0) {
          sendNotification("Due Payables Reminder", {
            body: `You have ${dueSoon.length} payable(s) due or overdue.`,
          });
        }
      }
    } catch (err) {
      console.error("Failed to check pending alerts", err);
    }
  };

  return {
    isSupported,
    permission,
    requestPermission,
    sendNotification,
    checkPendingAlertsAndNotify,
  };
}
