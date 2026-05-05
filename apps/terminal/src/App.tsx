import { useEffect, useState } from "react";
import { Terminal } from "./pages/Terminal";
import { TerminalSetup } from "./pages/TerminalSetup";
import { TerminalConfig } from "./types";

const CONFIG_KEY = "rfid_terminal_config";

export function App() {
  const [config, setConfig] = useState<TerminalConfig | null>(() => {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    else localStorage.removeItem(CONFIG_KEY);
  }, [config]);

  if (!config) return <TerminalSetup onSave={setConfig} />;
  return <Terminal config={config} onReset={() => setConfig(null)} />;
}
