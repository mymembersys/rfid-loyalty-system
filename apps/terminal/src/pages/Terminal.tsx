import { useState } from "react";
import { CheckIn } from "./CheckIn";
import { Redeem } from "./Redeem";
import { VoucherRedeem } from "./VoucherRedeem";
import { TerminalConfig } from "../types";
import { useBranding } from "../useBranding";
import { useServiceLines } from "../useServiceLines";

type Mode = "checkin" | "redeem" | "voucher";

export function Terminal({ config, onReset }: { config: TerminalConfig; onReset: () => void }) {
  const [mode, setMode] = useState<Mode>("checkin");
  const brand = useBranding();
  const serviceLines = useServiceLines(config.staff_token);
  const sl = serviceLines.find(s => s.code === config.service_line);

  return (
    <div className="terminal">
      <header>
        <div className="brand">
          {brand.logo_url
            ? <img className="logo logo-img" src={brand.logo_url} alt="" />
            : <span className="logo" />}
          <strong>{brand.brand_name}</strong>
          <span className="muted small">·</span>
          <strong>{config.branch_name}</strong>
          <span
            className="tag"
            style={sl ? { background: `color-mix(in srgb, ${sl.color} 30%, transparent)`, color: "#fff", borderColor: `color-mix(in srgb, ${sl.color} 50%, transparent)` } : undefined}
          >
            {sl?.name ?? config.service_line}
          </span>
        </div>
        <div className="mode-tabs">
          <button
            className={mode === "checkin" ? "tab active" : "tab"}
            onClick={() => setMode("checkin")}
          >Check-in</button>
          <button
            className={mode === "redeem" ? "tab active" : "tab"}
            onClick={() => setMode("redeem")}
          >Redeem</button>
          <button
            className={mode === "voucher" ? "tab active" : "tab"}
            onClick={() => setMode("voucher")}
          >Voucher</button>
        </div>
        <div className="staff">
          <span className="muted small">{config.staff_name}</span>
          <button className="ghost" onClick={onReset}>Sign out</button>
        </div>
      </header>

      {mode === "checkin" && <CheckIn config={config} embedded />}
      {mode === "redeem" && <Redeem config={config} />}
      {mode === "voucher" && <VoucherRedeem config={config} />}

      <footer className="tfoot muted small">
        Tip: USB RFID readers type the UID and press Enter automatically.
      </footer>
    </div>
  );
}
