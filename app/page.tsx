"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { joinRoom } from "trystero";
import { EmberAudioEngine, type SoundCue } from "./audio";

type View = "menu" | "game" | "coop";
type Upgrade = { id: string; title: string; desc: string; icon: string };
type Actor = { x: number; y: number; r: number; hp: number; maxHp: number; color: string; name?: string };
type Enemy = Actor & { speed: number; hit: number };
type Shot = { x: number; y: number; vx: number; vy: number; r: number; damage: number; life: number };
type Gem = { x: number; y: number; value: number };
type NetPayload =
  | { t: "hello" }
  | { t: "start" }
  | { t: "player"; x: number; y: number; hp: number; maxHp: number };
type NetBridge = {
  roomId: string;
  role: "host" | "join";
  room: ReturnType<typeof joinRoom>;
  send: (data: NetPayload) => Promise<void>;
  subscribe: (handler: (data: NetPayload) => void) => () => void;
  connected: () => boolean;
};

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
const normalizeRoomCode = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
const newRoomCode = () => `EMBER-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().slice(0, 7)}`;

async function getRelayServers(): Promise<RTCIceServer[]> {
  try {
    const username = `${Math.floor(Date.now() / 1000) + 86400}:ember-protocol`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("openrelayprojectsecret"),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );
    const signature = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(username)),
    );
    const credential = btoa(String.fromCharCode(...signature));
    return [
      {
        urls: [
          "turn:staticauth.openrelay.metered.ca:80?transport=udp",
          "turn:staticauth.openrelay.metered.ca:80?transport=tcp",
          "turn:staticauth.openrelay.metered.ca:443?transport=tcp",
          "turns:staticauth.openrelay.metered.ca:443?transport=tcp",
        ],
        username,
        credential,
      },
    ];
  } catch {
    return [];
  }
}

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
  const [musicVolume, setMusicVolume] = useState(42);
  const [sfxVolume, setSfxVolume] = useState(72);
  const [audioOpen, setAudioOpen] = useState(false);
  const [signalMode, setSignalMode] = useState<"host" | "join" | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "connecting" | "waiting" | "connected" | "error">("idle");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [peerCount, setPeerCount] = useState(0);
  const [latency, setLatency] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(false);
  const resetRef = useRef<() => void>(() => {});
  const applyUpgradeRef = useRef<(id: string) => void>(() => {});
  const netRef = useRef<NetBridge | null>(null);
  const audioRef = useRef<EmberAudioEngine | null>(null);

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new EmberAudioEngine({
        enabled: sound,
        musicVolume: musicVolume / 100,
        sfxVolume: sfxVolume / 100,
      });
    }
    return audioRef.current;
  }, [musicVolume, sfxVolume, sound]);

  const wakeAudio = useCallback((cue?: SoundCue) => {
    const audio = getAudio();
    void audio.unlock().then(() => {
      if (cue) audio.play(cue);
    });
  }, [getAudio]);

  const startGame = useCallback(() => {
    wakeAudio("start");
    setLevel(1); setXp(0); setHp(100); setKills(0); setSeconds(0);
    setChoices(null); setPaused(false); setView("game");
    setTimeout(() => resetRef.current(), 0);
  }, [wakeAudio]);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem("ember-audio") || "{}") as {
          enabled?: boolean;
          music?: number;
          sfx?: number;
        };
        if (typeof saved.enabled === "boolean") setSound(saved.enabled);
        if (typeof saved.music === "number") setMusicVolume(clamp(saved.music, 0, 100));
        if (typeof saved.sfx === "number") setSfxVolume(clamp(saved.sfx, 0, 100));
      } catch {
        // Invalid local preferences should never prevent the game from starting.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    audio?.setEnabled(sound);
    audio?.setMusicVolume(musicVolume / 100);
    audio?.setSfxVolume(sfxVolume / 100);
    try {
      localStorage.setItem("ember-audio", JSON.stringify({ enabled: sound, music: musicVolume, sfx: sfxVolume }));
    } catch {
      // Audio still works when a browser blocks persistent storage.
    }
  }, [musicVolume, sfxVolume, sound]);

  useEffect(() => {
    audioRef.current?.setScene(view === "game" ? (paused || choices ? "pause" : "game") : "menu");
  }, [choices, paused, view]);

  useEffect(() => () => audioRef.current?.destroy(), []);

  const leaveRoom = useCallback(async () => {
    const activeRoom = netRef.current;
    netRef.current = null;
    if (activeRoom) await activeRoom.room.leave();
    setPeerCount(0);
    setLatency(null);
    setConnectionStatus("idle");
    setSignalMode(null);
    setRoomCode("");
    setShareLink("");
  }, []);

  const connectToRoom = useCallback(async (rawCode: string, role: "host" | "join") => {
    const code = normalizeRoomCode(rawCode);
    if (!code) return;
    if (netRef.current) await netRef.current.room.leave();
    setView("coop");
    setSignalMode(role);
    setRoomCode(code);
    setPeerCount(0);
    setLatency(null);
    setConnectionStatus("connecting");
    setConnectionMessage(role === "host" ? "正在建立房间…" : "正在寻找队长…");
    setShareLink(role === "host" ? `${location.origin}${location.pathname}?room=${encodeURIComponent(code)}` : "");

    try {
      const turnConfig = await getRelayServers();
      const room = joinRoom(
        {
          appId: "ember-protocol-v2",
          password: `ember-link-${code}`,
          relayConfig: { redundancy: 5, warnOnRelayFailure: false },
          turnConfig,
        },
        code,
        {
          onJoinError: ({ error }) => {
            setConnectionStatus("error");
            setConnectionMessage(error || "当前网络无法建立联机，请稍后重试。");
          },
        },
      );
      const gameplay = room.makeAction<NetPayload>("ember-game-v2");
      const listeners = new Set<(data: NetPayload) => void>();
      const bridge: NetBridge = {
        roomId: code,
        role,
        room,
        send: (data) => gameplay.send(data),
        subscribe: (handler) => {
          listeners.add(handler);
          return () => listeners.delete(handler);
        },
        connected: () => Object.keys(room.getPeers()).length > 0,
      };
      netRef.current = bridge;
      gameplay.onMessage = (data) => {
        listeners.forEach((listener) => listener(data));
        if (data.t === "start" && role === "join") startGame();
      };
      room.onPeerJoin = (peerId) => {
        wakeAudio("connected");
        setPeerCount(Object.keys(room.getPeers()).length);
        setConnectionStatus("connected");
        setConnectionMessage("伙伴已连接，可以一起出发。");
        void gameplay.send({ t: "hello" }, { target: peerId });
        void room.ping(peerId).then((ms) => setLatency(Math.round(ms))).catch(() => setLatency(null));
      };
      room.onPeerLeave = () => {
        const count = Object.keys(room.getPeers()).length;
        setPeerCount(count);
        setLatency(null);
        setConnectionStatus(count ? "connected" : "waiting");
        setConnectionMessage(count ? "伙伴已连接。" : "伙伴暂时离线，正在等待重连…");
      };
      setConnectionStatus("waiting");
      setConnectionMessage(role === "host" ? "房间已创建，等待伙伴点击链接…" : "已进入房间，正在与队长建立连接…");
    } catch (error) {
      setConnectionStatus("error");
      setConnectionMessage(error instanceof Error ? error.message : "联机初始化失败，请重试。");
    }
  }, [startGame, wakeAudio]);

  useEffect(() => {
    const incoming = normalizeRoomCode(new URLSearchParams(location.search).get("room") || "");
    if (!incoming) return;
    const timer = window.setTimeout(() => void connectToRoom(incoming, "join"), 0);
    return () => window.clearTimeout(timer);
  }, [connectToRoom]);

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
    const network = netRef.current;
    const audio = audioRef.current;
    const unsubscribeNetwork = network?.subscribe((data) => {
      if (data.t === "player") {
        remote = { x: data.x, y: data.y, r: 17, hp: data.hp, maxHp: data.maxHp, color: "#78a99d", name: "伙伴" };
        remoteSeen = performance.now();
      }
    });

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
      audio?.play("upgrade");
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
      audio?.play("level");
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
      if (network?.connected() && netClock <= 0) {
        netClock = .05;
        void network.send({ t:"player", x:player.x, y:player.y, hp:player.hp, maxHp:player.maxHp });
      }

      spawnClock -= dt;
      if (spawnClock <= 0) { spawnClock = Math.max(.16, .78 - elapsed * .006); spawnEnemy(); }
      fireClock -= dt;
      if (fireClock <= 0 && enemies.length) {
        fireClock = stats.interval;
        const target = enemies.reduce((a,b) => dist(player,a) < dist(player,b) ? a : b);
        const a0 = Math.atan2(target.y-player.y,target.x-player.x);
        for(let i=0;i<stats.multi;i++){ const spread=(i-(stats.multi-1)/2)*.14; const a=a0+spread; shots.push({x:player.x,y:player.y,vx:Math.cos(a)*560,vy:Math.sin(a)*560,r:5,damage:stats.damage,life:1.5}); }
        audio?.play("shot");
        burst(player.x+Math.cos(a0)*18,player.y+Math.sin(a0)*18,"#f4c95d",3);
      }
      remoteFireClock -= dt;
      if (remote && remoteFireClock <= 0 && enemies.length) {
        remoteFireClock = .55;
        const target = enemies.reduce((a,b) => dist(remote!,a) < dist(remote!,b) ? a : b);
        const a = Math.atan2(target.y-remote.y,target.x-remote.x);
        shots.push({x:remote.x,y:remote.y,vx:Math.cos(a)*540,vy:Math.sin(a)*540,r:5,damage:stats.damage*.72,life:1.5});
        audio?.play("ally-shot");
      }
      for (const s of shots) { s.x += s.vx*dt; s.y += s.vy*dt; s.life -= dt; }
      shots = shots.filter(s => s.life > 0);
      for (const e of enemies) {
        const target = remote && dist(e,remote) < dist(e,player) ? remote : player;
        const a=Math.atan2(target.y-e.y,target.x-e.x); e.x+=Math.cos(a)*e.speed*dt; e.y+=Math.sin(a)*e.speed*dt;
        if(dist(e,player)<e.r+player.r){ player.hp-=e.hit*dt; setHp(Math.max(0,Math.ceil(player.hp))); audio?.play("hurt"); }
      }
      for (const s of shots) for (const e of enemies) if(s.life>0&&e.hp>0&&dist(s,e)<s.r+e.r){ e.hp-=s.damage; s.life=0; audio?.play("hit"); burst(s.x,s.y,"#fff2ba",4); }
      for (const e of enemies) if(e.hp<=0){ gems.push({x:e.x,y:e.y,value:e.r>20?3:1}); audio?.play("kill"); burst(e.x,e.y,e.color,10); setKills(k=>k+1); }
      enemies = enemies.filter(e=>e.hp>0);
      for (const g of gems) {
        const d=dist(g,player); if(d<stats.magnet){ const a=Math.atan2(player.y-g.y,player.x-g.x); g.x+=Math.cos(a)*360*dt; g.y+=Math.sin(a)*360*dt; }
        if(d<player.r+8){ g.value=0; audio?.play("pickup"); currentXp++; const need=6+currentLevel*4; setXp(currentXp/need*100); if(currentXp>=need){currentXp=0;setXp(0);levelUp();} }
      }
      gems=gems.filter(g=>g.value>0);
      for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;p.vx*=.96;p.vy*=.96;} particles=particles.filter(p=>p.life>0);
      if(player.hp<=0){ audio?.play("game-over"); localPaused=true; setPaused(true); }
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
    return()=>{active=false;unsubscribeNetwork?.();cancelAnimationFrame(raf);window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);window.removeEventListener("pointerup",pointerUp);canvas.removeEventListener("pointermove",movePointer);canvas.removeEventListener("pointerdown",movePointer);};
  }, [view]);

  const chooseUpgrade = (u: Upgrade) => {
    applyUpgradeRef.current(u.id); setChoices(null);
  };
  const formatTime = (s:number) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const createOnlineRoom = () => void connectToRoom(newRoomCode(), "host");
  const joinOnlineRoom = () => {
    const code = normalizeRoomCode(joinCode);
    if (code) void connectToRoom(code, "join");
  };
  const copyInvite = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = shareLink;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    wakeAudio("ui");
    setTimeout(() => setCopied(false), 1800);
  };
  const startCoopGame = async () => {
    if (!netRef.current?.connected()) return;
    await netRef.current.send({ t: "start" });
    startGame();
  };
  const returnToMenu = async () => {
    wakeAudio("ui");
    await leaveRoom();
    history.replaceState(null, "", location.pathname);
    setView("menu");
  };
  const resetCoop = async () => {
    wakeAudio("ui");
    await leaveRoom();
    setJoinCode("");
    setConnectionMessage("");
    setView("coop");
  };
  const startSoloFromCoop = async () => {
    await leaveRoom();
    startGame();
  };
  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    const audio = getAudio();
    audio.setEnabled(next);
    if (next) wakeAudio("ui");
  };

  return (
    <main className="shell" onPointerDownCapture={()=>wakeAudio()} onKeyDownCapture={()=>wakeAudio()}>
      <header className="topbar">
        <button className="brand" onClick={()=>void returnToMenu()} aria-label="返回主菜单"><span>余烬</span><b>协议</b></button>
        <div className="status"><i /> 版本 0.2 · 声场更新</div>
        <div className={`audioControl ${audioOpen ? "open" : ""}`}>
          <button className="iconBtn" onClick={toggleSound} aria-label={sound ? "关闭声音" : "开启声音"} title={sound ? "声音已开启" : "声音已关闭"}>
            <span aria-hidden="true">{sound ? "♫" : "×"}</span>
          </button>
          <button className="audioExpand" onClick={()=>{setAudioOpen(open=>!open);wakeAudio("ui");}} aria-label="打开音量设置" aria-expanded={audioOpen}>⌄</button>
          {audioOpen && <div className="audioPanel">
            <div className="audioHeading"><b>声音控制</b><span>{sound ? "余烬声场已启动" : "当前已静音"}</span></div>
            <label>
              <span>背景音乐 <b>{musicVolume}%</b></span>
              <input type="range" min="0" max="100" value={musicVolume} onChange={event=>{setMusicVolume(Number(event.target.value));wakeAudio();}} aria-label="背景音乐音量"/>
            </label>
            <label>
              <span>战斗音效 <b>{sfxVolume}%</b></span>
              <input type="range" min="0" max="100" value={sfxVolume} onChange={event=>{setSfxVolume(Number(event.target.value));wakeAudio();}} aria-label="战斗音效音量"/>
            </label>
            <button className="audioToggle" onClick={toggleSound}>{sound ? "一键静音" : "恢复声音"}</button>
          </div>}
        </div>
      </header>

      {view==="menu" && <section className="menu">
        <div className="menuArt" aria-hidden="true"><div className="orb"><span>✦</span></div><div className="orbit o1"/><div className="orbit o2"/></div>
        <div className="eyebrow">CO-OP ROGUELITE · 生存实验</div>
        <h1>守住最后一簇<br/><em>不肯熄灭的火</em></h1>
        <p className="lede">踏入不断收缩的荒原，和伙伴一起把每次失败<br className="desktop"/>炼成下一局的武器。</p>
        <div className="actions">
          <button className="primary" onClick={startGame}><span>开始远征</span><small>单人 · 立即进入</small></button>
          <button className="secondary" onClick={()=>setView("coop")}><span>双人联机</span><small>房间链接 · 自动中继</small></button>
        </div>
        <div className="controls"><span><kbd>WASD</kbd> 移动</span><span><kbd>自动</kbd> 瞄准射击</span><span><kbd>ESC</kbd> 暂停</span></div>
      </section>}

      {view==="coop" && <section className="coop">
        <button className="back" onClick={()=>void returnToMenu()}>← 返回营地</button>
        <div className="coopCard">
          <div className="eyebrow">EMBER LINK · 快速联机</div>
          <h2>一个链接，直接会合</h2>
          <p>无需账号，也不用复制连接文本。创建房间后把链接发给朋友，对方打开即可自动加入。</p>
          {!signalMode ? <div className="modeGrid">
            <button onClick={createOnlineRoom}><b>创建队伍</b><span>生成可分享的房间链接</span></button>
            <div className="joinBox">
              <b>加入队伍</b>
              <span>输入朋友发来的房间码</span>
              <div className="joinLine">
                <input value={joinCode} onChange={e=>setJoinCode(normalizeRoomCode(e.target.value))} onKeyDown={e=>{if(e.key==="Enter")joinOnlineRoom();}} placeholder="EMBER-AB12CD" aria-label="房间码"/>
                <button onClick={joinOnlineRoom} disabled={!normalizeRoomCode(joinCode)}>加入</button>
              </div>
            </div>
          </div> : <>
            <div className={`networkStatus ${connectionStatus}`}>
              <i className="statusDot"/>
              <div><b>{connectionStatus==="connected"?"联机已就绪":connectionStatus==="error"?"连接遇到问题":"正在建立联机"}</b><span>{connectionMessage}</span></div>
              <div className="networkMeta">{peerCount>0&&<span>{peerCount} 位伙伴</span>}{latency!==null&&<span>{latency} ms</span>}</div>
            </div>
            {signalMode==="host" ? <>
              <label>把这个链接发给你的朋友</label>
              <div className="inviteLine">
                <input readOnly value={shareLink} onFocus={e=>e.currentTarget.select()} aria-label="好友邀请链接"/>
                <button onClick={copyInvite}>{copied?"已复制":"复制链接"}</button>
              </div>
              <div className="roomCode">房间码 <b>{roomCode}</b></div>
            </> : <div className="roomCode joinState">正在加入房间 <b>{roomCode}</b>{connectionStatus==="connected"&&<span>等待队长开始游戏…</span>}</div>}
            {connectionStatus==="connected" && signalMode==="host" && <button className="primary compact startTogether" onClick={()=>void startCoopGame()}><span>两人一起出发</span></button>}
            {connectionStatus==="error" && <button className="connect" onClick={()=>void connectToRoom(roomCode, signalMode)}>重新连接</button>}
            <button className="textBtn" onClick={()=>void resetCoop()}>更换房间</button>
          </>}
          <div className="labNote"><span>连接说明</span> 系统会通过多条线路寻找伙伴；点对点直连失败时，会自动尝试 TURN 中继。双方进入远征后可看见彼此，并获得队友火力支援。</div>
          {!signalMode&&<button className="primary compact" onClick={()=>void startSoloFromCoop()}><span>先独自出发</span></button>}
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
        <button className="quit" onClick={()=>void returnToMenu()}>结束远征</button>
        {choices && <div className="overlay">
          <div className="upgradePanel"><div className="eyebrow">火种共鸣</div><h2>选择一项遗物</h2><p>每次选择，都将改变这趟远征。</p>
            <div className="upgradeGrid">{choices.map((u,i)=><button key={u.id} onClick={()=>chooseUpgrade(u)}><small>0{i+1}</small><i>{u.icon}</i><b>{u.title}</b><span>{u.desc}</span></button>)}</div>
          </div>
        </div>}
        {paused && !choices && <div className="overlay"><div className="pausePanel"><div className="eyebrow">{hp<=0?"远征终止":"火焰暂歇"}</div><h2>{hp<=0?"火种熄灭了":"游戏已暂停"}</h2><p>{hp<=0?`你坚持了 ${formatTime(seconds)}，净化了 ${kills} 只荒兽。`:"休息一下，荒原会等你。"}</p>
          {hp>0&&<button className="primary compact" onClick={()=>setPaused(false)}><span>继续远征</span></button>}
          {hp<=0&&<button className="primary compact" onClick={startGame}><span>再次点火</span></button>}
          <button className="textBtn" onClick={()=>void returnToMenu()}>返回主菜单</button></div></div>}
      </section>}
      <footer><span>EMBER PROTOCOL</span><span>失败不是终点，是配方。</span></footer>
    </main>
  );
}
