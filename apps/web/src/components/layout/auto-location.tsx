"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "../cart/cart-context";
import { useSession } from "../account/session-context";
import { useToast } from "../ui/toast";
import { checkPincode, savedAddresses } from "./delivery-location";

/**
 * After sign-in, if no delivery location is chosen yet on this device, use the customer's saved
 * default address — but only when we deliver to its PIN code. Never overrides a location the
 * customer picked, and runs once per signed-in customer.
 */
export function AutoLocation() {
  const { profile } = useSession();
  // Not in the admin panel: staff don't shop there, and the toast would cover admin screens.
  const inAdmin = usePathname().startsWith("/admin");
  const { location, setLocation, hydrated } = useCart();
  const toast = useToast();
  const done = useRef<string | null>(null);
  const mounted = useRef(true);
  const latest = useRef({ location, setLocation, toast });
  useEffect(() => {
    latest.current = { location, setLocation, toast };
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (inAdmin || !hydrated || !profile || location || done.current === profile.id) return;
    done.current = profile.id;
    (async () => {
      const addresses = await savedAddresses();
      // default first, then the others; first serviceable one wins
      for (const a of addresses.slice(0, 5)) {
        try {
          const r = await checkPincode(a.pincode);
          // Stop if the page went away or the customer chose a location meanwhile.
          if (!mounted.current || latest.current.location) return;
          if (r.serviceable) {
            latest.current.setLocation({ pincode: r.area.pincode, areaName: r.area.areaName, city: r.area.city });
            latest.current.toast(`Delivering to ${r.area.areaName} (${r.area.pincode}) — from your saved address`);
            return;
          }
        } catch {
          return;
        }
      }
    })();
  }, [hydrated, profile, location, inAdmin]);

  return null;
}
