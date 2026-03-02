"use client";

import { useEffect } from "react";
import { flushMutationQueue } from "@/lib/client/offline-queue";

export function PwaBoot() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if ("serviceWorker" in navigator && process.env.NODE_ENV !== "production") {
      // In development, stale service worker caches often break hydration/API behavior.
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          void registration.unregister();
        }
      });

      if ("caches" in window) {
        void caches.keys().then((keys) => {
          for (const key of keys) {
            if (key.startsWith("weekplanner-")) {
              void caches.delete(key);
            }
          }
        });
      }
    } else if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js?v=2");
    }

    const onOnline = () => {
      void flushMutationQueue();
    };

    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return null;
}
