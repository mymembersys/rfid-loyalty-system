import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { apiOrigin } from "../api/client";

type Props = {
  token: string;
  size?: number;
};

export function BalanceQR({ token, size = 200 }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const url = `${apiOrigin()}/balance/${encodeURIComponent(token)}`;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: size, margin: 1, errorCorrectionLevel: "M" })
      .then(d => { if (!cancelled) setDataUrl(d); })
      .catch(e => { if (!cancelled) setErr(e?.message || "QR failed"); });
    return () => { cancelled = true; };
  }, [url, size]);

  if (err) return <div className="err">{err}</div>;
  if (!dataUrl) return <div className="qr-skel" style={{ width: size, height: size }} />;

  return (
    <div className="qr-block">
      <img src={dataUrl} width={size} height={size} alt="" />
      <div className="muted small mono qr-url">{url}</div>
    </div>
  );
}
