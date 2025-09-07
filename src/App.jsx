import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, Plus, Minus, RefreshCw, Settings, Trophy, Timer, Undo2, Send } from "lucide-react";

// Minimal UI helpers
function Button({ children, className = "", ...props }) {
  return (
    <button className={`px-3 py-2 rounded-2xl shadow-sm border text-sm hover:shadow transition ${className}`} {...props}>
      {children}
    </button>
  );
}
function Input({ className = "", ...props }) {
  return <input className={`px-3 py-2 rounded-xl border shadow-sm text-sm ${className}`} {...props} />;
}
function Card({ children, className = "" }) {
  return <div className={`rounded-3xl border shadow-sm p-4 ${className}`}>{children}</div>;
}
function Label({ children, className = "" }) {
  return <label className={`text-xs font-medium opacity-80 ${className}`}>{children}</label>;
}

// --- Scoring defaults ---
const DEFAULTS = {
  ends: 10,
  scoring: {
    toucher: 3,
    crossoverShot: 3,
    rankPoints: { first: 10, second: 5, third: 3 },
  },
};

function useLocalStorage(key, initial) {
  const [state, setState] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)); } catch {} }, [key, state]);
  return [state, setState];
}

function csvEscape(v){const s=String(v??"");return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
function downloadCSV(filename, rows){const csv=rows.map(r=>r.map(csvEscape).join(",")).join("\n");const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url)}

function scoreEnd(end, cfg){
  const S = cfg.scoring;
  let a = 0, b = 0; const detail = [];
  if (end.aTouchers>0) { a += end.aTouchers * S.toucher; detail.push(`A touchers ${end.aTouchers}×${S.toucher}`); }
  if (end.bTouchers>0) { b += end.bTouchers * S.toucher; detail.push(`B touchers ${end.bTouchers}×${S.toucher}`); }
  if (end.crossoverShot === 'A') { a += S.crossoverShot; detail.push(`Crossover shot A +${S.crossoverShot}`); }
  else if (end.crossoverShot === 'B') { b += S.crossoverShot; detail.push(`Crossover shot B +${S.crossoverShot}`); }
  else if (end.crossoverShot === 'Both') { a += S.crossoverShot; b += S.crossoverShot; detail.push(`Crossover shot undecided +${S.crossoverShot} each`); }

  const { first, second, third } = S.rankPoints;
  if (end.first === 'A') { a += first; } else if (end.first === 'B') { b += first; }
  if (end.second === 'A') { a += second; } else if (end.second === 'B') { b += second; }
  if (end.third === 'A') { a += third; } else if (end.third === 'B') { b += third; }

  const ultimate = (end.first && end.second && end.third) && (end.first === end.second && end.second === end.third);
  if (ultimate) detail.push(`Ultimate End (${first+second+third} pts sweep)`);

  const adjA = Number(end.adjA||0); const adjB = Number(end.adjB||0);
  if (adjA) { a += adjA; detail.push(`Adj A ${adjA>0?'+':''}${adjA}`); }
  if (adjB) { b += adjB; detail.push(`Adj B ${adjB>0?'+':''}${adjB}`); }

  return { a, b, detail: detail.join('; '), ultimate };
}
function buildCSVRows(teams, ends, cfg){
  const header=["End","A touchers","B touchers","Crossover shot","1st","2nd","3rd","Adj A","Adj B","Notes",`${teams.A} pts`,`${teams.B} pts`,`Detail`];
  const rows=[header];
  const totals = ends.reduce((acc,e)=>{const r=scoreEnd(e,cfg);acc.a+=r.a;acc.b+=r.b;return acc},{a:0,b:0});
  ends.forEach(e=>{const r=scoreEnd(e,cfg);rows.push([e.number,e.aTouchers,e.bTouchers,e.crossoverShot||'',e.first||'',e.second||'',e.third||'',e.adjA||0,e.adjB||0,e.notes||'',r.a,r.b,r.detail])});
  rows.push(["Totals","","","","","","","","","",String(totals.a),String(totals.b),""]);
  return rows;
}
function rowsToCSV(rows){
  const csvEscape=v=>{const s=String(v??"");return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};
  return rows.map(r=>r.map(csvEscape).join(",")).join("\n");
}

