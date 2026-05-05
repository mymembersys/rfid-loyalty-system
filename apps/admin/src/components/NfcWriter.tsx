import { useEffect, useMemo, useRef, useState } from "react";

type Status = "idle" | "writing" | "done" | "error";

type Props = {
  /** Absolute URL to write into the NDEF URI record. */
  url: string;
};

/**
 * Burns an NDEF URI record onto a tapped NFC card using Web NFC.
 *
 * Web NFC is **only** supported by Android Chrome 89+ on a **secure context**
 * (HTTPS or `localhost`). On every other browser/host we fall back to
 * copy-paste + manual instructions.
 */
export function NfcWriter({ url }: Props) {
  const env = useMemo(diagnose, []);
  const [status, setStatus] = useState<Status>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard not available */ }
  }

  async function writeToCard() {
    if (!env.canWrite) return;
    setErr(null);
    setStatus("writing");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const Ndef = (window as any).NDEFReader;
      const r = new Ndef();
      await r.write(
        { records: [{ recordType: "url", data: url }] },
        { signal: ctrl.signal }
      );
      setStatus("done");
    } catch (e: any) {
      if (e?.name === "AbortError") { setStatus("idle"); return; }
      setErr(humanizeError(e));
      setStatus("error");
    }
  }

  function cancelWrite() {
    abortRef.current?.abort();
    setStatus("idle");
  }

  // Approximate NDEF size: 7 bytes overhead + URL bytes.
  // NTAG213 ≈ 137 chars usable, NTAG215/216 plenty.
  const urlBytes = new TextEncoder().encode(url).length;
  const ntag213Risk = urlBytes > 130;

  return (
    <div className="nfc-writer">
      <label className="field">
        <span>NFC URL <small className="muted">(written as the card's NDEF URI record)</small></span>
        <div className="url-row">
          <input readOnly value={url} className="mono" onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn-secondary" onClick={copyUrl}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <small className="muted">
          Length {urlBytes} bytes
          {ntag213Risk
            ? <> · <span className="text-danger">won't fit on NTAG213 (144 B)</span> — use NTAG215/216</>
            : <> · fits on NTAG213/215/216</>}
        </small>
      </label>

      {env.canWrite ? (
        <>
          {status === "idle" && (
            <button type="button" className="btn-primary" onClick={writeToCard}>
              Write to card via NFC
            </button>
          )}
          {status === "writing" && (
            <div className="nfc-pulse">
              <div className="nfc-pulse-ring" />
              <div>
                <b>Tap the card now</b>
                <div className="muted small">Hold the RFID card flat against the back of this device.</div>
              </div>
              <button type="button" className="btn-ghost btn-sm" onClick={cancelWrite}>Cancel</button>
            </div>
          )}
          {status === "done"  && <div className="ok-msg">Card written successfully. Test it by tapping the card on a phone.</div>}
          {status === "error" && (
            <>
              <div className="err">{err}</div>
              <button type="button" className="btn-secondary" onClick={writeToCard} style={{ marginTop: ".5rem" }}>
                Try again
              </button>
            </>
          )}
        </>
      ) : (
        <div className="nfc-fallback">
          <p><b>Can't write from this browser:</b> {env.reason}</p>
          <p className="muted small" style={{ marginTop: ".5rem" }}>To write the URL onto the card, do one of:</p>
          <ul className="muted small">
            {env.advice.map((line, i) => <li key={i} dangerouslySetInnerHTML={{ __html: line }} />)}
          </ul>
        </div>
      )}
    </div>
  );
}

type Diagnosis = { canWrite: boolean; reason: string; advice: string[] };

function diagnose(): Diagnosis {
  if (typeof window === "undefined") {
    return { canWrite: false, reason: "no window", advice: [] };
  }
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  const isChromium = /Chrome|Chromium|EdgA|SamsungBrowser/i.test(ua) && !/OPR\//.test(ua);
  const isSecure = window.isSecureContext === true; // HTTPS or http://localhost
  const hasApi = "NDEFReader" in window;

  const desktopAdvice = [
    "Open this admin portal on an Android phone in Chrome (89+), then re-open this dialog and tap <b>Write to card via NFC</b>.",
    "Or copy the URL above and write it with a free Android app like <i>NFC Tools</i> (Add record → URL/URI).",
    "Or use a desktop NFC writer (ACR122U + NFC Tools desktop or libnfc) and write a single NDEF URI record.",
  ];

  if (!isAndroid) {
    return {
      canWrite: false,
      reason: "Web NFC is Android-only. iOS, Windows, macOS, and Linux browsers can't write NFC tags.",
      advice: desktopAdvice,
    };
  }
  if (!isChromium) {
    return {
      canWrite: false,
      reason: "Web NFC needs Chrome / Edge / Samsung Internet on Android. Firefox doesn't support it.",
      advice: ["Open this page in Chrome on this Android device and try again."],
    };
  }
  if (!isSecure) {
    return {
      canWrite: false,
      reason: "Web NFC requires HTTPS (or http://localhost). This page is loaded over plain HTTP, so the API is disabled.",
      advice: [
        "Run the admin server with HTTPS, or access it via the Network HTTPS URL.",
        "For dev, use a tunnel like ngrok / Cloudflare Tunnel to expose the admin over HTTPS, then open that URL on the phone.",
        "Or copy the URL above and write it with the <i>NFC Tools</i> Android app.",
      ],
    };
  }
  if (!hasApi) {
    return {
      canWrite: false,
      reason: "Your Android Chrome version doesn't expose NDEFReader. Update Chrome to 89 or newer.",
      advice: ["Update Chrome from the Play Store and reload this page."],
    };
  }
  return { canWrite: true, reason: "", advice: [] };
}

function humanizeError(e: unknown): string {
  if (!e || typeof e !== "object") return "Write failed";
  const err = e as { name?: string; message?: string };
  switch (err.name) {
    case "NotAllowedError":   return "NFC permission was denied. Enable NFC in system settings, allow it for the browser, and try again.";
    case "NotSupportedError": return "This device or browser doesn't support NFC writing.";
    case "NetworkError":      return "Could not write to the card. The tag may be too small (NTAG213 is only 144 B), read-only, or held away too quickly. Use NTAG215/216 if your URL is long, hold steady against the back of the phone, and try again.";
    case "AbortError":        return "Write was cancelled.";
    default:                  return err.message || "Write failed";
  }
}
