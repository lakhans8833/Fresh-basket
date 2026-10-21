"use client";

import { isValidPincode, type Address, type DeliveryArea, type SlotOption } from "@freshbasket/shared";
import { api } from "@/lib/client/api";

export type CheckedPin = { serviceable: true; area: DeliveryArea; nextSlots: SlotOption[] } | { serviceable: false; area: null; nextSlots?: undefined };

/** Asks the server whether we deliver to this PIN code (the delivery list in Admin → Delivery). */
export async function checkPincode(pincode: string): Promise<CheckedPin> {
  const r = await api<{ serviceable: boolean; area: DeliveryArea | null; nextSlots?: SlotOption[] }>(`/api/delivery/check?pincode=${pincode}`);
  return r.serviceable && r.area ? { serviceable: true, area: r.area, nextSlots: r.nextSlots ?? [] } : { serviceable: false, area: null };
}

/** The signed-in customer's saved addresses, default first (empty if signed out or on error). */
export async function savedAddresses(): Promise<Address[]> {
  try {
    return (await api<{ addresses: Address[] }>("/api/me/addresses", { cache: "no-store" })).addresses;
  } catch {
    return [];
  }
}

/**
 * The customer's current PIN code from the device's location (asks the browser for permission).
 * The coordinates are turned into a PIN code by BigDataCloud's free client-side reverse geocoding
 * (https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api) — sent straight from
 * the browser, never stored by us. Returns the PIN code, or throws a message to show.
 */
export async function pincodeFromDevice(): Promise<string> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    throw new Error("This browser can't share your location. Enter your PIN code instead.");
  }
  // The browser's own timeout only starts after the permission prompt is answered, so also give
  // up after 30 s overall (e.g. the customer ignored the prompt).
  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    const guard = setTimeout(() => reject({ code: 3 }), 30_000);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(guard); resolve(p); },
      (e) => { clearTimeout(guard); reject(e); },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 10 * 60_000 },
    );
  }).catch((e: GeolocationPositionError) => {
    throw new Error(
      e?.code === 1 ? "Location permission was denied. Allow location for this site, or enter your PIN code."
      : e?.code === 3 ? "Finding your location took too long. Try again or enter your PIN code."
      : "Couldn't find your location. Enter your PIN code instead.",
    );
  });
  const { latitude, longitude } = pos.coords;
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`;
  let postcode = "";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) postcode = String(((await res.json()) as { postcode?: string }).postcode ?? "").replace(/\s/g, "");
  } catch {
    /* handled below */
  }
  if (!isValidPincode(postcode)) throw new Error("We found your location but not its PIN code. Please enter your PIN code.");
  return postcode;
}
