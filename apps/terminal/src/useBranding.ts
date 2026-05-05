import { useEffect, useState } from "react";
import { Branding, getBranding, subscribeBranding } from "./branding";

export function useBranding(): Branding {
  const [b, setB] = useState<Branding>(getBranding());
  useEffect(() => subscribeBranding(setB), []);
  return b;
}
