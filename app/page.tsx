"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getRelaySockets, joinRoom } from "@trystero-p2p/mqtt";
import { EmberAudioEngine, type SoundCue } from "./audio";

type View = "menu" | "loadout" | "game" | "coop";
type ClassId = "assault" | "guardian" | "engineer" | "phantom";
type EnemyKind = "runner" | "crawler" | "artillery" | "assassin" | "brute" | "commander";
type Upgrade = { id: string; title: string; desc: string; icon: string };
type CombatStats = {
  speed: number;
  damage: number;
  interval: number;
  multi: number;
  magnet: number;
  projectileSpeed: number;
  projectileSize: number;
  damageReduction: number;
  critChance: number;
  skillHaste: number;
  drones: number;
};
type BuildFrame = CombatStats & { classId: ClassId; maxHp: number };
type ClassSpec = {
  id: ClassId;
  name: string;
  role: string;
  active: string;
  passive: string;
  cooldown: number;
  color: string;
  sprite: number;
};
type Actor = { x: number; y: number; r: number; hp: number; maxHp: number; color: string; name?: string; classId?: ClassId };
type Enemy = Actor & { speed: number; hit: number; kind: EnemyKind; elite: boolean; cooldown: number };
type Shot = { x: number; y: number; vx: number; vy: number; r: number; damage: number; life: number; hostile?: boolean };
type Gem = { x: number; y: number; value: number };
type PlayerFrame = Pick<Actor, "x" | "y" | "hp" | "maxHp" | "classId">;
type WorldFrame = {
  elapsed: number;
  level: number;
  xp: number;
  xpNeed: number;
  kills: number;
  host: PlayerFrame;
  guest?: PlayerFrame;
  enemies: Enemy[];
  shots: Shot[];
  gems: Gem[];
};
type NetPayload =
  | { t: "hello" }
  | { t: "start" }
  | { t: "player"; x: number; y: number }
  | { t: "build"; build: BuildFrame }
  | { t: "upgrade-done"; build: BuildFrame; hp: number }
  | { t: "skill"; classId: ClassId; x: number; y: number }
  | { t: "world"; frame: WorldFrame }
  | { t: "levelup"; level: number }
  | { t: "pause"; paused: boolean }
  | { t: "gameover" };
type NetBridge = {
  roomId: string;
  role: "host" | "join";
  room: ReturnType<typeof joinRoom>;
  send: (data: NetPayload) => Promise<void>;
  subscribe: (handler: (data: NetPayload) => void) => () => void;
  connected: () => boolean;
};

const UPGRADES: Upgrade[] = [
  { id: "rapid", title: "余烬弹匣", desc: "射击间隔 -14%", icon: "✦" },
  { id: "damage", title: "淬火弹头", desc: "自身伤害 +22%", icon: "◆" },
  { id: "multi", title: "双生火舌", desc: "额外弹丸 +1，射速略降", icon: "⌁" },
  { id: "speed", title: "轻盈步伐", desc: "移动速度 +12%", icon: "➜" },
  { id: "vitality", title: "钛金骨架", desc: "自身生命 +20，并回复 30", icon: "♥" },
  { id: "magnet", title: "拾荒直觉", desc: "拾取范围 +35%", icon: "◎" },
  { id: "armor", title: "偏转装甲", desc: "受到伤害 -8%", icon: "⬢" },
  { id: "critical", title: "弱点演算", desc: "暴击率 +8%", icon: "◈" },
  { id: "velocity", title: "磁轨加速器", desc: "弹速 +18%，弹体更大", icon: "➤" },
  { id: "reactor", title: "过载反应炉", desc: "主动技能冷却 -15%", icon: "⌬" },
  { id: "drone", title: "蜂群协议", desc: "增加 1 架辅助无人机", icon: "✣" },
  { id: "repair", title: "纳米修复", desc: "立即回复 35 点生命", icon: "✚" },
];

const CLASSES: ClassSpec[] = [
  { id: "assault", name: "强袭型", role: "高火力突击", active: "导弹风暴：向四周发射高伤导弹", passive: "武器过载：基础伤害和射速提高", cooldown: 10, color: "#f4c95d", sprite: 0 },
  { id: "guardian", name: "堡垒型", role: "重甲守卫", active: "绝对屏障：3 秒内免疫伤害", passive: "复合装甲：生命更高，受到伤害降低", cooldown: 14, color: "#58c7c0", sprite: 1 },
  { id: "engineer", name: "技师型", role: "无人机支援", active: "修复脉冲：为全队回复生命", passive: "伴飞无人机：自动提供额外火力", cooldown: 16, color: "#92a35c", sprite: 2 },
  { id: "phantom", name: "幻影型", role: "高速刺杀", active: "相位突进：瞬移并短暂无敌", passive: "弱点锁定：移速和暴击率更高", cooldown: 9, color: "#9ec9ff", sprite: 3 },
];

const ENEMY_DATA: Record<EnemyKind, { hp: number; speed: number; hit: number; radius: number; color: string; cooldown: number }> = {
  runner: { hp: 24, speed: 108, hit: 7, radius: 13, color: "#e65d43", cooldown: 0 },
  crawler: { hp: 48, speed: 58, hit: 10, radius: 17, color: "#75a94c", cooldown: 0 },
  artillery: { hp: 58, speed: 42, hit: 8, radius: 18, color: "#de8b34", cooldown: 2.4 },
  assassin: { hp: 68, speed: 82, hit: 14, radius: 18, color: "#865bc7", cooldown: 3.8 },
  brute: { hp: 185, speed: 36, hit: 21, radius: 27, color: "#a7542a", cooldown: 0 },
  commander: { hp: 320, speed: 48, hit: 18, radius: 30, color: "#d9b24b", cooldown: 1.5 },
};

