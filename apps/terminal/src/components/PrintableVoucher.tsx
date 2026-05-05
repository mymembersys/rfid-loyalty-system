import { createPortal } from "react-dom";
import { Branding } from "../branding";

export type PrintableVoucherProps = {
  brand: Branding;
  voucherCode: string;
  rewardName: string;
  rewardCode?: string | null;
  rewardDescription?: string | null;
  serviceLine?: string | null;
  stampsUsed: number;
  memberName: string;
  memberNo: string;
  branchName: string;
  expiresAt: string;
  /** "issued" or "redeemed" — controls the title and footer note */
  variant: "issued" | "redeemed";
  redeemedAt?: string | null;
};

/**
 * Hidden on screen. Visible only inside @media print, where the rest of
 * the kiosk is hidden so the printer renders just this card.
 *
 * Portaled to document.body so it sits OUTSIDE `.terminal`. The print
 * stylesheet hides `.terminal` via `display: none`, which would otherwise
 * cascade to any child node and blank the printout.
 */
export function PrintableVoucher(p: PrintableVoucherProps) {
  return createPortal(
    <div className="print-only">
      <div className="pv-card">
        <header className="pv-head">
          {p.brand.logo_url
            ? <img className="pv-logo" src={p.brand.logo_url} alt="" />
            : <span className="pv-logo placeholder" />}
          <div>
            <div className="pv-brand">{p.brand.brand_name}</div>
            <div className="pv-branch">{p.branchName}</div>
          </div>
        </header>

        <div className="pv-title">
          {p.variant === "redeemed" ? "REDEMPTION RECEIPT" : "REWARD VOUCHER"}
        </div>

        <div className="pv-code">{p.voucherCode}</div>

        <table className="pv-table">
          <tbody>
            <tr>
              <th>Reward</th>
              <td>
                <b>{p.rewardName}</b>
                {p.rewardCode && <span className="pv-faint"> ({p.rewardCode})</span>}
              </td>
            </tr>
            {p.rewardDescription && (
              <tr><th>Details</th><td>{p.rewardDescription}</td></tr>
            )}
            <tr>
              <th>Service</th>
              <td>{p.serviceLine || "Any service"}</td>
            </tr>
            <tr>
              <th>Stamps used</th>
              <td>{p.stampsUsed}</td>
            </tr>
            <tr>
              <th>Member</th>
              <td>
                <b>{p.memberName}</b><br/>
                <span className="pv-faint">{p.memberNo}</span>
              </td>
            </tr>
            <tr>
              <th>Issued</th>
              <td>{new Date().toLocaleString()}</td>
            </tr>
            <tr>
              <th>Expires</th>
              <td>{new Date(p.expiresAt).toLocaleString()}</td>
            </tr>
            {p.variant === "redeemed" && p.redeemedAt && (
              <tr>
                <th>Redeemed</th>
                <td><b>{new Date(p.redeemedAt).toLocaleString()}</b></td>
              </tr>
            )}
          </tbody>
        </table>

        <footer className="pv-foot">
          {p.variant === "redeemed"
            ? "This receipt confirms that the voucher above has been redeemed."
            : "Present this voucher at any branch counter to redeem your reward."}
          <div className="pv-faint">Code: {p.voucherCode}</div>
        </footer>
      </div>
    </div>,
    document.body
  );
}
