import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, Plus, Minus, RefreshCw, Settings, Trophy, Timer, Undo2, Send, Image as ImageIcon, Smartphone } from "lucide-react";

// ---- tiny ui helpers --------------------------------------------------------
function Button({ children, className = "", variant = "default", size = "md", ...props }) {
  const base = "rounded-2xl text-sm transition shadow-sm border";
  const variants = {
    default: "bg-white hover:bg-slate-50",
    primary: "bg-blue-600 text-white border-blue-600 hover:bg-blue-700 hover:border-blue-700",
    subtle: "bg-white hover:bg-slate-50",
    danger: "bg-red-600 text-white border-red-600 hover:bg-red-700 hover:border-red-700",
  };
  const sizes = {
    md: "px-3 py-2",
    lg: "px-5 py-4 text-base", // rink-mode size
  };
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}
function Input({ className = "", size = "md", ...props }) {
  const sizes = {
    md: "px-3 py-2.5 text-sm",
    lg: "px-4 py-3 text-base", // rink-mode size
  };
  return <input className={`${sizes[size]} rounded-xl border shadow-sm bg-white ${className}`} {...props} />;
}
function Select({ className = "", size = "md", ...props }) {
  const sizes = {
    md: "px-3 py-2 text-sm",
    lg: "px-4 py-3 text-base",
  };
  return <select className={`${sizes[size]} rounded-xl border shadow-sm bg-white ${className}`} {...props} />;
}
function Card({ children, className = "" }) {
  return <div className={`rounded-3xl border shadow-sm p-5 md:p-6 bg-white ${className}`}>{children}</div>;
}
function Label({ children, className = "" }) {
  return <label className={`text-xs font-medium opacity-80 ${className}`}>{children}</label>;
}

// ---- scoring defaults --------------------------------------------------------
const DEFAULTS = {
  ends: 10,
  scoring: {
    toucher: 3,
    crossoverShot: 3,
    rankPoints: { first: 10, second: 5, third: 3 },
  },
};

// ---- localStorage hook -------------------------------------------------------
function useLocalStorage(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s ? JSON.parse(s) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);
  return [state, setState];
}

// ---- helpers ----------------------------------------------------------------
function scoreEnd(end, cfg) {
  const S = cfg.scoring;
  let a = 0, b = 0;
  const detail = [];

  if (end.aTouchers > 0) {
    a += end.aTouchers * S.toucher;
    detail.push(`A touchers ${end.aTouchers}×${S.toucher}`);
  }
  if (end.bTouchers > 0) {
    b += end.bTouchers * S.toucher;
    detail.push(`B touchers ${end.bTouchers}×${S.toucher}`);
  }
  if (end.crossoverShot === "A") {
    a += S.crossoverShot; detail.push(`Crossover shot A +${S.crossoverShot}`);
  } else if (end.crossoverShot === "B") {
    b += S.crossoverShot; detail.push(`Crossover shot B +${S.crossoverShot}`);
  } else if (end.crossoverShot === "Both") {
    a += S.crossoverShot; b += S.crossoverShot; detail.push(`Crossover shot undecided +${S.crossoverShot} each`);
  }

  const { first, second, third } = S.rankPoints;
  if (end.first === "A") a += first; else if (end.first === "B") b += first;
  if (end.second === "A") a += second; else if (end.second === "B") b += second;
  if (end.third === "A") a += third; else if (end.third === "B") b += third;

  const ultimate = end.first && end.second && end.third && end.first === end.second && end.second === end.third;
  if (ultimate) detail.push(`Ultimate End (${first + second + third} pts sweep)`);

  const adjA = Number(end.adjA || 0), adjB = Number(end.adjB || 0);
  if (adjA) { a += adjA; detail.push(`Adj A ${adjA > 0 ? "+" : ""}${adjA}`); }
  if (adjB) { b += adjB; detail.push(`Adj B ${adjB > 0 ? "+" : ""}${adjB}`); }

  return { a, b, detail: detail.join("; "), ultimate };
}

