// Boxwise: number every moving box, list what is inside, print QR labels and search for anything.
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { idbDel, idbGet, idbSet, shrinkImage } from "./lib/idb";
import { uid, useStored } from "./lib/store";
import { QR } from "./ui/QR";

type Room = { id: string; name: string; color: string };
type Status = "packed" | "moved" | "unpacked";
type Box = { id: string; no: number; room: string; items: string; fragile: boolean; status: Status; photo: boolean };

const T = "boxwise";
const ROOM_COLORS = ["#FF6C2F", "#3255A4", "#00A95C", "#FF48B0", "#765BA7", "#00838A", "#A26500", "#C0343F"];
const SAMPLE_ROOMS: Room[] = ["Kitchen", "Living room", "Bedroom", "Bathroom", "Office", "Kids' room"].map((name, i) => ({ id: `r${i}`, name, color: ROOM_COLORS[i] }));
const SAMPLE_BOXES: Box[] = [
  { id: "b1", no: 1, room: "r0", items: "Kettle\nCoffee maker\nMugs (6)\nTea and coffee", fragile: true, status: "packed", photo: false },
  { id: "b2", no: 2, room: "r0", items: "Pans\nBaking trays\nWooden spoons", fragile: false, status: "packed", photo: false },
  { id: "b3", no: 3, room: "r2", items: "Winter duvet\nSpare pillows\nBed sheets", fragile: false, status: "moved", photo: false },
  { id: "b4", no: 4, room: "r4", items: "Laptop charger\nPrinter cables\nPassports and documents folder\nHard drive", fragile: true, status: "packed", photo: false },
];
const STATUS: Record<Status, { label: string; cls: string }> = { packed: { label: "Packed", cls: "" }, moved: { label: "At new home", cls: "warn" }, unpacked: { label: "Unpacked", cls: "good" } };

function Photo({ id }: { id: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => { idbGet(`${T}:photo:${id}`).then(v => setSrc(v)); }, [id]);
  return src ? <img className="bw-photo" src={src} alt="What is in this box" /> : null;
}

