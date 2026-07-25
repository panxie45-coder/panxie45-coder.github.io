"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type View = "menu" | "game" | "coop";
type Upgrade = { id: string; title: string; desc: string; icon: string };
type Actor = { x: number; y: number; r: number; hp: number; maxHp: number; color: string; name?: string };
type Enemy = Actor & { speed: number; hit: number };
type Shot = { x: number; y: number; vx: number; vy: number; r: number; damage: number; life: number };
type Gem = { x: number; y: number; value: number };

const UPGRADES: Upgrade[] = [
  { id: "rapid", title: "余烬弹匣", desc: "射击间隔 -18%", icon: "✦" },
  { id: "damage", title: "淬火弹头", desc: "伤害 +30%", icon: "◆" },
  { id: "multi", title: "双生火舌", desc: "额外发射 1 枚弹丸", icon: "⌁" },
  { id: "speed", title: "轻盈步伐", desc: "移动速度 +15%", icon: "➜" },
  { id: "vitality", title: "不灭心火", desc: "最大生命 +25，并回复", icon: "♥" },
  { id: "magnet", title: "拾荒直觉", desc: "拾取范围 +45%", icon: "◎" },
];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export default function Home() {
  const [view, setView] = useState<View>("menu");
  const [paused, setPaused] = useState(false);
  const [level, setLevel] = useState(1);
  const [xp, setXp] = useState(0);
  const [hp, setHp] = useState(100);
  const [kills, setKills] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [choices, setChoices] = useState<Upgrade[] | null>(null);
  const [sound, setSound] = useState(true);
  const [signalMode, setSignalMode] = useState<"host" | "join" | null>(null);
  const [signalIn, setSignalIn] = useState("");
  const [signalOut, setSignalOut] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(false);
  const resetRef = useRef<() => void>(() => {});
  const applyUpgradeRef = useRef<(id: string) => void>(() => {});

  const startGame = useCallback(() => {
    setLevel(1); setXp(0); setHp(100); setKills(0); setSeconds(0);
    setChoices(null); setPaused(false); setView("game");
    setTimeout(() => resetRef.current(), 0);
  }, []);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    if (view !== "game") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 1280, H = 720;
    canvas.width = W; canvas.height = H;
    let raf = 0, last = performance.now(), elapsed = 0, spawnClock = 0, fireClock = 0;
    let active = true, localPaused = false, currentXp = 0, currentLevel = 1, netClock = 0, remoteFireClock = 0, remoteSeen = 0;
    let player: Actor = { x: W / 2, y: H / 2, r: 17, hp: 100, maxHp: 100, color: "#f4c95d" };
    let remote: Actor | null = null;
    let enemies: Enemy[] = [], shots: Shot[] = [], gems: Gem[] = [], particles: {x:number;y:number;vx:number;vy:number;life:number;color:string}[] = [];
    let stats = { speed: 245, damage: 24, interval: .42, multi: 1, magnet: 78 };
    const keys = new Set<string>();
    const pointer = { x: W / 2, y: H / 2, down: false };
    const channel = (window as typeof window & { emberChannel?: RTCDataChannel }).emberChannel;
    if (channel) channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.t === "player") {
          remote = { x: data.x, y: data.y, r: 17, hp: data.hp, maxHp: data.maxHp, color: "#78a99d", name: "伙伴" };
          remoteSeen = performance.now();
        }
      } catch { /* ignore malformed peer packets */ }
    };

    const reset = () => {
      elapsed = 0; spawnClock = 0; fireClock = 0; currentXp = 0; currentLevel = 1;
      player = { x: W / 2, y: H / 2, r: 17, hp: 100, maxHp: 100, color: "#f4c95d" };
      enemies = []; shots = []; gems = []; particles = [];
      stats = { speed: 245, damage: 24, interval: .42, multi: 1, magnet: 78 };
    };
    resetRef.current = reset;
    applyUpgradeRef.current = (id) => {
      if (id === "rapid") stats.interval *= .82;
      if (id === "damage") stats.damage *= 1.3;
      if (id === "multi") stats.multi += 1;
      if (id === "speed") stats.speed *= 1.15;
      if (id === "magnet") stats.magnet *= 1.45;
      if (id === "vitality") { player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 35); }
      localPaused = false;
    };

    const down = (e: KeyboardEvent) => {
      keys.add(e.key.toLowerCase());
      if (e.key === "Escape") setPaused(p => !p);
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const movePointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = (e.clientX - r.left) / r.width * W;
      pointer.y = (e.clientY - r.top) / r.height * H;
      if (e.pointerType === "touch") {
        pointer.down = true;
        const dx = pointer.x - player.x, dy = pointer.y - player.y, m = Math.hypot(dx, dy) || 1;
        if (m > 25) { keys.delete("w"); keys.delete("a"); keys.delete("s"); keys.delete("d"); keys.add(dx > 12 ? "d" : dx < -12 ? "a" : ""); keys.add(dy > 12 ? "s" : dy < -12 ? "w" : ""); }
      }
    };
    const pointerUp = () => { pointer.down = false; keys.delete(""); keys.delete("w"); keys.delete("a"); keys.delete("s"); keys.delete("d"); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    canvas.addEventListener("pointermove", movePointer); canvas.addEventListener("pointerdown", movePointer); window.addEventListener("pointerup", pointerUp);

    const spawnEnemy = () => {
      const side = Math.floor(Math.random() * 4), pad = 35;
      let x = Math.random() * W, y = Math.random() * H;
      if (side === 0) y = -pad; if (side === 1) x = W + pad; if (side === 2) y = H + pad; if (side === 3) x = -pad;
      const elite = Math.random() < Math.min(.18, elapsed / 300);
      const maxHp = (elite ? 90 : 38) * (1 + elapsed / 160);
      enemies.push({ x, y, r: elite ? 24 : 15, hp: maxHp, maxHp, speed: (elite ? 52 : 72) + elapsed * .12, hit: elite ? 22 : 11, color: elite ? "#e15d45" : "#75a99c" });
    };
    const burst = (x:number,y:number,color:string,n=8) => {
      for(let i=0;i<n;i++){ const a=Math.random()*Math.PI*2,s=40+Math.random()*120; particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.35,color}); }
    };
    const levelUp = () => {
      currentLevel++; setLevel(currentLevel);
      const pool = [...UPGRADES].sort(() => Math.random() - .5).slice(0, 3);
      localPaused = true; setChoices(pool);
    };

    const update = (dt: number) => {
      elapsed += dt; setSeconds(Math.floor(elapsed));
      let dx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
      let dy = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
      const dm = Math.hypot(dx, dy) || 1; dx /= dm; dy /= dm;
      player.x = clamp(player.x + dx * stats.speed * dt, 30, W - 30);
      player.y = clamp(player.y + dy * stats.speed * dt, 30, H - 30);
      if (remote && performance.now() - remoteSeen > 3500) remote = null;
      netClock -= dt;
      if (channel?.readyState === "open" && netClock <= 0) {
        netClock = .05;
        channel.send(JSON.stringify({ t:"player", x:player.x, y:player.y, hp:player.hp, maxHp:player.maxHp }));
      }

      spawnClock -= dt;
      if (spawnClock <= 0) { spawnClock = Math.max(.16, .78 - elapsed * .006); spawnEnemy(); }
      fireClock -= dt;
      if (fireClock <= 0 && enemies.length) {
        fireClock = stats.interval;
        const target = enemies.reduce((a,b) => dist(player,a) < dist(player,b) ? a : b);
        const a0 = Math.atan2(target.y-player.y,target.x-player.x);
        for(let i=0;i<stats.multi;i++){ const spread=(i-(stats.multi-1)/2)*.14; const a=a0+spread; shots.push({x:player.x,y:player.y,vx:Math.cos(a)*560,vy:Math.sin(a)*560,r:5,damage:stats.damage,life:1.5}); }
        burst(player.x+Math.cos(a0)*18,player.y+Math.sin(a0)*18,"#f4c95d",3);
      }
      remoteFireClock -= dt;
      if (remote && remoteFireClock <= 0 && enemies.length) {
        remoteFireClock = .55;
        const target = enemies.reduce((a,b) => dist(remote!,a) < dist(remote!,b) ? a : b);
        const a = Math.atan2(target.y-remote.y,target.x-remote.x);
        shots.push({x:remote.x,y:remote.y,vx:Math.cos(a)*540,vy:Math.sin(a)*540,r:5,damage:stats.damage*.72,life:1.5});
      }
      for (const s of shots) { s.x += s.vx*dt; s.y += s.vy*dt; s.life -= dt; }
      shots = shots.filter(s => s.life > 0);
      for (const e of enemies) {
        const target = remote && dist(e,remote) < dist(e,player) ? remote : player;
        const a=Math.atan2(target.y-e.y,target.x-e.x); e.x+=Math.cos(a)*e.speed*dt; e.y+=Math.sin(a)*e.speed*dt;
        if(dist(e,player)<e.r+player.r){ player.hp-=e.hit*dt; setHp(Math.max(0,Math.ceil(player.hp))); }
      }
      for (const s of shots) for (const e of enemies) if(s.life>0&&e.hp>0&&dist(s,e)<s.r+e.r){ e.hp-=s.damage; s.life=0; burst(s.x,s.y,"#fff2ba",4); }
      for (const e of enemies) if(e.hp<=0){ gems.push({x:e.x,y:e.y,value:e.r>20?3:1}); burst(e.x,e.y,e.color,10); setKills(k=>k+1); }
      enemies = enemies.filter(e=>e.hp>0);
      for (const g of gems) {
        const d=dist(g,player); if(d<stats.magnet){ const a=Math.atan2(player.y-g.y,player.x-g.x); g.x+=Math.cos(a)*360*dt; g.y+=Math.sin(a)*360*dt; }
        if(d<player.r+8){ g.value=0; currentXp++; const need=6+currentLevel*4; setXp(currentXp/need*100); if(currentXp>=need){currentXp=0;setXp(0);levelUp();} }
      }
      gems=gems.filter(g=>g.value>0);
      for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;p.vx*=.96;p.vy*=.96;} particles=particles.filter(p=>p.life>0);
      if(player.hp<=0){ localPaused=true; setPaused(true); }
    };

    const draw = () => {
      ctx.fillStyle="#111814"; ctx.fillRect(0,0,W,H);
      ctx.strokeStyle="rgba(205,224,187,.055)"; ctx.lineWidth=1;
      for(let x=0;x<W;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
      for(let y=0;y<H;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
      ctx.fillStyle="rgba(244,201,93,.035)";
      for(let i=0;i<24;i++){ const x=(i*193)%W,y=(i*317)%H;ctx.beginPath();ctx.arc(x,y,18+(i%4)*9,0,Math.PI*2);ctx.fill();}
      for(const g of gems){ctx.save();ctx.translate(g.x,g.y);ctx.rotate(performance.now()/600);ctx.fillStyle="#9ed9cc";ctx.fillRect(-6,-6,12,12);ctx.restore();}
      for(const p of particles){ctx.globalAlpha=Math.max(0,p.life*2);ctx.fillStyle=p.color;ctx.fillRect(p.x-2,p.y-2,4,4);} ctx.globalAlpha=1;
      for(const s of shots){ctx.fillStyle="#fff2ba";ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();}
      for(const e of enemies){
        ctx.save();ctx.translate(e.x,e.y);ctx.rotate(Math.atan2(player.y-e.y,player.x-e.x));
        ctx.fillStyle=e.color;ctx.beginPath();ctx.moveTo(e.r,0);ctx.lineTo(-e.r*.7,e.r*.8);ctx.lineTo(-e.r*.45,0);ctx.lineTo(-e.r*.7,-e.r*.8);ctx.closePath();ctx.fill();
        if(e.r>20){ctx.fillStyle="#f4c95d";ctx.fillRect(-7,-3,8,6);} ctx.restore();
      }
      ctx.shadowColor="#f4c95d";ctx.shadowBlur=22;ctx.fillStyle=player.color;ctx.beginPath();ctx.arc(player.x,player.y,player.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
      ctx.strokeStyle="#242e27";ctx.lineWidth=7;ctx.beginPath();ctx.arc(player.x,player.y,25,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle="#f4c95d";ctx.beginPath();ctx.arc(player.x,player.y,25,-Math.PI/2,-Math.PI/2+Math.PI*2*(player.hp/player.maxHp));ctx.stroke();
      if(remote){
        ctx.shadowColor="#78a99d";ctx.shadowBlur=18;ctx.fillStyle=remote.color;ctx.beginPath();ctx.arc(remote.x,remote.y,remote.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
        ctx.fillStyle="#c7d8d0";ctx.font="700 11px monospace";ctx.textAlign="center";ctx.fillText("伙伴",remote.x,remote.y-27);
      }
    };

    const loop = (now:number) => {
      const dt=Math.min(.033,(now-last)/1000);last=now;
      if(active&&!pausedRef.current&&!localPaused) update(dt);
      draw(); raf=requestAnimationFrame(loop);
    };
    raf=requestAnimationFrame(loop);
    return()=>{active=false;cancelAnimationFrame(raf);window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);window.removeEventListener("pointerup",pointerUp);canvas.removeEventListener("pointermove",movePointer);canvas.removeEventListener("pointerdown",movePointer);};
  }, [view]);

  const chooseUpgrade = (u: Upgrade) => {
    applyUpgradeRef.current(u.id); setChoices(null);
  };
  const formatTime = (s:number) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const createOffer = async () => {
    setSignalMode("host"); setSignalOut("正在生成邀请…");
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    const dc = pc.createDataChannel("ember");
    (window as typeof window & { emberChannel?: RTCDataChannel; emberRole?: string }).emberChannel = dc;
    (window as typeof window & { emberRole?: string }).emberRole = "host";
    const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
    await new Promise<void>(r=>{ if(pc.iceGatheringState==="complete")r(); else pc.onicegatheringstatechange=()=>pc.iceGatheringState==="complete"&&r(); });
    setSignalOut(btoa(JSON.stringify(pc.localDescription)));
    (window as typeof window & { emberPeer?: RTCPeerConnection }).emberPeer = pc;
  };
  const acceptSignal = async () => {
    try {
      if(signalMode==="host"){
        const pc=(window as typeof window & { emberPeer?: RTCPeerConnection }).emberPeer;
        if(!pc) return; await pc.setRemoteDescription(JSON.parse(atob(signalIn))); setSignalOut("连接完成！首版联机通道已建立。");
      } else {
        const pc=new RTCPeerConnection({ iceServers:[{urls:"stun:stun.l.google.com:19302"}] });
        pc.ondatachannel = (event) => {
          (window as typeof window & { emberChannel?: RTCDataChannel }).emberChannel = event.channel;
        };
        (window as typeof window & { emberRole?: string }).emberRole = "join";
        await pc.setRemoteDescription(JSON.parse(atob(signalIn))); const ans=await pc.createAnswer();await pc.setLocalDescription(ans);
        await new Promise<void>(r=>{if(pc.iceGatheringState==="complete")r();else pc.onicegatheringstatechange=()=>pc.iceGatheringState==="complete"&&r();});
        setSignalOut(btoa(JSON.stringify(pc.localDescription))); (window as typeof window & { emberPeer?: RTCPeerConnection }).emberPeer=pc;
      }
    } catch { setSignalOut("邀请码无效，请检查是否完整复制。"); }
  };

  return (
    <main className="shell">
      <header className="topbar">
        <button className="brand" onClick={()=>setView("menu")} aria-label="返回主菜单"><span>余烬</span><b>协议</b></button>
        <div className="status"><i /> 测试版本 0.1</div>
        <button className="iconBtn" onClick={()=>setSound(s=>!s)} aria-label="切换声音">{sound?"◖))":"◖×"}</button>
      </header>

      {view==="menu" && <section className="menu">
        <div className="menuArt" aria-hidden="true"><div className="orb"><span>✦</span></div><div className="orbit o1"/><div className="orbit o2"/></div>
        <div className="eyebrow">CO-OP ROGUELITE · 生存实验</div>
        <h1>守住最后一簇<br/><em>不肯熄灭的火</em></h1>
        <p className="lede">踏入不断收缩的荒原，和伙伴一起把每次失败<br className="desktop"/>炼成下一局的武器。</p>
        <div className="actions">
          <button className="primary" onClick={startGame}><span>开始远征</span><small>单人 · 立即进入</small></button>
          <button className="secondary" onClick={()=>setView("coop")}><span>双人联机</span><small>WebRTC 点对点</small></button>
        </div>
        <div className="controls"><span><kbd>WASD</kbd> 移动</span><span><kbd>自动</kbd> 瞄准射击</span><span><kbd>ESC</kbd> 暂停</span></div>
      </section>}

      {view==="coop" && <section className="coop">
        <button className="back" onClick={()=>{setView("menu");setSignalMode(null);setSignalOut("");}}>← 返回营地</button>
        <div className="coopCard">
          <div className="eyebrow">EMBER LINK · 实验性联机</div>
          <h2>点燃同一簇火</h2>
          <p>无需账号。邀请好友交换一次连接码，即可建立加密的点对点通道。</p>
          {!signalMode ? <div className="modeGrid">
            <button onClick={createOffer}><b>创建队伍</b><span>生成邀请码，等待伙伴</span></button>
            <button onClick={()=>setSignalMode("join")}><b>加入队伍</b><span>粘贴队长的邀请码</span></button>
          </div> : <>
            <label>{signalMode==="host"?"将下方邀请码发给伙伴":"粘贴队长发来的邀请码"}</label>
            {signalMode==="join" && <textarea value={signalIn} onChange={e=>setSignalIn(e.target.value)} placeholder="在此粘贴邀请码…" />}
            {signalMode==="host" && signalOut && <textarea readOnly value={signalOut} onFocus={e=>e.currentTarget.select()} />}
            {signalMode==="host" && <><label>伙伴返回连接码后，粘贴到这里</label><textarea value={signalIn} onChange={e=>setSignalIn(e.target.value)} placeholder="粘贴伙伴返回的连接码…" /></>}
            <button className="connect" onClick={acceptSignal}>{signalMode==="host"?"完成连接":"生成返回码"}</button>
            {signalMode==="join" && signalOut && <><label>把返回码发给队长</label><textarea readOnly value={signalOut} onFocus={e=>e.currentTarget.select()} /></>}
          </>}
          <div className="labNote"><span>实验室提示</span> 联机通道建立后，双方进入远征即可看见彼此并获得队友火力支援。首版采用轻量同步，两端的敌群规模会略有不同。</div>
          <button className="primary compact" onClick={startGame}><span>先独自出发</span></button>
        </div>
      </section>}

      {view==="game" && <section className="gameWrap">
        <div className="hud">
          <div className="stat"><span>存活时间</span><b>{formatTime(seconds)}</b></div>
          <div className="levelBadge"><small>LEVEL</small><b>{level}</b></div>
          <div className="stat right"><span>已净化</span><b>{kills}<small> 只</small></b></div>
        </div>
        <div className="canvasFrame">
          <canvas ref={canvasRef} aria-label="余烬协议游戏画面"/>
          <div className="health"><span>火种完整度</span><div><i style={{width:`${hp}%`}}/></div><b>{hp}</b></div>
          <div className="xp"><i style={{width:`${xp}%`}}/></div>
          <div className="mobileHint">按住并拖动来移动</div>
        </div>
        <button className="quit" onClick={()=>setView("menu")}>结束远征</button>
        {choices && <div className="overlay">
          <div className="upgradePanel"><div className="eyebrow">火种共鸣</div><h2>选择一项遗物</h2><p>每次选择，都将改变这趟远征。</p>
            <div className="upgradeGrid">{choices.map((u,i)=><button key={u.id} onClick={()=>chooseUpgrade(u)}><small>0{i+1}</small><i>{u.icon}</i><b>{u.title}</b><span>{u.desc}</span></button>)}</div>
          </div>
        </div>}
        {paused && !choices && <div className="overlay"><div className="pausePanel"><div className="eyebrow">{hp<=0?"远征终止":"火焰暂歇"}</div><h2>{hp<=0?"火种熄灭了":"游戏已暂停"}</h2><p>{hp<=0?`你坚持了 ${formatTime(seconds)}，净化了 ${kills} 只荒兽。`:"休息一下，荒原会等你。"}</p>
          {hp>0&&<button className="primary compact" onClick={()=>setPaused(false)}><span>继续远征</span></button>}
          {hp<=0&&<button className="primary compact" onClick={startGame}><span>再次点火</span></button>}
          <button className="textBtn" onClick={()=>setView("menu")}>返回主菜单</button></div></div>}
      </section>}
      <footer><span>EMBER PROTOCOL</span><span>失败不是终点，是配方。</span></footer>
    </main>
  );
}