export default function App(){
  const [teams, setTeams] = useLocalStorage('jackattack.teams', { A: 'Team A', B: 'Team B' });
  const [cfg, setCfg] = useLocalStorage('jackattack.cfg', DEFAULTS);
  const [meta, setMeta] = useLocalStorage('jackattack.meta', { ends: DEFAULTS.ends, timerSec: 0 });
  const [ends, setEnds] = useLocalStorage('jackattack.ends', []);
  const [history, setHistory] = useState([]);

  useEffect(()=>{const id=setInterval(()=>setMeta(m=>({...m,timerSec:m.timerSec+1})),1000);return()=>clearInterval(id)},[]);
  const timeStr = useMemo(()=>{const s=meta.timerSec;const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;const pad=x=>String(x).padStart(2,'0');return `${pad(h)}:${pad(m)}:${pad(sec)}`},[meta.timerSec]);

  const totals = useMemo(()=>ends.reduce((acc,e)=>{const r=scoreEnd(e,cfg);acc.a+=r.a;acc.b+=r.b;return acc},{a:0,b:0}),[ends,cfg]);

  // --- QUICK WIN: force email to Resend-allowed address ---
  async function sendDirect(){
    const to = "dayne.farley@gmail.com"; // only allowed during trial
    const rows = buildCSVRows(teams, ends, cfg);
    const csv = rowsToCSV(rows);
    const subject = `Final score: ${teams.A} vs ${teams.B}`;
    const filename = `jackattack_${teams.A}_vs_${teams.B}.csv`.replace(/\s+/g,'_');

    try {
      const resp = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, csv, filename })
      });

      const body = await resp.text();
      if (!resp.ok) throw new Error(body);
      alert('Email sent! Check your inbox.');
    } catch (e) {
      alert('Send failed: ' + (e?.message || 'Unknown error'));
    }
  }

  function pushHistory(){setHistory(h=>[...h,{teams:JSON.stringify(teams),cfg:JSON.stringify(cfg),meta:JSON.stringify(meta),ends:JSON.stringify(ends)}].slice(-50))}
  function undo(){const last=history[history.length-1];if(!last)return;setHistory(history.slice(0,-1));setTeams(JSON.parse(last.teams));setCfg(JSON.parse(last.cfg));setMeta(JSON.parse(last.meta));setEnds(JSON.parse(last.ends));}
  function reset(){if(!confirm('Reset match?'))return;pushHistory();setTeams({A:'Team A',B:'Team B'});setCfg(DEFAULTS);setMeta({ends:DEFAULTS.ends,timerSec:0});setEnds([])}

  function addEnd(){pushHistory();setEnds([...ends,{
    number: ends.length+1,
    aTouchers:0,
    bTouchers:0,
    crossoverShot:'None',
    first:'',
    second:'',
    third:'',
    notes:'',
    adjA:0, adjB:0,
  }])}
  function updateEnd(i,patch){pushHistory();setEnds(prev=>prev.map((e,idx)=>idx===i?{...e,...patch}:e))}
  function removeLast(){if(!ends.length)return;pushHistory();setEnds(ends.slice(0,-1))}

  function exportCSV(){
    const header=["End","A touchers","B touchers","Crossover shot","1st","2nd","3rd","Adj A","Adj B","Notes",`${teams.A} pts`,`${teams.B} pts`,`Detail`];
    const rows=[header];
    ends.forEach(e=>{const r=scoreEnd(e,cfg);rows.push([e.number,e.aTouchers,e.bTouchers,e.crossoverShot||'',e.first||'',e.second||'',e.third||'',e.adjA||0,e.adjB||0,e.notes||'',r.a,r.b,r.detail])});
    rows.push(["Totals","","","","","","","","","",String(totals.a),String(totals.b),""]);
    downloadCSV(`jackattack_${teams.A}_vs_${teams.B}.csv`,rows)
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto font-sans">
      <motion.h1 layout className="text-2xl md:text-3xl font-semibold mb-3 flex items-center gap-2">
        <Trophy className="w-6 h-6"/> Jack Attack Scorer
      </motion.h1>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Card>
          <div className="flex items-center justify-between mb-3"><Label>Teams</Label><Button className="text-xs" onClick={()=>{pushHistory();setTeams({A:'Team A',B:'Team B'})}}>Reset</Button></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>A</Label><Input value={teams.A} onChange={e=>{pushHistory();setTeams({...teams,A:e.target.value})}}/></div>
            <div><Label>B</Label><Input value={teams.B} onChange={e=>{pushHistory();setTeams({...teams,B:e.target.value})}}/></div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Button onClick={exportCSV}><Download className="inline w-4 h-4 mr-1"/>Export CSV</Button>
            <Button onClick={sendDirect}><Send className="inline w-4 h-4 mr-1"/>Complete & Send</Button>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3"><Label>Match</Label><div className="text-xs opacity-70 flex items-center gap-2"><Timer className="w-4 h-4"/>{timeStr}</div></div>
          <div className="grid grid-cols-3 gap-2 items-end">
            <div><Label>Total Ends</Label><Input type="number" value={meta.ends} min={1} onChange={e=>{pushHistory();setMeta({...meta,ends:Number(e.target.value)})}}/></div>
            <div><Label>Total {teams.A}</Label><div className="px-3 py-2 rounded-xl border text-sm bg-white">{totals.a}</div></div>
            <div><Label>Total {teams.B}</Label><div className="px-3 py-2 rounded-xl border text-sm bg-white">{totals.b}</div></div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button onClick={addEnd}><Plus className="inline w-4 h-4 mr-1"/>Add End</Button>
            <Button onClick={removeLast}><Minus className="inline w-4 h-4 mr-1"/>Remove Last</Button>
            <Button onClick={undo}><Undo2 className="inline w-4 h-4 mr-1"/>Undo</Button>
            <Button onClick={reset} className="ml-auto"><RefreshCw className="inline w-4 h-4 mr-1"/>Reset Match</Button>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-2"><Label>Scoring Settings</Label><Settings className="w-4 h-4 opacity-60"/></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Toucher (each)</Label><Input type="number" value={cfg.scoring.toucher} onChange={e=>{pushHistory();setCfg({...cfg,scoring:{...cfg.scoring,toucher:Number(e.target.value)}})}}/></div>
            <div><Label>Crossover Shot</Label><Input type="number" value={cfg.scoring.crossoverShot} onChange={e=>{pushHistory();setCfg({...cfg,scoring:{...cfg.scoring,crossoverShot:Number(e.target.value)}})}}/></div>
            <div><Label>1st Shot</Label><Input type="number" value={cfg.scoring.rankPoints.first} onChange={e=>{pushHistory();setCfg({...cfg,scoring:{...cfg.scoring,rankPoints:{...cfg.scoring.rankPoints,first:Number(e.target.value)}}})}}/></div>
            <div><Label>2nd Shot</Label><Input type="number" value={cfg.scoring.rankPoints.second} onChange={e=>{pushHistory();setCfg({...cfg,scoring:{...cfg.scoring,rankPoints:{...cfg.scoring,rankPoints:{...cfg.scoring.rankPoints,second:Number(e.target.value)}}})}}/></div>
            <div><Label>3rd Shot</Label><Input type="number" value={cfg.scoring.rankPoints.third} onChange={e=>{pushHistory();setCfg({...cfg,scoring:{...cfg.scoring,rankPoints:{...cfg.scoring.rankPoints,third:Number(e.target.value)}}})}}/></div>
          </div>
          <div className="text-xs opacity-70 mt-2">Tip: Set Crossover Shot to 0 if your event doesn’t use that bonus.</div>
        </Card>
      </div>

      <Card className="mb-3">
        <div className="flex items-center justify-between">
          <div className="text-xl font-semibold">Scoreboard: {teams.A} {totals.a} — {totals.b} {teams.B}</div>
          <div className="text-sm opacity-70">Ends: {ends.length}/{meta.ends}</div>
        </div>
      </Card>

      <div className="grid gap-3">
        {ends.map((e, idx)=>{
          const r = scoreEnd(e,cfg);
          return (
            <Card key={idx}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold flex items-center gap-2">End {e.number} {r.ultimate && (<span className="text-xs px-2 py-1 border rounded-xl">Ultimate End</span>)}</div>
                <div className="text-sm opacity-70">{teams.A}: +{r.a} | {teams.B}: +{r.b}</div>
              </div>
              <div className="grid md:grid-cols-6 gap-2">
                <div>
                  <Label>{teams.A} Touchers</Label>
                  <Input type="number" value={e.aTouchers} min={0} onChange={ev=>updateEnd(idx,{aTouchers:Number(ev.target.value)})}/>
                </div>
                <div>
                  <Label>{teams.B} Touchers</Label>
                  <Input type="number" value={e.bTouchers} min={0} onChange={ev=>updateEnd(idx,{bTouchers:Number(ev.target.value)})}/>
                </div>
                <div>
                  <Label>Crossover Shot</Label>
                  <select className="w-full px-3 py-2 rounded-xl border text-sm" value={e.crossoverShot} onChange={ev=>updateEnd(idx,{crossoverShot:ev.target.value})}>
                    <option value="None">None</option>
                    <option value="A">{teams.A}</option>
                    <option value="B">{teams.B}</option>
                    <option value="Both">Undecided / Both +3</option>
                  </select>
                </div>
                <div>
                  <Label>1st Shot (final)</Label>
                  <select className="w-full px-3 py-2 rounded-xl border text-sm" value={e.first} onChange={ev=>updateEnd(idx,{first:ev.target.value})}>
                    <option value=""></option>
                    <option value="A">{teams.A}</option>
                    <option value="B">{teams.B}</option>
                  </select>
                </div>
                <div>
                  <Label>2nd Shot (final)</Label>
                  <select className="w-full px-3 py-2 rounded-xl border text-sm" value={e.second} onChange={ev=>updateEnd(idx,{second:ev.target.value})}>
                    <option value=""></option>
                    <option value="A">{teams.A}</option>
                    <option value="B">{teams.B}</option>
                  </select>
                </div>
                <div>
                  <Label>3rd