const makeBuild = (classId: ClassId): BuildFrame => {
  const base: BuildFrame = {
    classId,
    maxHp: 100,
    speed: 240,
    damage: 28,
    interval: .46,
    multi: 1,
    magnet: 84,
    projectileSpeed: 560,
    projectileSize: 5,
    damageReduction: 0,
    critChance: .05,
    skillHaste: 1,
    drones: 0,
  };
  if (classId === "assault") return { ...base, damage: 32, interval: .41 };
  if (classId === "guardian") return { ...base, maxHp: 135, speed: 216, damage: 25, damageReduction: .22 };
  if (classId === "engineer") return { ...base, damage: 26, magnet: 110, drones: 1 };
  return { ...base, maxHp: 90, speed: 286, damage: 30, critChance: .19 };
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const normalizeRoomCode = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
const extractRoomCode = (value: string) => {
  const input = value.trim();
  if (!input) return "";
  try {
    const roomFromLink = new URL(input, "https://ember.local").searchParams.get("room");
    if (roomFromLink) return normalizeRoomCode(roomFromLink);
  } catch {
    // Fall through to accepting a room code or one embedded in copied text.
  }
  const embeddedCode = input.toUpperCase().match(/EMBER-[A-Z0-9-]+/)?.[0];
  return normalizeRoomCode(embeddedCode || input);
};
const newRoomCode = () => `EMBER-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().slice(0, 7)}`;
const SIGNAL_RELAY_URLS = [
  "wss://broker-cn.emqx.io:8084/mqtt",
  "wss://broker.emqx.io:8084/mqtt",
  "wss://broker.hivemq.com:8884/mqtt",
  "wss://test.mosquitto.org:8081/mqtt",
];

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
  const [maxHp, setMaxHp] = useState(100);
  const [kills, setKills] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [choices, setChoices] = useState<Upgrade[] | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassId>("assault");
  const [skillCooldown, setSkillCooldown] = useState(0);
  const [waitingPeerUpgrade, setWaitingPeerUpgrade] = useState(false);
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
  const activeSkillRef = useRef<() => void>(() => {});
  const selectedClassRef = useRef<ClassId>("assault");
  const ownBuildRef = useRef<BuildFrame>(makeBuild("assault"));
  const remoteBuildRef = useRef<BuildFrame | null>(null);
  const netRef = useRef<NetBridge | null>(null);
  const audioRef = useRef<EmberAudioEngine | null>(null);
  const connectionTimersRef = useRef<number[]>([]);

  const clearConnectionTimers = useCallback(() => {
    connectionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    connectionTimersRef.current = [];
  }, []);

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
    setLevel(1); setXp(0); setHp(ownBuildRef.current.maxHp); setMaxHp(ownBuildRef.current.maxHp); setKills(0); setSeconds(0); setSkillCooldown(0);
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
    clearConnectionTimers();
    const activeRoom = netRef.current;
    netRef.current = null;
    if (activeRoom) await activeRoom.room.leave();
    setPeerCount(0);
    setLatency(null);
    setConnectionStatus("idle");
    setSignalMode(null);
    setRoomCode("");
    setShareLink("");
    remoteBuildRef.current = null;
  }, [clearConnectionTimers]);

  const connectToRoom = useCallback(async (rawCode: string, role: "host" | "join") => {
    const code = extractRoomCode(rawCode);
    if (!code) return;
    clearConnectionTimers();
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
          appId: "ember-protocol-v4",
          password: `ember-sync-v4-${code}`,
          relayConfig: { urls: SIGNAL_RELAY_URLS, warnOnRelayFailure: false },
          turnConfig,
        },
        code,
        {
          onJoinError: ({ error }) => {
            clearConnectionTimers();
            setConnectionStatus("error");
            setConnectionMessage(error || "当前网络无法建立联机，请检查网络后点击重新连接。");
          },
        },
      );
      const gameplay = room.makeAction<NetPayload>("ember-game-v4");
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
        if (data.t === "build" || data.t === "upgrade-done") remoteBuildRef.current = data.build;
        listeners.forEach((listener) => listener(data));
        if (data.t === "start" && role === "join") {
          ownBuildRef.current = makeBuild(selectedClassRef.current);
          startGame();
        }
      };
      room.onPeerJoin = (peerId) => {
        clearConnectionTimers();
        wakeAudio("connected");
        setPeerCount(Object.keys(room.getPeers()).length);
        setConnectionStatus("connected");
        setConnectionMessage("伙伴已连接，可以一起出发。");
        void gameplay.send({ t: "hello" }, { target: peerId });
        void gameplay.send({ t: "build", build: ownBuildRef.current }, { target: peerId });
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
      setConnectionMessage(role === "host" ? "房间已创建，正在接通联机线路…" : "已识别邀请链接，正在寻找队长…");

      const relayHealthTimer = window.setTimeout(() => {
        if (netRef.current?.room !== room || Object.keys(room.getPeers()).length) return;
        const sockets = Object.values(getRelaySockets() as Record<string, WebSocket | undefined>);
        const relayReady = sockets.some((socket) => socket?.readyState === WebSocket.OPEN);
        if (relayReady) {
          setConnectionStatus("waiting");
          setConnectionMessage(role === "host"
            ? "联机线路已就绪，把上方链接发给朋友即可。"
            : "联机线路已就绪，正在等待队长响应…");
        } else {
          setConnectionStatus("connecting");
          setConnectionMessage("正在切换联机线路，请保持页面打开…");
        }
      }, 4500);
      connectionTimersRef.current.push(relayHealthTimer);

      if (role === "join") {
        const joinTimeout = window.setTimeout(() => {
          if (netRef.current?.room !== room || Object.keys(room.getPeers()).length) return;
          setConnectionStatus("error");
          setConnectionMessage("暂未找到队长。请确认双方打开的是同一个链接，并让队长保持房间页面打开，然后点击重新连接。");
        }, 18000);
        connectionTimersRef.current.push(joinTimeout);
      }
    } catch (error) {
      clearConnectionTimers();
      setConnectionStatus("error");
      setConnectionMessage(error instanceof Error ? error.message : "联机初始化失败，请重试。");
    }
  }, [clearConnectionTimers, startGame, wakeAudio]);

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
    let active = true, localPaused = false, currentXp = 0, currentLevel = 1, currentKills = 0;
    let netClock = 0, worldClock = 0, remoteFireClock = 0, remoteSeen = 0, gameOverSent = false;
    let selfShieldUntil = 0, remoteShieldUntil = 0, skillReadyAt = 0, shownCooldown = -1;
    let localUpgradeDone = false, waitingForRemoteUpgrade = false;
    const network = netRef.current;
    const isAuthority = network?.role !== "join";
    let build = { ...ownBuildRef.current };
    let stats: CombatStats = { ...build };
    const classSpec = () => CLASSES.find((item) => item.id === build.classId) || CLASSES[0];
    let player: Actor = {
      x: network?.role === "join" ? W / 2 + 52 : W / 2 - 52,
      y: H / 2,
      r: 17,
      hp: build.maxHp,
      maxHp: build.maxHp,
      color: classSpec().color,
      classId: build.classId,
    };
    let remote: Actor | null = null;
    let enemies: Enemy[] = [], shots: Shot[] = [], gems: Gem[] = [], particles: {x:number;y:number;vx:number;vy:number;life:number;color:string}[] = [];
    const keys = new Set<string>();
    const pointer = { x: W / 2, y: H / 2, down: false };
    const audio = audioRef.current;
    const playerSprites = new Image();
    const enemySprites = new Image();
    playerSprites.src = "/game/player-mechs.png";
    enemySprites.src = "/game/enemy-mechs.png";
    const unsubscribeNetwork = network?.subscribe((data) => {
      if (data.t === "player" && isAuthority) {
        const remoteBuild = remoteBuildRef.current || makeBuild("assault");
        remote = {
          x: data.x,
          y: data.y,
          r: 17,
          hp: remote?.hp ?? remoteBuild.maxHp,
          maxHp: remote?.maxHp ?? remoteBuild.maxHp,
          color: CLASSES.find((item) => item.id === remoteBuild.classId)?.color || "#78a99d",
          name: "伙伴",
          classId: remoteBuild.classId,
        };
        remoteSeen = performance.now();
      }
      if (data.t === "build" && isAuthority) {
        remoteBuildRef.current = data.build;
        if (remote) {
          remote.classId = data.build.classId;
          remote.color = CLASSES.find((item) => item.id === data.build.classId)?.color || "#78a99d";
          remote.maxHp = Math.max(remote.maxHp, data.build.maxHp);
        }
      }
      if (data.t === "upgrade-done" && isAuthority) {
        remoteBuildRef.current = data.build;
        waitingForRemoteUpgrade = false;
        setWaitingPeerUpgrade(false);
        if (remote) {
          remote.maxHp = data.build.maxHp;
          remote.hp = clamp(data.hp, 0, data.build.maxHp);
        }
        if (localUpgradeDone) localPaused = false;
      }
      if (data.t === "skill" && isAuthority && remote) {
        const remoteBuild = remoteBuildRef.current || makeBuild(data.classId);
        if (data.classId === "assault") {
          for (let i = 0; i < 12; i++) {
            const angle = i / 12 * Math.PI * 2;
            shots.push({ x: remote.x, y: remote.y, vx: Math.cos(angle) * 520, vy: Math.sin(angle) * 520, r: 7, damage: remoteBuild.damage * 1.65, life: 1.4 });
          }
        }
        if (data.classId === "guardian") remoteShieldUntil = performance.now() + 3000;
        if (data.classId === "engineer") {
          player.hp = Math.min(player.maxHp, player.hp + 28);
          remote.hp = Math.min(remote.maxHp, remote.hp + 28);
          setHp(Math.ceil(player.hp));
        }
        if (data.classId === "phantom") {
          remote.x = clamp(data.x, 30, W - 30);
          remote.y = clamp(data.y, 30, H - 30);
          remoteShieldUntil = performance.now() + 1200;
        }
        audio?.play("upgrade");
      }
      if (data.t === "world" && !isAuthority) {
        const frame = data.frame;
        elapsed = frame.elapsed;
        currentLevel = frame.level;
        currentXp = frame.xp;
        if (frame.kills > currentKills) audio?.play("kill");
        currentKills = frame.kills;
        enemies = frame.enemies;
        shots = frame.shots;
        gems = frame.gems;
        remote = {
          ...frame.host,
          r: 17,
          color: CLASSES.find((item) => item.id === frame.host.classId)?.color || "#78a99d",
          name: "队长",
        };
        remoteSeen = performance.now();
        if (frame.guest) {
          player.hp = frame.guest.hp;
          player.maxHp = frame.guest.maxHp;
        }
        setSeconds(Math.floor(frame.elapsed));
        setLevel(frame.level);
        setKills(frame.kills);
        setXp(clamp(frame.xp / frame.xpNeed * 100, 0, 100));
        setHp(Math.max(0, Math.ceil(player.hp)));
        setMaxHp(player.maxHp);
      }
      if (data.t === "levelup" && !isAuthority) {
        currentLevel = data.level;
        localUpgradeDone = false;
        localPaused = true;
        setLevel(data.level);
        setChoices([...UPGRADES].sort(() => Math.random() - .5).slice(0, 3));
      }
      if (data.t === "pause" && !isAuthority) {
        setPaused(data.paused);
      }
      if (data.t === "gameover" && !isAuthority) {
        audio?.play("game-over");
        player.hp = 0;
        setHp(0);
        localPaused = true;
        setPaused(true);
      }
    });

    const reset = () => {
      elapsed = 0; spawnClock = 0; fireClock = 0; currentXp = 0; currentLevel = 1; currentKills = 0;
      netClock = 0; worldClock = 0; remoteFireClock = 0; gameOverSent = false;
      selfShieldUntil = 0; remoteShieldUntil = 0; skillReadyAt = 0; shownCooldown = -1;
      localUpgradeDone = false; waitingForRemoteUpgrade = false;
      setWaitingPeerUpgrade(false);
      build = { ...ownBuildRef.current };
      stats = { ...build };
      player = {
        x: network?.role === "join" ? W / 2 + 52 : W / 2 - 52,
        y: H / 2,
        r: 17,
        hp: build.maxHp,
        maxHp: build.maxHp,
        color: CLASSES.find((item) => item.id === build.classId)?.color || "#f4c95d",
        classId: build.classId,
      };
      remote = null;
      enemies = []; shots = []; gems = []; particles = [];
      setHp(build.maxHp);
      setMaxHp(build.maxHp);
      setSkillCooldown(0);
    };
    resetRef.current = reset;
    applyUpgradeRef.current = (id) => {
      if (id === "rapid") stats.interval *= .86;
      if (id === "damage") stats.damage *= 1.22;
      if (id === "multi") { stats.multi += 1; stats.interval *= 1.08; }
      if (id === "speed") stats.speed *= 1.12;
      if (id === "magnet") stats.magnet *= 1.35;
      if (id === "armor") stats.damageReduction = Math.min(.55, stats.damageReduction + .08);
      if (id === "critical") stats.critChance = Math.min(.65, stats.critChance + .08);
      if (id === "velocity") { stats.projectileSpeed *= 1.18; stats.projectileSize += .7; }
      if (id === "reactor") stats.skillHaste *= .85;
      if (id === "drone") stats.drones += 1;
      if (id === "repair") player.hp = Math.min(player.maxHp, player.hp + 35);
      if (id === "vitality") {
        player.maxHp += 20;
        player.hp = Math.min(player.maxHp, player.hp + 30);
      }
      build = { ...build, ...stats, maxHp: player.maxHp };
      ownBuildRef.current = { ...build };
      setHp(Math.ceil(player.hp));
      setMaxHp(player.maxHp);
      audio?.play("upgrade");
      localUpgradeDone = true;
      if (network?.role === "join" && network.connected()) {
        void network.send({ t: "upgrade-done", build: ownBuildRef.current, hp: player.hp });
      }
      setWaitingPeerUpgrade(Boolean(network?.role === "host" && waitingForRemoteUpgrade));
      if (network?.role === "join" || !waitingForRemoteUpgrade) localPaused = false;
    };

    activeSkillRef.current = () => {
      const now = performance.now();
      if (now < skillReadyAt || localPaused || pausedRef.current) return;
      const spec = classSpec();
      skillReadyAt = now + spec.cooldown * stats.skillHaste * 1000;
      setSkillCooldown(Math.ceil((skillReadyAt - now) / 1000));
      if (network?.role === "join") {
        if (build.classId === "guardian") selfShieldUntil = now + 3000;
        if (build.classId === "phantom") {
          const dashX = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0);
          let dashY = (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0);
          const dashLength = Math.hypot(dashX, dashY) || 1;
          if (!dashX && !dashY) dashY = -1;
          player.x = clamp(player.x + dashX / dashLength * 190, 30, W - 30);
          player.y = clamp(player.y + dashY / dashLength * 190, 30, H - 30);
          selfShieldUntil = now + 1200;
        }
        if (network.connected()) void network.send({ t: "skill", classId: build.classId, x: player.x, y: player.y });
        audio?.play("upgrade");
        return;
      }
      if (build.classId === "assault") {
        for (let i = 0; i < 12; i++) {
          const angle = i / 12 * Math.PI * 2;
          shots.push({ x: player.x, y: player.y, vx: Math.cos(angle) * 540, vy: Math.sin(angle) * 540, r: 7, damage: stats.damage * 1.75, life: 1.45 });
        }
      }
      if (build.classId === "guardian") selfShieldUntil = now + 3000;
      if (build.classId === "engineer") {
        player.hp = Math.min(player.maxHp, player.hp + 28);
        if (remote) remote.hp = Math.min(remote.maxHp, remote.hp + 28);
        setHp(Math.ceil(player.hp));
      }
      if (build.classId === "phantom") {
        const dashX = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0);
        let dashY = (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0);
        const dashLength = Math.hypot(dashX, dashY) || 1;
        if (!dashX && !dashY) dashY = -1;
        player.x = clamp(player.x + dashX / dashLength * 190, 30, W - 30);
        player.y = clamp(player.y + dashY / dashLength * 190, 30, H - 30);
        selfShieldUntil = now + 1200;
      }
      audio?.play("upgrade");
    };

    const down = (e: KeyboardEvent) => {
      keys.add(e.key.toLowerCase());
      if (e.key.toLowerCase() === "q" || e.code === "Space") {
        e.preventDefault();
        activeSkillRef.current();
      }
      if (e.key === "Escape" && network?.role !== "join") {
        setPaused((wasPaused) => {
          const nextPaused = !wasPaused;
          if (network?.connected()) void network.send({ t: "pause", paused: nextPaused });
          return nextPaused;
        });
      }
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
      const pool: EnemyKind[] = ["runner", "crawler", "runner"];
      if (elapsed > 22) pool.push("artillery");
      if (elapsed > 48) pool.push("assassin");
      if (elapsed > 78) pool.push("brute");
      let kind = pool[Math.floor(Math.random() * pool.length)];
      if (elapsed > 115 && Math.random() < Math.min(.12, .035 + elapsed / 2400)) kind = "commander";
      const config = ENEMY_DATA[kind];
      const coOpScale = remote ? 1.28 : 1;
      const eliteChance = clamp((elapsed - 38) / 420, 0, .22);
      const elite = kind === "commander" || Math.random() < eliteChance;
      const lateScale = 1 + elapsed / 150 + Math.pow(elapsed / 360, 2);
      const maxHp = config.hp * lateScale * coOpScale * (elite ? 1.75 : 1);
      enemies.push({
        x,
        y,
        r: config.radius * (elite ? 1.16 : 1),
        hp: maxHp,
        maxHp,
        speed: config.speed + Math.min(26, elapsed * .065),
        hit: config.hit * (elite ? 1.28 : 1),
        color: config.color,
        kind,
        elite,
        cooldown: config.cooldown ? Math.random() * config.cooldown : 0,
      });
    };
    const burst = (x:number,y:number,color:string,n=8) => {
      for(let i=0;i<n;i++){ const a=Math.random()*Math.PI*2,s=40+Math.random()*120; particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.35,color}); }
    };
    const levelUp = () => {
      audio?.play("level");
      currentLevel++; setLevel(currentLevel);
      const pool = [...UPGRADES].sort(() => Math.random() - .5).slice(0, 3);
      localUpgradeDone = false;
      waitingForRemoteUpgrade = Boolean(remote && network?.connected());
      setWaitingPeerUpgrade(false);
      localPaused = true; setChoices(pool);
      if (network?.connected()) {
        void network.send({ t: "levelup", level: currentLevel });
      }
    };

    const xpNeed = () => 9 + currentLevel * 4;
    const sendWorld = () => {
      if (!network?.connected() || !isAuthority) return;
      void network.send({
        t: "world",
        frame: {
          elapsed,
          level: currentLevel,
          xp: currentXp,
          xpNeed: xpNeed(),
          kills: currentKills,
          host: { x: player.x, y: player.y, hp: player.hp, maxHp: player.maxHp, classId: player.classId },
          guest: remote ? { x: remote.x, y: remote.y, hp: remote.hp, maxHp: remote.maxHp, classId: remote.classId } : undefined,
          enemies,
          shots,
          gems,
        },
      });
    };

    const update = (dt: number) => {
      let dx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
      let dy = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
      const dm = Math.hypot(dx, dy) || 1; dx /= dm; dy /= dm;
      player.x = clamp(player.x + dx * stats.speed * dt, 30, W - 30);
      player.y = clamp(player.y + dy * stats.speed * dt, 30, H - 30);

      if (remote && performance.now() - remoteSeen > 3500) remote = null;
      netClock -= dt;
      if (network?.connected() && network.role === "join" && netClock <= 0) {
        netClock = .05;
        void network.send({ t: "player", x: player.x, y: player.y });
      }

      for (const p of particles) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.vx *= .96; p.vy *= .96;
      }
      particles = particles.filter((particle) => particle.life > 0);
      const cooldownRemaining = Math.max(0, Math.ceil((skillReadyAt - performance.now()) / 1000));
      if (cooldownRemaining !== shownCooldown) {
        shownCooldown = cooldownRemaining;
        setSkillCooldown(cooldownRemaining);
      }
      if (!isAuthority) return;

      elapsed += dt;
      setSeconds(Math.floor(elapsed));
      const coOpActive = Boolean(remote && network?.connected());
      const enemyCap = Math.min(coOpActive ? 180 : 150, (coOpActive ? 72 : 56) + Math.floor(elapsed / 30) * 9);
      spawnClock -= dt;
      if (spawnClock <= 0) {
        spawnClock = coOpActive
          ? Math.max(.14, .82 - elapsed * .0037)
          : Math.max(.18, 1.02 - elapsed * .004);
        if (enemies.length < enemyCap) spawnEnemy();
      }

      fireClock -= dt;
      if (fireClock <= 0 && enemies.length && player.hp > 0) {
        fireClock = stats.interval;
        const target = enemies.reduce((a,b) => dist(player,a) < dist(player,b) ? a : b);
        const a0 = Math.atan2(target.y-player.y,target.x-player.x);
        for(let i=0;i<stats.multi;i++){
          const spread=(i-(stats.multi-1)/2)*.14;
          const angle=a0+spread;
          const damage = Math.random() < stats.critChance ? stats.damage * 2 : stats.damage;
          shots.push({x:player.x,y:player.y,vx:Math.cos(angle)*stats.projectileSpeed,vy:Math.sin(angle)*stats.projectileSpeed,r:stats.projectileSize,damage,life:1.5});
        }
        for (let i = 0; i < stats.drones; i++) {
          const droneAngle = a0 + (i % 2 ? .22 : -.22);
          shots.push({x:player.x,y:player.y,vx:Math.cos(droneAngle)*stats.projectileSpeed*.92,vy:Math.sin(droneAngle)*stats.projectileSpeed*.92,r:4,damage:stats.damage*.42,life:1.6});
        }
        audio?.play("shot");
        burst(player.x+Math.cos(a0)*18,player.y+Math.sin(a0)*18,"#f4c95d",3);
      }
      remoteFireClock -= dt;
      if (remote && remote.hp > 0 && remoteFireClock <= 0 && enemies.length) {
        const remoteStats = remoteBuildRef.current || makeBuild(remote.classId || "assault");
        remoteFireClock = remoteStats.interval;
        const target = enemies.reduce((a,b) => dist(remote!,a) < dist(remote!,b) ? a : b);
        const a = Math.atan2(target.y-remote.y,target.x-remote.x);
        for(let i=0;i<remoteStats.multi;i++){
          const spread=(i-(remoteStats.multi-1)/2)*.14;
          const shotAngle=a+spread;
          const damage = Math.random() < remoteStats.critChance ? remoteStats.damage * 2 : remoteStats.damage;
          shots.push({x:remote.x,y:remote.y,vx:Math.cos(shotAngle)*remoteStats.projectileSpeed,vy:Math.sin(shotAngle)*remoteStats.projectileSpeed,r:remoteStats.projectileSize,damage,life:1.5});
        }
        for (let i = 0; i < remoteStats.drones; i++) {
          const droneAngle = a + (i % 2 ? .22 : -.22);
          shots.push({x:remote.x,y:remote.y,vx:Math.cos(droneAngle)*remoteStats.projectileSpeed*.92,vy:Math.sin(droneAngle)*remoteStats.projectileSpeed*.92,r:4,damage:remoteStats.damage*.42,life:1.6});
        }
        audio?.play("ally-shot");
      }

      for (const shot of shots) {
        shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt;
      }
      shots = shots.filter((shot) => shot.life > 0);
      const now = performance.now();
      for (const enemy of enemies) {
        const target = remote && remote.hp > 0 && dist(enemy,remote) < dist(enemy,player) ? remote : player;
        const targetDistance = dist(enemy, target);
        const angle = Math.atan2(target.y-enemy.y,target.x-enemy.x);
        enemy.cooldown -= dt;
        const ranged = enemy.kind === "artillery" || enemy.kind === "commander";
        if (!ranged || targetDistance > (enemy.kind === "commander" ? 250 : 310)) {
          enemy.x += Math.cos(angle) * enemy.speed * dt;
          enemy.y += Math.sin(angle) * enemy.speed * dt;
        }
        if (enemy.kind === "assassin" && enemy.cooldown <= 0 && targetDistance > 90) {
          enemy.x += Math.cos(angle) * Math.min(125, targetDistance - 55);
          enemy.y += Math.sin(angle) * Math.min(125, targetDistance - 55);
          enemy.cooldown = ENEMY_DATA.assassin.cooldown;
          burst(enemy.x, enemy.y, enemy.color, 8);
        }
        if (ranged && enemy.cooldown <= 0) {
          const spreadCount = enemy.kind === "commander" ? 3 : 1;
          for (let index = 0; index < spreadCount; index++) {
            const spread = (index - (spreadCount - 1) / 2) * .18;
            const shotAngle = angle + spread;
            shots.push({
              x: enemy.x,
              y: enemy.y,
              vx: Math.cos(shotAngle) * (enemy.kind === "commander" ? 330 : 285),
              vy: Math.sin(shotAngle) * (enemy.kind === "commander" ? 330 : 285),
              r: enemy.kind === "commander" ? 7 : 6,
              damage: enemy.hit * (1 + elapsed / 420),
              life: 2.4,
              hostile: true,
            });
          }
          enemy.cooldown = ENEMY_DATA[enemy.kind].cooldown * (enemy.elite ? .78 : 1);
        }
        if (targetDistance < enemy.r + target.r) {
          const targetShield = target === player ? selfShieldUntil : remoteShieldUntil;
          const reduction = target === player ? stats.damageReduction : (remoteBuildRef.current?.damageReduction || 0);
          if (now >= targetShield) target.hp = Math.max(0, target.hp - enemy.hit * (1 - reduction) * dt);
          if (target === player) {
            setHp(Math.ceil(player.hp));
            audio?.play("hurt");
          }
        }
      }
      for (const shot of shots) {
        if (shot.hostile) {
          const possibleTargets: Actor[] = remote && remote.hp > 0 ? [player, remote] : [player];
          for (const target of possibleTargets) {
            if (shot.life <= 0 || dist(shot, target) >= shot.r + target.r) continue;
            const targetShield = target === player ? selfShieldUntil : remoteShieldUntil;
            const reduction = target === player ? stats.damageReduction : (remoteBuildRef.current?.damageReduction || 0);
            if (now >= targetShield) target.hp = Math.max(0, target.hp - shot.damage * (1 - reduction));
            if (target === player) {
              setHp(Math.ceil(player.hp));
              audio?.play("hurt");
            }
            shot.life = 0;
          }
          continue;
        }
        for (const enemy of enemies) {
          if (shot.life > 0 && enemy.hp > 0 && dist(shot,enemy) < shot.r + enemy.r) {
            enemy.hp -= shot.damage;
            shot.life = 0;
            audio?.play("hit");
            burst(shot.x,shot.y,"#fff2ba",4);
          }
        }
      }
      for (const enemy of enemies) {
        if (enemy.hp <= 0) {
          const value = enemy.kind === "commander" ? 8 : enemy.elite ? 4 : enemy.kind === "brute" ? 3 : 1;
          gems.push({x:enemy.x,y:enemy.y,value});
          audio?.play("kill");
          burst(enemy.x,enemy.y,enemy.color,10);
          currentKills++;
          setKills(currentKills);
        }
      }
      enemies = enemies.filter((enemy) => enemy.hp > 0);
      for (const gem of gems) {
        const collector = remote && remote.hp > 0 && dist(gem,remote) < dist(gem,player) ? remote : player;
        const pickupDistance = dist(gem,collector);
        const collectorMagnet = collector === player ? stats.magnet : (remoteBuildRef.current?.magnet || 84);
        if (pickupDistance < collectorMagnet) {
          const angle = Math.atan2(collector.y-gem.y,collector.x-gem.x);
          gem.x += Math.cos(angle) * 340 * dt;
          gem.y += Math.sin(angle) * 340 * dt;
        }
        if (pickupDistance < collector.r + 8) {
          const earnedXp = gem.value;
          gem.value = 0;
          audio?.play("pickup");
          currentXp += earnedXp;
          const need = xpNeed();
          setXp(clamp(currentXp / need * 100, 0, 100));
          if (currentXp >= need) {
            currentXp -= need;
            levelUp();
            setXp(clamp(currentXp / xpNeed() * 100, 0, 100));
          }
        }
      }
      gems = gems.filter((gem) => gem.value > 0);

      worldClock -= dt;
      if (worldClock <= 0) {
        worldClock = .08;
        sendWorld();
      }
      const teamDefeated = player.hp <= 0 || Boolean(remote && remote.hp <= 0);
      if (teamDefeated && !gameOverSent) {
        gameOverSent = true;
        sendWorld();
        if (network?.connected()) void network.send({ t: "gameover" });
        audio?.play("game-over");
        setHp(0);
        localPaused = true;
        setPaused(true);
      }
    };

    const draw = () => {
      canvas.dataset.role = network?.role || "solo";
      canvas.dataset.enemies = String(enemies.length);
      canvas.dataset.shots = String(shots.length);
      canvas.dataset.gems = String(gems.length);
      canvas.dataset.level = String(currentLevel);
      canvas.dataset.kills = String(currentKills);
      canvas.dataset.elapsed = String(Math.floor(elapsed));
      ctx.fillStyle="#111814"; ctx.fillRect(0,0,W,H);
      ctx.strokeStyle="rgba(205,224,187,.055)"; ctx.lineWidth=1;
      for(let x=0;x<W;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
      for(let y=0;y<H;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
      ctx.fillStyle="rgba(244,201,93,.035)";
      for(let i=0;i<24;i++){ const x=(i*193)%W,y=(i*317)%H;ctx.beginPath();ctx.arc(x,y,18+(i%4)*9,0,Math.PI*2);ctx.fill();}
      for(const g of gems){ctx.save();ctx.translate(g.x,g.y);ctx.rotate(performance.now()/600);ctx.fillStyle="#9ed9cc";ctx.fillRect(-6,-6,12,12);ctx.restore();}
      for(const p of particles){ctx.globalAlpha=Math.max(0,p.life*2);ctx.fillStyle=p.color;ctx.fillRect(p.x-2,p.y-2,4,4);} ctx.globalAlpha=1;
      for(const s of shots){ctx.fillStyle=s.hostile?"#ff7657":"#fff2ba";ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();}
      const enemySpriteIndex: Record<EnemyKind, number> = { runner: 0, crawler: 1, artillery: 2, assassin: 3, brute: 4, commander: 5 };
      for(const e of enemies){
        const sprite = enemySpriteIndex[e.kind];
        const cellW = enemySprites.naturalWidth / 3, cellH = enemySprites.naturalHeight / 2;
        const size = e.r * 4.25;
        ctx.save();
        ctx.translate(e.x,e.y);
        ctx.rotate(Math.atan2(player.y-e.y,player.x-e.x)-Math.PI/2);
        if(e.elite){ctx.shadowColor="#f4c95d";ctx.shadowBlur=18;}
        if(enemySprites.complete&&enemySprites.naturalWidth){
          ctx.drawImage(enemySprites,(sprite%3)*cellW,Math.floor(sprite/3)*cellH,cellW,cellH,-size/2,-size/2,size,size);
        }else{
          ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(0,0,e.r,0,Math.PI*2);ctx.fill();
        }
        ctx.restore();
        if(e.elite){ctx.strokeStyle="rgba(244,201,93,.8)";ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x,e.y,e.r+6,0,Math.PI*2);ctx.stroke();}
      }
      const drawMech = (actor: Actor, ally: boolean) => {
        const sprite = CLASSES.find((item) => item.id === actor.classId)?.sprite || 0;
        const cellW = playerSprites.naturalWidth / 2, cellH = playerSprites.naturalHeight / 2;
        const size = actor.classId === "guardian" ? 84 : 76;
        ctx.save();
        ctx.shadowColor=ally?"#78a99d":actor.color;
        ctx.shadowBlur=20;
        if(playerSprites.complete&&playerSprites.naturalWidth){
          ctx.drawImage(playerSprites,(sprite%2)*cellW,Math.floor(sprite/2)*cellH,cellW,cellH,actor.x-size/2,actor.y-size/2,size,size);
        }else{
          ctx.fillStyle=actor.color;ctx.beginPath();ctx.arc(actor.x,actor.y,actor.r,0,Math.PI*2);ctx.fill();
        }
        ctx.restore();
      };
      drawMech(player,false);
      if(performance.now()<selfShieldUntil){ctx.strokeStyle="#75e6da";ctx.lineWidth=3;ctx.beginPath();ctx.arc(player.x,player.y,33,0,Math.PI*2);ctx.stroke();}
      if(remote){
        drawMech(remote,true);
        if(performance.now()<remoteShieldUntil){ctx.strokeStyle="#75e6da";ctx.lineWidth=3;ctx.beginPath();ctx.arc(remote.x,remote.y,33,0,Math.PI*2);ctx.stroke();}
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
  const selectClass = (classId: ClassId) => {
    setSelectedClass(classId);
    selectedClassRef.current = classId;
    ownBuildRef.current = makeBuild(classId);
    const currentNetwork = netRef.current;
    if (currentNetwork?.connected()) void currentNetwork.send({ t: "build", build: ownBuildRef.current });
    wakeAudio("ui");
  };
  const startSelectedSolo = () => {
    ownBuildRef.current = makeBuild(selectedClassRef.current);
    startGame();
  };
  const resumeRun = () => {
    const currentNetwork = netRef.current;
    if (currentNetwork?.role === "join") return;
    setPaused(false);
    if (currentNetwork?.connected()) void currentNetwork.send({ t: "pause", paused: false });
  };
  const restartRun = () => {
    const currentNetwork = netRef.current;
    if (currentNetwork?.role === "join") return;
    ownBuildRef.current = makeBuild(selectedClassRef.current);
    if (currentNetwork?.connected()) {
      void currentNetwork.send({ t: "build", build: ownBuildRef.current });
      void currentNetwork.send({ t: "start" });
    }
    startGame();
  };
  const formatTime = (s:number) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const createOnlineRoom = () => void connectToRoom(newRoomCode(), "host");
  const joinOnlineRoom = () => {
    const code = extractRoomCode(joinCode);
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
    const currentNetwork = netRef.current;
    if (!currentNetwork?.connected()) return;
    ownBuildRef.current = makeBuild(selectedClassRef.current);
    await currentNetwork.send({ t: "build", build: ownBuildRef.current });
    await currentNetwork.send({ t: "start" });
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
    setView("loadout");
  };
  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    const audio = getAudio();
    audio.setEnabled(next);
    if (next) wakeAudio("ui");
  };
  const selectedClassSpec = CLASSES.find((item) => item.id === selectedClass) || CLASSES[0];
  const classSelector = <div className="classGrid">
    {CLASSES.map((item) => <button key={item.id} className={selectedClass===item.id?"selected":""} onClick={()=>selectClass(item.id)}>
      <span className={`mechPreview mech-${item.sprite}`} aria-hidden="true"/>
      <small>{item.role}</small>
      <b>{item.name}</b>
      <span><em>主动</em>{item.active}</span>
      <span><em>被动</em>{item.passive}</span>
    </button>)}
  </div>;

  return (
    <main className="shell" onPointerDownCapture={()=>wakeAudio()} onKeyDownCapture={()=>wakeAudio()}>
      <header className="topbar">
        <button className="brand" onClick={()=>void returnToMenu()} aria-label="返回主菜单"><span>余烬</span><b>协议</b></button>
        <div className="status"><i /> 版本 0.4 · 机甲职业</div>
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
          <button className="primary" onClick={()=>setView("loadout")}><span>开始远征</span><small>单人 · 选择机体</small></button>
          <button className="secondary" onClick={()=>setView("coop")}><span>双人联机</span><small>房间链接 · 自动中继</small></button>
        </div>
        <div className="controls"><span><kbd>WASD</kbd> 移动</span><span><kbd>Q / 空格</kbd> 主动技能</span><span><kbd>ESC</kbd> 暂停</span></div>
      </section>}

      {view==="loadout" && <section className="loadout">
        <button className="back" onClick={()=>setView("menu")}>← 返回营地</button>
        <div className="eyebrow">FRAME SELECT · 机体整备</div>
        <h2>选择你的作战职业</h2>
        <p>每种机体拥有独立的主动技能和被动特性，进入远征后仍可通过遗物继续塑造个人流派。</p>
        {classSelector}
        <button className="primary compact launchClass" onClick={startSelectedSolo}><span>驾驶 {selectedClassSpec.name} 出发</span></button>
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
              <span>粘贴朋友发来的完整邀请链接或房间码</span>
              <div className="joinLine">
                <input value={joinCode} onChange={e=>setJoinCode(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")joinOnlineRoom();}} placeholder="粘贴邀请链接或 EMBER-房间码" aria-label="邀请链接或房间码"/>
                <button onClick={joinOnlineRoom} disabled={!extractRoomCode(joinCode)}>加入</button>
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
            {connectionStatus==="connected" && <div className="coopLoadout">
              <div className="coopLoadoutHeading">
                <div><small>各自整备</small><b>选择自己的职业</b></div>
                <span>双方可选择不同机体；进入战斗后经验与关卡共享，升级强化各自生效。</span>
              </div>
              {classSelector}
            </div>}
            {connectionStatus==="connected" && signalMode==="host" && <button className="primary compact startTogether" onClick={()=>void startCoopGame()}><span>两人一起出发</span></button>}
            {connectionStatus==="error" && <button className="connect" onClick={()=>void connectToRoom(roomCode, signalMode)}>重新连接</button>}
            <button className="textBtn" onClick={()=>void resetCoop()}>更换房间</button>
          </>}
          <div className="labNote"><span>连接与同步说明</span> 系统会通过多条线路寻找伙伴，直连失败时自动尝试 TURN 中继。队长统一同步怪物、掉落、关卡和经验；双方各自保留职业、技能与遗物选择。</div>
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
          {signalMode && <div className="syncBadge"><i /> 共享战场 · {signalMode==="host"?"队长同步":"伙伴同步"}</div>}
          <div className="skillDock">
            <span className={`mechPreview mech-${selectedClassSpec.sprite}`} aria-hidden="true"/>
            <div><small>{selectedClassSpec.role}</small><b>{selectedClassSpec.active}</b></div>
            <button onClick={()=>activeSkillRef.current()} disabled={skillCooldown>0}>{skillCooldown>0?`${skillCooldown}s`:"Q · 释放"}</button>
          </div>
          <div className="health"><span>{selectedClassSpec.name} · 机体完整度</span><div><i style={{width:`${clamp(hp / Math.max(1, maxHp) * 100, 0, 100)}%`}}/></div><b>{hp}/{maxHp}</b></div>
          <div className="xp"><i style={{width:`${xp}%`}}/></div>
          <div className="mobileHint">按住并拖动来移动</div>
        </div>
        <button className="quit" onClick={()=>void returnToMenu()}>结束远征</button>
        {choices && <div className="overlay">
          <div className="upgradePanel"><div className="eyebrow">个人机体强化 · 独立选择</div><h2>选择你的专属遗物</h2><p>关卡和经验仍与伙伴同步，但本次强化只改变你自己的机体流派。</p>
            <div className="upgradeGrid">{choices.map((u,i)=><button key={u.id} onClick={()=>chooseUpgrade(u)}><small>0{i+1}</small><i>{u.icon}</i><b>{u.title}</b><span>{u.desc}</span></button>)}</div>
          </div>
        </div>}
        {waitingPeerUpgrade && !choices && <div className="overlay">
          <div className="pausePanel waitingUpgrade"><div className="eyebrow">同步升级阶段</div><h2>等待伙伴完成选择</h2><p>你的遗物已经装配完成。伙伴选好自己的强化后，共享战场会自动继续。</p><i className="waitingPulse"/></div>
        </div>}
        {paused && !choices && <div className="overlay"><div className="pausePanel"><div className="eyebrow">{hp<=0?"远征终止":"火焰暂歇"}</div><h2>{hp<=0?"火种熄灭了":"游戏已暂停"}</h2><p>{hp<=0?`队伍坚持了 ${formatTime(seconds)}，共同净化了 ${kills} 只荒兽。`:signalMode==="join"?"等待队长继续远征。":"休息一下，荒原会等你。"}</p>
          {hp>0&&signalMode!=="join"&&<button className="primary compact" onClick={resumeRun}><span>全队继续</span></button>}
          {hp<=0&&signalMode!=="join"&&<button className="primary compact" onClick={restartRun}><span>全队再次点火</span></button>}
          <button className="textBtn" onClick={()=>void returnToMenu()}>返回主菜单</button></div></div>}
      </section>}
      <footer><span>EMBER PROTOCOL</span><span>失败不是终点，是配方。</span></footer>
    </main>
  );
}
