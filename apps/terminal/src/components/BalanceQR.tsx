import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { apiOrigin } from "../api";

type Props = {
  token: string;
  /** Override the link base. Defaults to the API origin (or window.location). */
  origin?: string;
  size?: number;
};

/**
 * Renders a QR code that links to the public balance page (/balance/:token).
 * Customers can scan this with their phone camera straight after their tap.
 */
export function BalanceQR({ token, origin, size = 160 }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const url = `${origin ?? apiOrigin()}/balance/${encodeURIComponent(token)}`;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: size, margin: 1, errorCorrectionLevel: "M" })
      .then(d => { if (!cancelled) setDataUrl(d); })
      .catch(e => { if (!cancelled) setErr(e?.message || "QR failed"); });
    return () => { cancelled = true; };
  }, [url, size]);

  if (err) return <div className="qr-err muted small">{err}</div>;
  if (!dataUrl) return <div className="qr-skel" style={{ width: size, height: size }} />;

  return (
    <a href={url} target="_blank" rel="noreferrer" className="qr-link" title="Open balance page">
      <img src={dataUrl} width={size} height={size} alt="Scan to view balance" />
    </a>
  );
}