function buildCSVRows(teams, ends, cfg) {
  const header = ["End","A touchers","B touchers","Crossover shot","1st","2nd","3rd","Adj A","Adj B","Notes",`${teams.A} pts`,`${teams.B} pts`,`Detail`];
  const rows = [header];
  const totals = ends.reduce((acc, e) => { const r = scoreEnd(e, cfg); acc.a += r.a; acc.b += r.b; return acc; }, { a: 0, b: 0 });

  ends.forEach((e) => {
    const r = scoreEnd(e, cfg);
    rows.push([e.number,e.aTouchers,e.bTouchers,e.crossoverShot||"",e.first||"",e.second||"",e.third||"",e.adjA||0,e.adjB||0,e.notes||"",r.a,r.b,r.detail]);
  });
  rows.push(["Totals","","","","","","","","","",String(totals.a),String(totals.b),""]);
  return rows;
}

function rowsToCSV(rows) {
  const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

function downloadCSV(filename, rows) {
  const csv = rowsToCSV(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ---- main component ---------------------------------------------------------
export default function App() {
  const [teams, setTeams] = useLocalStorage("jackattack.teams", { A: "Team A", B: "Team B" });
  const [cfg, setCfg] = useLocalStorage("jackattack.cfg", DEFAULTS);
  const [meta, setMeta] = useLocalStorage("jackattack.meta", { ends: DEFAULTS.ends, timerSec: 0 });
  const [ends, setEnds] = useLocalStorage("jackattack.ends", []);
  const [history, setHistory] = useState([]);

  // UI state: rink mode + logo
  const [ui, setUI] = useLocalStorage("jackattack.ui", {
    rinkMode: false,
    logoUrl: "/logo.png", // drop a logo file in /public/logo.png or set a URL here
  });

  const inputSize = ui.rinkMode ? "lg" : "md";
  const buttonSize = ui.rinkMode ? "lg" : "md";
  const titleSize = ui.rinkMode ? "text-4xl md:text-5xl" : "text-3xl md:text-4xl";

  useEffect(() => {
    const id = setInterval(() => setMeta((m) => ({ ...m, timerSec: m.timerSec + 1 })), 1000);
    return () => clearInterval(id);
  }, []);
  const timeStr = useMemo(() => {
    const s = meta.timerSec; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const pad = (x) => String(x).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  }, [meta.timerSec]);

  const totals = useMemo(() => ends.reduce((acc, e) => { const r = scoreEnd(e, cfg); acc.a += r.a; acc.b += r.b; return acc; }, { a: 0, b: 0 }), [ends, cfg]);

  // ---- email (quick win: uses /api/send-lite) -------------------------------
  async function sendDirect() {
    const to = "dayne.farley@gmail.com"; // allowed during Resend trial
    const rows = buildCSVRows(teams, ends, cfg);
    const csv = rowsToCSV(rows);
    const subject = `Final score: ${teams.A} vs ${teams.B}`;
    const filename = `jackattack_${teams.A}_vs_${teams.B}.csv`.replace(/\s+/g, "_");

    try {
      const resp = await fetch("/api/send-lite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, csv, filename }),
      });
      const body = await resp.text();
      if (!resp.ok) throw new Error(body);
      alert("Email sent! Check your inbox.");
    } catch (e) {
      alert("Send failed: " + (e?.message || "Unknown error"));
    }
  }

  // ---- state helpers --------------------------------------------------------
  function pushHistory() {
    setHistory((h) => [...h, { teams: JSON.stringify(teams), cfg: JSON.stringify(cfg), meta: JSON.stringify(meta), ends: JSON.stringify(ends) }].slice(-50));
  }
  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory(history.slice(0, -1));
    setTeams(JSON.parse(last.teams));
    setCfg(JSON.parse(last.cfg));
    setMeta(JSON.parse(last.meta));
    setEnds(JSON.parse(last.ends));
  }
  function reset() {
    if (!confirm("Reset match?")) return;
    pushHistory();
    setTeams({ A: "Team A", B: "Team B" });
    setCfg(DEFAULTS);
    setMeta({ ends: DEFAULTS.ends, timerSec: 0 });
    setEnds([]);
  }
  function addEnd() {
    pushHistory();
    setEnds([
      ...ends,
      { number: ends.length + 1, aTouchers: 0, bTouchers: 0, crossoverShot: "None", first: "", second: "", third: "", notes: "", adjA: 0, adjB: 0 },
    ]);
  }
  function updateEnd(i, patch) {
    pushHistory();
    setEnds((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }
  function removeLast() {
    if (!ends.length) return;
    pushHistory();
    setEnds(ends.slice(0, -1));
  }
  function exportCSV() {
    const rows = buildCSVRows(teams, ends, cfg);
    downloadCSV(`jackattack_${teams.A}_vs_${teams.B}.csv`, rows);
  }

  // ---- render ---------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto font-sans">
        <div className="flex items-center justify-between mb-4">
          <motion.h1 layout className={`${titleSize} font-semibold flex items-center gap-3`}>
            <Trophy className={ui.rinkMode ? "w-8 h-8" : "w-7 h-7"} /> Jack Attack Scorer
          </motion.h1>

          <div className="flex items-center gap-2">
            <Button
              size={buttonSize}
              variant={ui.rinkMode ? "primary" : "subtle"}
              onClick={() => setUI({ ...ui, rinkMode: !ui.rinkMode })}
              title="Toggle Rink Mode (bigger UI)"
            >
              <Smartphone className="inline w-4 h-4 mr-2" />
              {ui.rinkMode ? "Rink Mode On" : "Rink Mode Off"}
            </Button>
          </div>
        </div>

        {/* Logo row */}
        {ui.logoUrl ? (
          <div className="mb-4 flex items-center justify-center">
            <img
              src={ui.logoUrl}
              alt="Event Logo"
              className="max-h-16 md:max-h-20 object-contain"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </div>
        ) : null}

        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <Label>Teams</Label>
              <Button className="text-xs" onClick={() => { pushHistory(); setTeams({ A: "Team A", B: "Team B" }); }}>
                Reset
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>A</Label>
                <Input size={inputSize} value={teams.A} onChange={(e) => { pushHistory(); setTeams({ ...teams, A: e.target.value }); }} />
              </div>
              <div>
                <Label>B</Label>
                <Input size={inputSize} value={teams.B} onChange={(e) => { pushHistory(); setTeams({ ...teams, B: e.target.value }); }} />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Button size={buttonSize} onClick={exportCSV}>
                <Download className="inline w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button size={buttonSize} onClick={sendDirect} variant="primary">
                <Send className="inline w-4 h-4 mr-2" />
                Complete &amp; Send
              </Button>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <Label>Match</Label>
              <div className="text-xs opacity-70 flex items-center gap-2">
                <Timer className="w-4 h-4" />
                {timeStr}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 items-end">
              <div>
                <Label>Total Ends</Label>
                <Input size={inputSize} type="number" value={meta.ends} min={1} onChange={(e) => { pushHistory(); setMeta({ ...meta, ends: Number(e.target.value) }); }} />
              </div>
              <div>
                <Label>Total {teams.A}</Label>
                <div className={`px-3 py-2 rounded-xl border bg-white ${ui.rinkMode ? "text-base" : "text-sm"}`}>{totals.a}</div>
              </div>
              <div>
                <Label>Total {teams.B}</Label>
                <div className={`px-3 py-2 rounded-xl border bg-white ${ui.rinkMode ? "text-base" : "text-sm"}`}>{totals.b}</div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size={buttonSize} onClick={addEnd}>
                <Plus className="inline w-4 h-4 mr-2" />
                Add End
              </Button>
              <Button size={buttonSize} onClick={removeLast}>
                <Minus className="inline w-4 h-4 mr-2" />
                Remove Last
              </Button>
              <Button size={buttonSize} onClick={undo}>
                <Undo2 className="inline w-4 h-4 mr-2" />
                Undo
              </Button>
              <Button size={buttonSize} onClick={reset} className="ml-auto" variant="subtle">
                <RefreshCw className="inline w-4 h-4 mr-2" />
                Reset Match
              </Button>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <Label>Display & Logo</Label>
              <Settings className="w-4 h-4 opacity-60" />
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label>Logo URL (or /logo.png)</Label>
                <div className="flex gap-2">
                  <Input
                    size={inputSize}
                    value={ui.logoUrl}
                    onChange={(e) => setUI({ ...ui, logoUrl: e.target.value })}
                    placeholder="/logo.png or https://..."
                  />
                  <Button
                    size={buttonSize}
                    onClick={() => setUI({ ...ui, logoUrl: "/logo.png" })}
                    title="Use /public/logo.png"
                  >
                    <ImageIcon className="inline w-4 h-4 mr-2" />
                    Use /logo.png
                  </Button>
                </div>
                <div className="text-xs opacity-70 mt-2">
                  Tip: Upload a file named <code>logo.png</code> into the <code>public/</code> folder and press “Use /logo.png”.
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Card className="mb-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className={`${ui.rinkMode ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl"} font-semibold tracking-tight`}>
              {teams.A} <span className="text-blue-600">{totals.a}</span>
              <span className="opacity-40 mx-2">—</span>
              <span className="text-blue-600">{totals.b}</span> {teams.B}
            </div>
            <div className={`${ui.rinkMode ? "text-sm" : "text-xs md:text-sm"} opacity-70`}>Ends: {ends.length}/{meta.ends}</div>
          </div>
        </Card>

        <div className="grid gap-3">
          {ends.map((e, idx) => {
            const r = scoreEnd(e, cfg);
            return (
              <Card key={idx}>
                <div className="flex items-center justify-between mb-2">
                  <div className={`${ui.rinkMode ? "text-lg" : ""} font-semibold flex items-center gap-2`}>
                    End {e.number} {r.ultimate && <span className="text-xs px-2 py-1 border rounded-xl">Ultimate End</span>}
                  </div>
                  <div className={`${ui.rinkMode ? "text-base" : "text-sm"} opacity-70`}>{teams.A}: +{r.a} | {teams.B}: +{r.b}</div>
                </div>

                <div className="grid md:grid-cols-6 gap-3">
                  <div>
                    <Label>{teams.A} Touchers</Label>
                    <Input size={inputSize} type="number" value={e.aTouchers} min={0} onChange={(ev) => updateEnd(idx, { aTouchers: Number(ev.target.value) })}/>
                  </div>
                  <div>
                    <Label>{teams.B} Touchers</Label>
                    <Input size={inputSize} type="number" value={e.bTouchers} min={0} onChange={(ev) => updateEnd(idx, { bTouchers: Number(ev.target.value) })}/>
                  </div>
                  <div>
                    <Label>Crossover Shot</Label>
                    <Select size={inputSize} value={e.crossoverShot} onChange={(ev) => updateEnd(idx, { crossoverShot: ev.target.value })}>
                      <option value="None">None</option>
                      <option value="A">{teams.A}</option>
                      <option value="B">{teams.B}</option>
                      <option value="Both">Undecided / Both +3</option>
                    </Select>
                  </div>
                  <div>
                    <Label>1st Shot (final)</Label>
                    <Select size={inputSize} value={e.first} onChange={(ev) => updateEnd(idx, { first: ev.target.value })}>
                      <option value=""></option>
                      <option value="A">{teams.A}</option>
                      <option value="B">{teams.B}</option>
                    </Select>
                  </div>
                  <div>
                    <Label>2nd Shot (final)</Label>
                    <Select size={inputSize} value={e.second} onChange={(ev) => updateEnd(idx, { second: ev.target.value })}>
                      <option value=""></option>
                      <option value="A">{teams.A}</option>
                      <option value="B">{teams.B}</option>
                    </Select>
                  </div>
                  <div>
                    <Label>3rd Shot (final)</Label>
                    <Select size={inputSize} value={e.third} onChange={(ev) => updateEnd(idx, { third: ev.target.value })}>
                      <option value=""></option>
                      <option value="A">{teams.A}</option>
                      <option value="B">{teams.B}</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Adj {teams.A}</Label>
                    <Input size={inputSize} type="number" value={e.adjA} onChange={(ev) => updateEnd(idx, { adjA: Number(ev.target.value) })}/>
                  </div>
                  <div>
                    <Label>Adj {teams.B}</Label>
                    <Input size={inputSize} type="number" value={e.adjB} onChange={(ev) => updateEnd(idx, { adjB: Number(ev.target.value) })}/>
                  </div>
                  <div className="md:col-span-2">
                    <Label>Notes</Label>
                    <Input size={inputSize} value={e.notes} onChange={(ev) => updateEnd(idx, { notes: ev.target.value })}/>
                  </div>
                </div>

                <div className="mt-3 text-xs opacity-70">{r.detail}</div>
              </Card>
            );
          })}
        </div>

        <div className="h-12" />
      </div>
    </div>
  );
}
