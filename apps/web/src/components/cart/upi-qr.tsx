"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { cn } from "../ui/cn";

/** UPI payment QR code (rendered in the browser from the server-built upi:// link). */
export function UpiQr({ value, className }: { value: string; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#0b3d1d", light: "#ffffff" } }).then(
      (s) => { if (alive) setSvg(s); },
      () => { if (alive) setSvg(null); },
    );
    return () => { alive = false; };
  }, [value]);
  if (!svg) return <div className={cn("skeleton rounded-xl", className)} aria-busy="true" />;
  return (
    <div
      role="img"
      aria-label="UPI payment QR code — scan with any UPI app"
      className={cn("overflow-hidden rounded-xl border border-line bg-white p-2 [&_svg]:size-full", className)}
      // The SVG is generated locally by the qrcode library from our own upi:// link (no user HTML).
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