export default function Boxwise() {
  const [rooms, setRooms] = useStored<Room[]>(T, "rooms", SAMPLE_ROOMS);
  const [boxes, setBoxes] = useStored<Box[]>(T, "boxes", SAMPLE_BOXES);
  const [moveName, setMoveName] = useStored(T, "moveName", "Our move");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"boxes" | "labels" | "rooms">("boxes");
  const [params, setParams] = useSearchParams();
  const focus = Number(params.get("box")) || 0;
  const focusRef = useRef<HTMLElement>(null);
  const [draft, setDraft] = useState({ room: rooms[0]?.id ?? "", items: "", fragile: false });
  const [photoErr, setPhotoErr] = useState("");

  useEffect(() => { if (focus) focusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [focus]);

  const room = (id: string) => rooms.find(r => r.id === id) ?? { id: "", name: "No room", color: "#555C78" };
  const nextNo = boxes.reduce((m, b) => Math.max(m, b.no), 0) + 1;
  const term = q.trim().toLowerCase();
  const hits = term ? boxes.filter(b => b.items.toLowerCase().includes(term) || room(b.room).name.toLowerCase().includes(term) || String(b.no) === term) : boxes;
  const sorted = [...hits].sort((a, b) => a.no - b.no);
  const labelUrl = (no: number) => `${location.origin}/t/boxwise?box=${no}`;
  const counts = { packed: 0, moved: 0, unpacked: 0 } as Record<Status, number>;
  boxes.forEach(b => counts[b.status]++);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.items.trim()) return;
    setBoxes([...boxes, { id: uid(), no: nextNo, room: draft.room, items: draft.items.trim(), fragile: draft.fragile, status: "packed", photo: false }]);
    setDraft({ ...draft, items: "", fragile: false });
  };
  const update = (id: string, patch: Partial<Box>) => setBoxes(boxes.map(b => (b.id === id ? { ...b, ...patch } : b)));
  const addPhoto = async (b: Box, f?: File) => {
    if (!f) return;
    try { await idbSet(`${T}:photo:${b.id}`, await shrinkImage(f)); update(b.id, { photo: true }); setPhotoErr(""); }
    catch (err) { setPhotoErr((err as Error).message); }
  };
  const remove = (b: Box) => { setBoxes(boxes.filter(x => x.id !== b.id)); idbDel(`${T}:photo:${b.id}`); };
  const highlight = (text: string) => {
    if (!term) return text;
    const i = text.toLowerCase().indexOf(term);
    return i < 0 ? text : <>{text.slice(0, i)}<mark>{text.slice(i, i + term.length)}</mark>{text.slice(i + term.length)}</>;
  };

  return (
    <div className="stack">
      <section className="panel no-print">
        <div className="row" style={{ alignItems: "center", gap: 28 }}>
          <label className="field" style={{ flex: "1 1 220px" }}><span>Move</span><input id="bw-move" className="input" value={moveName} onChange={e => setMoveName(e.target.value)} /></label>
          <div className="stat"><b>{boxes.length}</b><span>Boxes</span></div>
          <div className="stat"><b>{counts.moved + counts.unpacked}</b><span>At new home</span></div>
          <div className="stat"><b>{counts.unpacked}</b><span>Unpacked</span></div>
        </div>
        <div className="bw-progress" aria-hidden="true">
          <span style={{ flex: counts.unpacked, background: "var(--good)" }} /><span style={{ flex: counts.moved, background: "var(--warn)" }} /><span style={{ flex: counts.packed, background: "var(--line)" }} />
        </div>
      </section>

      <div className="row no-print" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <div className="seg-mini">
          <button aria-pressed={view === "boxes"} onClick={() => setView("boxes")}>Boxes</button>
          <button aria-pressed={view === "labels"} onClick={() => setView("labels")}>Print labels</button>
          <button aria-pressed={view === "rooms"} onClick={() => setView("rooms")}>Rooms</button>
        </div>
        {view === "boxes" && <label className="bw-search"><span className="eyebrow">Where is the</span><input id="bw-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="kettle" /></label>}
      </div>

      {view === "boxes" && (
        <>
          <section className="panel no-print">
            <h2>Pack box {nextNo}</h2>
            <form className="row" onSubmit={add}>
              <label className="field" style={{ flexBasis: 160 }}><span>Room</span><select id="bw-room" className="input" value={draft.room} onChange={e => setDraft({ ...draft, room: e.target.value })}>{rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
              <label className="field" style={{ flex: "3 1 260px" }}><span>What is inside, one item per line</span><textarea id="bw-items" className="input" rows={3} value={draft.items} onChange={e => setDraft({ ...draft, items: e.target.value })} placeholder={"Plates\nGlasses\nCutlery tray"} /></label>
              <div className="stack" style={{ gap: 10, flex: "0 0 auto" }}>
                <label className="check"><input id="bw-fragile" type="checkbox" checked={draft.fragile} onChange={e => setDraft({ ...draft, fragile: e.target.checked })} />Fragile</label>
                <button className="btn primary" type="submit" disabled={!draft.items.trim()}>Add box {nextNo}</button>
              </div>
            </form>
          </section>
          {photoErr && <p className="pill bad">{photoErr}</p>}
          {term && <p className="note">{hits.length ? `Found in ${hits.length} ${hits.length === 1 ? "box" : "boxes"}.` : `Nothing called “${q}” in any box.`}</p>}
          <div className="bw-grid">
            {sorted.map(b => {
              const r = room(b.room);
              return (
                <article key={b.id} ref={b.no === focus ? focusRef : undefined} className={"bw-box" + (b.no === focus ? " focus" : "")} style={{ borderTopColor: r.color }}>
                  <header>
                    <span className="bw-no" style={{ color: r.color }}>{b.no}</span>
                    <div>
                      <strong>{highlight(r.name)}</strong>
                      <div className="row" style={{ gap: 6, marginTop: 4 }}>
                        <span className={"pill " + STATUS[b.status].cls}>{STATUS[b.status].label}</span>
                        {b.fragile && <span className="pill bad">Fragile</span>}
                      </div>
                    </div>
                  </header>
                  {b.photo && <Photo id={b.id} />}
                  <ul>{b.items.split("\n").filter(Boolean).map((it, i) => <li key={i}>{highlight(it)}</li>)}</ul>
                  <footer className="row" style={{ gap: 6 }}>
                    <select className="input" style={{ width: "auto", padding: "5px 8px", fontSize: 13 }} aria-label={`Status of box ${b.no}`} value={b.status} onChange={e => update(b.id, { status: e.target.value as Status })}>
                      {(Object.keys(STATUS) as Status[]).map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
                    </select>
                    <label className="btn ghost small">{b.photo ? "New photo" : "Add photo"}<input type="file" accept="image/*" hidden onChange={e => addPhoto(b, e.target.files?.[0])} /></label>
                    <button className="btn ghost small danger" onClick={() => remove(b)}>Delete</button>
                  </footer>
                  {b.no === focus && <button className="btn small" onClick={() => setParams({})}>Show all boxes</button>}
                </article>
              );
            })}
          </div>
          {boxes.length === 0 && <p className="empty-note">No boxes yet. Pack box 1 above.</p>}
        </>
      )}

      {view === "labels" && (
        <>
          <div className="row no-print" style={{ alignItems: "center", justifyContent: "space-between" }}>
            <p className="note" style={{ maxWidth: "60ch" }}>Print on A4 and tape one label to two sides of each box. Scanning the code on this phone opens that box's list.</p>
            <button className="btn primary" onClick={() => window.print()} disabled={!boxes.length}>Print labels</button>
          </div>
          <div className="bw-labels">
            {[...boxes].sort((a, b) => a.no - b.no).map(b => {
              const r = room(b.room);
              const items = b.items.split("\n").filter(Boolean);
              return (
                <div key={b.id} className="bw-label">
                  <div className="bw-band" style={{ background: r.color }}>{r.name}</div>
                  <div className="bw-label-body">
                    <div>
                      <div className="bw-label-no">{b.no}</div>
                      <p className="bw-label-move">{moveName}</p>
                      {b.fragile && <p className="bw-fragile">Fragile</p>}
                    </div>
                    <QR text={labelUrl(b.no)} size={92} />
                  </div>
                  <p className="bw-label-items">{items.slice(0, 5).join(" · ")}{items.length > 5 ? ` +${items.length - 5} more` : ""}</p>
                </div>
              );
            })}
          </div>
        </>
      )}

      {view === "rooms" && (
        <section className="panel" style={{ maxWidth: 560 }}>
          <h2>Rooms</h2>
          <div className="stack" style={{ gap: 8 }}>
            {rooms.map(r => (
              <div key={r.id} className="row" style={{ alignItems: "center" }}>
                <input id={`bw-r-${r.id}`} className="input" style={{ flex: 1 }} value={r.name} aria-label="Room name" onChange={e => setRooms(rooms.map(x => x.id === r.id ? { ...x, name: e.target.value } : x))} />
                <div className="row" style={{ gap: 4 }}>{ROOM_COLORS.map(c => <button key={c} className="bw-swatch" aria-label="Colour" aria-pressed={r.color === c} style={{ background: c }} onClick={() => setRooms(rooms.map(x => x.id === r.id ? { ...x, color: c } : x))} />)}</div>
                <span className="note num">{boxes.filter(b => b.room === r.id).length} boxes</span>
              </div>
            ))}
            <div><button className="btn small" onClick={() => setRooms([...rooms, { id: uid(), name: "New room", color: ROOM_COLORS[rooms.length % ROOM_COLORS.length] }])}>Add a room</button></div>
          </div>
        </section>
      )}

      <style>{`
        .bw-progress{display:flex;height:8px;border-radius:4px;overflow:hidden;margin-top:16px;background:var(--line)}
        .bw-search{display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:0 16px;flex:1 1 260px;max-width:420px}
        .bw-search input{flex:1;min-width:0;border:0;background:transparent;padding:10px 0;outline:none;font-size:16px;font-weight:600}
        .bw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px}
        .bw-box{background:var(--surface);border-radius:10px;box-shadow:var(--shadow);border-top:6px solid;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
        .bw-box.focus{outline:3px solid var(--accent);outline-offset:3px}
        .bw-box header{display:flex;gap:14px;align-items:center}
        .bw-no{font-family:var(--serif);font-size:52px;line-height:.9;min-width:48px}
        .bw-box ul{margin:0;padding-left:18px;display:grid;gap:2px;font-size:15px}
        .bw-box mark{background:#FFE800;color:#151933;border-radius:2px;padding:0 2px}
        .bw-box footer{margin-top:auto;padding-top:8px;border-top:1px solid var(--line)}
        .bw-photo{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px}
        .bw-swatch{width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer}
        .bw-swatch[aria-pressed="true"]{border-color:var(--ink)}
        .bw-labels{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
        .bw-label{background:#fff;color:#151933;border:2px solid #151933;border-radius:6px;overflow:hidden;break-inside:avoid}
        .bw-band{color:#fff;font-weight:700;font-size:18px;padding:6px 12px;letter-spacing:.02em;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .bw-label-body{display:flex;justify-content:space-between;align-items:center;padding:10px 12px 4px}
        .bw-label-no{font-family:var(--serif);font-size:74px;line-height:.9}
        .bw-label-move{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#555C78}
        .bw-fragile{margin-top:4px;display:inline-block;border:2px solid #C0343F;color:#C0343F;font-weight:800;padding:0 8px;letter-spacing:.14em;text-transform:uppercase;font-size:13px}
        .bw-label-items{padding:4px 12px 12px;font-size:13px;line-height:1.4}
        .qr svg{width:100%;height:100%;display:block}
        @media print{.bw-labels{grid-template-columns:1fr 1fr;gap:8mm}.bw-label{border-width:1.5px}}
      `}</style>
    </div>
  );
}
