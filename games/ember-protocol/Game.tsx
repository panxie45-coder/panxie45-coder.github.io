"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getRelaySockets, joinRoom } from "@trystero-p2p/mqtt";
import type { CSSProperties } from "react";
import { EmberAudioEngine, type SoundCue } from "./audio";
import { earlyWaveXpMultiplier, prioritizeUltimateTargets } from "./combat-balance.mjs";
import { reconcilePausedPeerHp, teamRunDefeated } from "./team-state.mjs";

type View = "menu" | "loadout" | "game" | "coop";
type ClassId = "assault" | "guardian" | "engineer" | "phantom" | "laser" | "frost" | "blade" | "gravity" | "thunder" | "sky" | "cinder";
type EnemyKind =
  | "runner"
  | "crawler"
  | "artillery"
  | "assassin"
  | "brute"
  | "commander"
  | "shieldmite"
  | "sniper"
  | "splitter"
  | "mortarwasp"
  | "leech"
  | "rammer"
  | "boss";
type BossVariant = "rift" | "storm" | "weaver" | "forge" | "leviathan" | "mirror" | "warden";
type PlayerSide = "host" | "guest";
type BossRelicId = "titan-core" | "overdrive-core" | "chrono-core";
type UpgradeRarity = "common" | "rare" | "epic" | "legendary";
type Upgrade = { id: string; title: string; desc: string; icon: string; classId?: ClassId; secondary?: boolean; ultimate?: boolean; rarity?: UpgradeRarity };
type ShopCategory = "补给" | "武装" | "防御" | "核心";
type ShopItem = { id: string; title: string; desc: string; icon: string; cost: number; category: ShopCategory; rarity: UpgradeRarity; unlockWave?: number; priceRate?: number };
type BossRelic = { id: BossRelicId; title: string; desc: string; icon: string };
type CombatStats = {
  speed: number;
  damage: number;
  interval: number;
  multi: number;
  magnet: number;
  projectileSpeed: number;
  projectileSize: number;
  bonusPierce: number;
  damageReduction: number;
  critChance: number;
  skillHaste: number;
  drones: number;
  missileWaves: number;
  missileCount: number;
  shieldDuration: number;
  repairPower: number;
  dashDistance: number;
  laserPower: number;
  frostPower: number;
  dronePower: number;
  secondaryPower: number;
  secondaryArea: number;
  secondaryProjectiles: number;
  secondaryControl: number;
  ultimatePower: number;
  ultimateTargets: number;
  ultimateLanes: number;
  ultimateDuration: number;
  ultimateRange: number;
  ultimateEchoes: number;
  meleeRange: number;
  meleePower: number;
  gravityPower: number;
  lightningPower: number;
  sniperPower: number;
  burnPower: number;
};
type BuildFrame = CombatStats & { classId: ClassId; maxHp: number };
type ClassSpec = {
  id: ClassId;
  name: string;
  role: string;
  active: string;
  secondary: string;
  passive: string;
  ultimate: string;
  cooldown: number;
  secondaryCooldown: number;
  color: string;
  sprite: number;
  sheet: "core" | "specialist" | "vanguard" | "expedition";
  radius: number;
  renderSize: number;
};
type Actor = { x: number; y: number; r: number; hp: number; maxHp: number; color: string; name?: string; classId?: ClassId };
type Enemy = Actor & {
  id: number;
  speed: number;
  hit: number;
  kind: EnemyKind;
  elite: boolean;
  cooldown: number;
  slow: number;
  frozen?: number;
  stunned?: number;
  bossPhase?: number;
  bossVariant?: BossVariant;
  barrier?: number;
  lastHitBy?: PlayerSide;
  burn?: number;
  burnDamage?: number;
  burnOwner?: PlayerSide;
};
type Shot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  damage: number;
  life: number;
  hostile?: boolean;
  homing?: number;
  owner?: PlayerSide;
  classId?: ClassId;
  enemyKind?: EnemyKind;
  bossVariant?: BossVariant;
  pierce?: number;
  splash?: number;
  slow?: number;
  chain?: boolean;
  burn?: number;
  burnDamage?: number;
  freeze?: number;
  skill2?: boolean;
  hitIds?: number[];
};
type Beam = { x1: number; y1: number; x2: number; y2: number; life: number; width: number; color: string };
type CombatEffect = {
  kind: "skill" | "impact" | "dash" | "revive" | "ultimate" | "slash" | "boss-phase";
  variant?: "secondary";
  classId?: ClassId;
  enemyKind?: EnemyKind;
  bossVariant?: BossVariant;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  count?: number;
  life: number;
  duration: number;
  color: string;
  radius: number;
};
type Gem = { x: number; y: number; value: number; life: number; relic?: BossRelicId; heal?: number };
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
  beams: Beam[];
  effects: CombatEffect[];
  revive: { host: number; guest: number };
  wallet: { host: number; guest: number };
  ultimate: { host: number; guest: number };
  wave: number;
};
type NetPayload =
  | { t: "hello" }
  | { t: "start" }
  | { t: "player"; x: number; y: number }
  | { t: "build"; build: BuildFrame }
  | { t: "upgrade-done"; build: BuildFrame; hp: number }
  | { t: "skill"; classId: ClassId; x: number; y: number }
  | { t: "skill2"; classId: ClassId; x: number; y: number }
  | { t: "ultimate"; classId: ClassId; x: number; y: number }
  | { t: "world"; frame: WorldFrame }
  | { t: "levelup"; level: number }
  | { t: "upgrade-resume" }
  | { t: "shop-open"; wave: number; reward: number; coins: number }
  | { t: "shop-done"; build: BuildFrame; hp: number; coins: number; ultimate: number }
  | { t: "shop-resume" }
  | { t: "boss-loot"; relic: BossRelicId }
  | { t: "pause"; paused: boolean }
  | { t: "gameover"; hostHp: number; guestHp: number | null };
type NetBridge = {
  roomId: string;
  role: "host" | "join";
  room: ReturnType<typeof joinRoom>;
  send: (data: NetPayload) => Promise<void>;
  subscribe: (handler: (data: NetPayload) => void) => () => void;
  connected: () => boolean;
};

const GAME_ASSETS = {
  assassinProjectile: "/game/assassin-projectile.png",
  bladeMech: "/game/blade-mech.png",
  bossProjectiles: "/game/boss-projectiles.png",
  bossProjectilesV2: "/game/boss-projectiles-v2.png",
  bossVariants: "/game/boss-variants.png",
  bossVariantsV2: "/game/boss-variants-v2.png",
  cinderForgeMech: "/game/cinder-forge-mech.png",
  enemyMechs: "/game/enemy-mechs.png",
  enemyReinforcementProjectiles: "/game/enemy-reinforcement-projectiles.png",
  enemyReinforcements: "/game/enemy-reinforcements.png",
  enemyProjectiles: "/game/enemy-projectiles.png",
  frostMech: "/game/frost-mech.png",
  gravityMech: "/game/gravity-mech.png",
  laserMech: "/game/laser-mech.png",
  playerMechs: "/game/player-mechs.png",
  projectileMechs: "/game/projectile-mechs.png",
  specialistDrones: "/game/specialist-drones.png",
  specialistProjectiles: "/game/specialist-projectiles.png",
  supportDrones: "/game/support-drones.png",
  skyTalonMech: "/game/sky-talon-mech.png",
  thunderMech: "/game/thunder-mech.png",
  v2SupportAssets: "/game/v2-support-assets.png",
  vanguardDrones: "/game/vanguard-drones.png",
  vanguardProjectiles: "/game/vanguard-projectiles.png",
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
  { id: "drone", title: "蜂群协议", desc: "增加 1 架当前职业专属无人机", icon: "✣" },
  { id: "repair", title: "纳米修复", desc: "立即回复 35 点生命", icon: "✚" },
];

const CLASS_UPGRADES: Record<ClassId, Upgrade[]> = {
  assault: [
    { id: "assault-double-storm", classId: "assault", title: "双重风暴", desc: "导弹风暴追加一轮齐射", icon: "✹" },
    { id: "assault-saturation", classId: "assault", title: "饱和弹舱", desc: "每轮导弹数量 +4", icon: "✦" },
    { id: "assault-warhead", classId: "assault", title: "炽核战斗部", desc: "火力 +18%，爆炸范围扩大", icon: "◆" },
  ],
  guardian: [
    { id: "guardian-fortress", classId: "guardian", title: "永固壁垒", desc: "绝对屏障持续时间 +0.75 秒，最多 5 秒", icon: "⬢" },
    { id: "guardian-rail", classId: "guardian", title: "震荡轨炮", desc: "重炮伤害 +24%，弹体更大", icon: "▰" },
    { id: "guardian-plating", classId: "guardian", title: "泰坦覆甲", desc: "生命上限 +28，额外减伤 5%", icon: "▣" },
  ],
  engineer: [
    { id: "engineer-swarm", classId: "engineer", title: "蜂群扩编", desc: "增加 1 架专属无人机", icon: "✣" },
    { id: "engineer-link", classId: "engineer", title: "高压链路", desc: "无人机伤害 +35%", icon: "⌁" },
    { id: "engineer-repair", classId: "engineer", title: "战地工坊", desc: "修复脉冲治疗量 +40%", icon: "✚" },
  ],
  phantom: [
    { id: "phantom-fold", classId: "phantom", title: "折跃增程", desc: "相位突进距离 +70", icon: "➟" },
    { id: "phantom-needle", classId: "phantom", title: "虚空针簇", desc: "暴击率 +12%，伤害 +12%", icon: "✧" },
    { id: "phantom-cycle", classId: "phantom", title: "相位回路", desc: "主动技能冷却 -22%", icon: "◌" },
  ],
  laser: [
    { id: "laser-overfocus", classId: "laser", title: "超焦透镜", desc: "聚焦光束伤害与宽度 +30%", icon: "┃" },
    { id: "laser-prism", classId: "laser", title: "分光棱镜", desc: "弹丸伤害 +16%，额外一发弹丸", icon: "◇" },
    { id: "laser-capacitor", classId: "laser", title: "赤曜电容", desc: "主动技能冷却 -20%", icon: "◎" },
  ],
  frost: [
    { id: "frost-zero", classId: "frost", title: "绝对零芯", desc: "冻结范围、伤害和减速时长 +28%", icon: "❄" },
    { id: "frost-shatter", classId: "frost", title: "冰晶爆裂", desc: "炮弹伤害 +20%，弹体更大", icon: "✣" },
    { id: "frost-armor", classId: "frost", title: "低温装甲", desc: "生命上限 +24，额外减伤 5%", icon: "⬡" },
  ],
  blade: [
    { id: "blade-edge", classId: "blade", title: "延展刃域", desc: "近战范围 +18%，斩击伤害 +16%", icon: "〆" },
    { id: "blade-vamp", classId: "blade", title: "噬能回路", desc: "斩击修复量 +45%，生命上限 +16", icon: "✚" },
    { id: "blade-tempo", classId: "blade", title: "连斩协议", desc: "斩击间隔 -15%，移动速度 +8%", icon: "⚔" },
  ],
  gravity: [
    { id: "gravity-collapse", classId: "gravity", title: "坍缩增幅", desc: "奇点范围与伤害 +28%", icon: "◉" },
    { id: "gravity-lens", classId: "gravity", title: "引力透镜", desc: "炮弹伤害 +18%，额外穿透 1 名敌人", icon: "◌" },
    { id: "gravity-anchor", classId: "gravity", title: "事件锚点", desc: "生命上限 +22，主动技能冷却 -15%", icon: "⬢" },
  ],
  thunder: [
    { id: "thunder-capacitor", classId: "thunder", title: "雷核增压", desc: "连锁闪电伤害与跳跃距离 +25%", icon: "ϟ" },
    { id: "thunder-network", classId: "thunder", title: "并联电弧", desc: "主动技能额外锁定 2 个目标", icon: "⌁" },
    { id: "thunder-cycle", classId: "thunder", title: "超导回路", desc: "射击间隔 -10%，主动技能冷却 -12%", icon: "◎" },
  ],
  sky: [
    { id: "sky-focus", classId: "sky", title: "天穹焦镜", desc: "轨道狙击与暴击伤害 +24%", icon: "⌖" },
    { id: "sky-penetrator", classId: "sky", title: "贯星弹芯", desc: "主炮额外穿透 2 名敌人，弹速 +12%", icon: "➤" },
    { id: "sky-thruster", classId: "sky", title: "隼翼推进", desc: "移动速度 +10%，射击间隔 -8%", icon: "△" },
  ],
  cinder: [
    { id: "cinder-furnace", classId: "cinder", title: "焚城炉心", desc: "灼烧伤害与持续时间 +28%", icon: "♨" },
    { id: "cinder-nozzle", classId: "cinder", title: "裂焰喷口", desc: "熔岩弹爆炸范围与弹体 +22%", icon: "◆" },
    { id: "cinder-plating", classId: "cinder", title: "黑曜热甲", desc: "生命上限 +26，减伤 +4%", icon: "⬢" },
  ],
};

const SECONDARY_UPGRADES: Record<ClassId, Upgrade[]> = {
  assault: [
    { id: "assault-secondary-power", classId: "assault", secondary: true, title: "标枪增压", desc: "爆破标枪伤害 +22%，可无限叠加", icon: "➤", rarity: "rare" },
    { id: "assault-secondary-salvo", classId: "assault", secondary: true, title: "分裂标枪", desc: "爆破标枪额外发射 1 枚，最多 3 枚", icon: "✹", rarity: "epic" },
  ],
  guardian: [
    { id: "guardian-secondary-power", classId: "guardian", secondary: true, title: "壁垒增压", desc: "震荡壁垒伤害 +22%，可无限叠加", icon: "⬢", rarity: "rare" },
    { id: "guardian-secondary-radius", classId: "guardian", secondary: true, title: "扩张力场", desc: "震荡范围与击退距离 +15%，最多强化 3 次", icon: "◉", rarity: "epic" },
  ],
  engineer: [
    { id: "engineer-secondary-power", classId: "engineer", secondary: true, title: "猎群增压", desc: "追猎蜂群伤害 +22%，可无限叠加", icon: "✣", rarity: "rare" },
    { id: "engineer-secondary-swarm", classId: "engineer", secondary: true, title: "蜂群扩列", desc: "追猎蜂群额外发射 2 枚脉冲弹，最多增加 6 枚", icon: "⌁", rarity: "epic" },
  ],
  phantom: [
    { id: "phantom-secondary-power", classId: "phantom", secondary: true, title: "回刃增压", desc: "相位回刃伤害 +22%，可无限叠加", icon: "✧", rarity: "rare" },
    { id: "phantom-secondary-blades", classId: "phantom", secondary: true, title: "裂相刃阵", desc: "相位回刃额外发射 1 枚，最多 5 枚", icon: "◇", rarity: "epic" },
  ],
  laser: [
    { id: "laser-secondary-power", classId: "laser", secondary: true, title: "棱镜增压", desc: "棱镜十字伤害 +22%，可无限叠加", icon: "┃", rarity: "rare" },
    { id: "laser-secondary-facets", classId: "laser", secondary: true, title: "多面棱镜", desc: "棱镜十字增加 1 条交叉轴，最多 4 条轴", icon: "✳", rarity: "epic" },
  ],
  frost: [
    { id: "frost-secondary-power", classId: "frost", secondary: true, title: "冰枪增压", desc: "冰狱长枪伤害 +22%，可无限叠加", icon: "❄", rarity: "rare" },
    { id: "frost-secondary-control", classId: "frost", secondary: true, title: "深寒裂解", desc: "冰枪冻结、减速与碎裂范围 +18%，最多强化 3 次", icon: "✣", rarity: "epic" },
  ],
  blade: [
    { id: "blade-secondary-power", classId: "blade", secondary: true, title: "圆舞增压", desc: "旋刃圆舞伤害 +22%，可无限叠加", icon: "⚔", rarity: "rare" },
    { id: "blade-secondary-radius", classId: "blade", secondary: true, title: "延展圆舞", desc: "旋刃圆舞范围 +15%，最多强化 3 次", icon: "〆", rarity: "epic" },
  ],
  gravity: [
    { id: "gravity-secondary-power", classId: "gravity", secondary: true, title: "斥力增压", desc: "斥力反转伤害 +22%，可无限叠加", icon: "◉", rarity: "rare" },
    { id: "gravity-secondary-radius", classId: "gravity", secondary: true, title: "反转扩域", desc: "斥力反转范围与击退距离 +15%，最多强化 3 次", icon: "◎", rarity: "epic" },
  ],
  thunder: [
    { id: "thunder-secondary-power", classId: "thunder", secondary: true, title: "脉冲增压", desc: "电磁脉冲伤害 +22%，可无限叠加", icon: "ϟ", rarity: "rare" },
    { id: "thunder-secondary-nodes", classId: "thunder", secondary: true, title: "扩散节点", desc: "电磁脉冲额外锁定 2 个目标，最多增加 6 个", icon: "⌁", rarity: "epic" },
  ],
  sky: [
    { id: "sky-secondary-power", classId: "sky", secondary: true, title: "猎杀增压", desc: "猎杀标记伤害 +22%，可无限叠加", icon: "⌖", rarity: "rare" },
    { id: "sky-secondary-locks", classId: "sky", secondary: true, title: "多重标记", desc: "猎杀标记额外降下 1 发轨道矛，最多 6 发", icon: "✦", rarity: "legendary" },
  ],
  cinder: [
    { id: "cinder-secondary-power", classId: "cinder", secondary: true, title: "地雷增压", desc: "熔火地雷伤害 +22%，可无限叠加", icon: "♨", rarity: "rare" },
    { id: "cinder-secondary-scorch", classId: "cinder", secondary: true, title: "焦土核心", desc: "熔火地雷爆炸范围与灼烧时间 +18%，最多强化 3 次", icon: "◆", rarity: "epic" },
  ],
};

const ULTIMATE_UPGRADES: Record<ClassId, Upgrade[]> = {
  assault: [
    { id: "assault-ultimate-power", classId: "assault", ultimate: true, title: "天穹增压", desc: "天穹火雨伤害 +20%，可无限叠加", icon: "✹" },
    { id: "assault-ultimate-locks", classId: "assault", ultimate: true, title: "多重锁定", desc: "天穹火雨锁定目标 +2，最多锁定 14 个", icon: "⌖" },
  ],
  guardian: [
    { id: "guardian-ultimate-power", classId: "guardian", ultimate: true, title: "壁垒震波", desc: "不灭要塞震波伤害 +20%，可无限叠加", icon: "⬢" },
    { id: "guardian-ultimate-duration", classId: "guardian", ultimate: true, title: "持久阵地", desc: "不灭要塞持续时间 +0.5 秒，最多 5.4 秒", icon: "▣" },
  ],
  engineer: [
    { id: "engineer-ultimate-power", classId: "engineer", ultimate: true, title: "蜂群超频", desc: "蜂群超载伤害 +20%，可无限叠加", icon: "✣" },
    { id: "engineer-ultimate-locks", classId: "engineer", ultimate: true, title: "协同猎杀", desc: "蜂群锁定目标 +3，最多锁定 20 个", icon: "⌁" },
  ],
  phantom: [
    { id: "phantom-ultimate-power", classId: "phantom", ultimate: true, title: "处决增幅", desc: "虚空猎杀伤害 +20%，可无限叠加", icon: "✧" },
    { id: "phantom-ultimate-locks", classId: "phantom", ultimate: true, title: "猎杀名单", desc: "连锁处决目标 +2，最多锁定 13 个", icon: "⌖" },
  ],
  laser: [
    { id: "laser-ultimate-power", classId: "laser", ultimate: true, title: "审判增压", desc: "赤曜审判伤害 +20%，可无限叠加", icon: "┃" },
    { id: "laser-ultimate-lanes", classId: "laser", ultimate: true, title: "全向扩列", desc: "赤曜审判放射光束 +2，最多 16 束", icon: "✳" },
  ],
  frost: [
    { id: "frost-ultimate-power", classId: "frost", ultimate: true, title: "永冻增压", desc: "永冻纪元伤害 +20%，可无限叠加", icon: "❄" },
    { id: "frost-ultimate-lanes", classId: "frost", ultimate: true, title: "冰川分束", desc: "永冻纪元寒冰光束 +1，最多 4 束", icon: "〽" },
  ],
  blade: [
    { id: "blade-ultimate-power", classId: "blade", ultimate: true, title: "断界增压", desc: "红莲断界伤害 +20%，可无限叠加", icon: "⚔" },
    { id: "blade-ultimate-echoes", classId: "blade", ultimate: true, title: "残像连斩", desc: "断界追击斩 +1，最多 4 重斩击", icon: "〆" },
  ],
  gravity: [
    { id: "gravity-ultimate-power", classId: "gravity", ultimate: true, title: "视界增压", desc: "事件视界伤害 +20%，可无限叠加", icon: "◉" },
    { id: "gravity-ultimate-range", classId: "gravity", ultimate: true, title: "视界扩张", desc: "事件视界半径 +80，最多 670", icon: "◎" },
  ],
  thunder: [
    { id: "thunder-ultimate-power", classId: "thunder", ultimate: true, title: "雷域增压", desc: "天罚雷域伤害 +20%，可无限叠加", icon: "ϟ" },
    { id: "thunder-ultimate-locks", classId: "thunder", ultimate: true, title: "风暴标记", desc: "天罚雷域额外锁定 2 个目标，最多 16 个", icon: "⌁" },
  ],
  sky: [
    { id: "sky-ultimate-power", classId: "sky", ultimate: true, title: "轨道增压", desc: "神矛阵列伤害 +20%，可无限叠加", icon: "⌖" },
    { id: "sky-ultimate-locks", classId: "sky", ultimate: true, title: "多重照准", desc: "神矛阵列额外锁定 1 个目标，最多 9 个", icon: "✦" },
  ],
  cinder: [
    { id: "cinder-ultimate-power", classId: "cinder", ultimate: true, title: "熔城增压", desc: "炼狱推进伤害 +20%，可无限叠加", icon: "♨" },
    { id: "cinder-ultimate-lanes", classId: "cinder", ultimate: true, title: "火墙增殖", desc: "炼狱推进额外生成 1 道火墙，最多 5 道", icon: "▰" },
  ],
};

const SHOP_ITEMS: ShopItem[] = [
  { id: "medkit", title: "战地医疗包", desc: "立即回复 36 点机体完整度", icon: "✚", cost: 28, category: "补给", rarity: "common", priceRate: .035 },
  { id: "repair-gel", title: "自愈凝胶", desc: "回复 22 点生命，并使生命上限 +4", icon: "◈", cost: 42, category: "补给", rarity: "common" },
  { id: "ult-battery", title: "终极电容", desc: "立即补充 22% 终极能量", icon: "✦", cost: 46, category: "补给", rarity: "rare", unlockWave: 2 },
  { id: "combat-cocktail", title: "应急战斗剂", desc: "回复 18 点生命并补充 12% 终极能量", icon: "⌁", cost: 62, category: "补给", rarity: "rare", unlockWave: 4 },
  { id: "full-service", title: "方舟整备舱", desc: "立即修复 32% 最大生命值", icon: "⬡", cost: 92, category: "补给", rarity: "epic", unlockWave: 6, priceRate: .055 },

  { id: "ammo", title: "高能弹药", desc: "本局伤害永久 +8%", icon: "◆", cost: 54, category: "武装", rarity: "common" },
  { id: "coolant", title: "相变冷却液", desc: "射击间隔永久 -6%", icon: "❉", cost: 58, category: "武装", rarity: "common" },
  { id: "crit-optic", title: "量子瞄准镜", desc: "暴击率 +6%，弹丸速度 +8%", icon: "⌖", cost: 68, category: "武装", rarity: "rare", unlockWave: 2 },
  { id: "projectile-core", title: "磁轨膛芯", desc: "伤害 +5%，弹速 +14%，弹体略微增大", icon: "➤", cost: 76, category: "武装", rarity: "rare", unlockWave: 3 },
  { id: "multi-loader", title: "复联装填器", desc: "额外弹丸 +1，但射击间隔增加 7%", icon: "⌬", cost: 104, category: "武装", rarity: "epic", unlockWave: 5, priceRate: .085 },

  { id: "overhaul", title: "装甲大修", desc: "生命上限 +12，并修复新增部分", icon: "▣", cost: 64, category: "防御", rarity: "common" },
  { id: "servo", title: "矢量伺服器", desc: "移动速度永久 +7%", icon: "➜", cost: 52, category: "防御", rarity: "common" },
  { id: "armor-plate", title: "偏转复合甲", desc: "受到的伤害永久 -4%", icon: "⬢", cost: 74, category: "防御", rarity: "rare", unlockWave: 2 },
  { id: "adaptive-hull", title: "自适应机壳", desc: "生命上限 +8、减伤 +2%，并修复 16 点", icon: "◇", cost: 88, category: "防御", rarity: "rare", unlockWave: 4, priceRate: .075 },
  { id: "evasion-drive", title: "闪避推进器", desc: "移动速度 +5%，减伤 +2%，技能冷却 -3%", icon: "〽", cost: 96, category: "防御", rarity: "epic", unlockWave: 6, priceRate: .08 },

  { id: "collector", title: "磁力扩展器", desc: "拾取范围永久 +14%", icon: "◉", cost: 44, category: "核心", rarity: "common" },
  { id: "drone-kit", title: "无人机组装包", desc: "增加 1 架本职业无人机", icon: "✣", cost: 108, category: "核心", rarity: "epic", unlockWave: 2, priceRate: .095 },
  { id: "reactor-cell", title: "反应堆电池", desc: "主动技能冷却永久 -7%", icon: "◌", cost: 82, category: "核心", rarity: "rare", unlockWave: 3 },
  { id: "drone-overclock", title: "蜂群超频芯片", desc: "无人机伤害永久 +20%", icon: "✥", cost: 90, category: "核心", rarity: "rare", unlockWave: 4 },
  { id: "signature-module", title: "职业校准模组", desc: "强化当前机甲的独特主动或被动机制", icon: "◎", cost: 102, category: "核心", rarity: "epic", unlockWave: 5, priceRate: .09 },
  { id: "ultimate-amplifier", title: "终极增幅核心", desc: "终极大招伤害永久 +12%", icon: "✹", cost: 122, category: "核心", rarity: "legendary", unlockWave: 7, priceRate: .105 },
];

const BOSS_RELICS: BossRelic[] = [
  { id: "titan-core", title: "泰坦残核", desc: "全队生命上限 +18、减伤 +4%", icon: "⬢" },
  { id: "overdrive-core", title: "过载燃芯", desc: "全队伤害 +14%、射击间隔 -6%", icon: "✹" },
  { id: "chrono-core", title: "时序结晶", desc: "全队技能冷却 -10%、移动速度 +6%", icon: "◌" },
];

const ULTIMATE_NAMES: Record<ClassId, string> = {
  assault: "天穹火雨",
  guardian: "不灭要塞",
  engineer: "蜂群超载",
  phantom: "虚空猎杀",
  laser: "赤曜审判",
  frost: "永冻纪元",
  blade: "红莲断界",
  gravity: "事件视界",
  thunder: "天罚雷域",
  sky: "神矛阵列",
  cinder: "炼狱推进",
};

const ULTIMATE_CHARGE_SCALE: Record<ClassId, number> = {
  assault: .62,
  guardian: .55,
  engineer: .6,
  phantom: .72,
  laser: .5,
  frost: .58,
  blade: .7,
  gravity: .5,
  thunder: .54,
  sky: .48,
  cinder: .57,
};

const UPGRADE_RARITY: Partial<Record<string, UpgradeRarity>> = {
  multi: "rare",
  armor: "rare",
  critical: "rare",
  reactor: "rare",
  drone: "epic",
  "assault-double-storm": "epic",
  "assault-saturation": "rare",
  "guardian-fortress": "rare",
  "guardian-plating": "epic",
  "engineer-swarm": "epic",
  "engineer-link": "rare",
  "phantom-fold": "rare",
  "phantom-needle": "rare",
  "laser-overfocus": "rare",
  "laser-prism": "rare",
  "frost-zero": "rare",
  "frost-armor": "rare",
  "blade-vamp": "epic",
  "blade-tempo": "rare",
  "gravity-collapse": "rare",
  "gravity-lens": "rare",
  "gravity-anchor": "epic",
  "thunder-capacitor": "rare",
  "thunder-network": "epic",
  "thunder-cycle": "rare",
  "sky-focus": "rare",
  "sky-penetrator": "epic",
  "sky-thruster": "rare",
  "cinder-furnace": "rare",
  "cinder-nozzle": "rare",
  "cinder-plating": "epic",
  "assault-ultimate-power": "rare",
  "assault-ultimate-locks": "rare",
  "guardian-ultimate-power": "rare",
  "guardian-ultimate-duration": "epic",
  "engineer-ultimate-power": "rare",
  "engineer-ultimate-locks": "rare",
  "phantom-ultimate-power": "rare",
  "phantom-ultimate-locks": "epic",
  "laser-ultimate-power": "rare",
  "laser-ultimate-lanes": "legendary",
  "frost-ultimate-power": "rare",
  "frost-ultimate-lanes": "epic",
  "blade-ultimate-power": "rare",
  "blade-ultimate-echoes": "legendary",
  "gravity-ultimate-power": "rare",
  "gravity-ultimate-range": "epic",
  "thunder-ultimate-power": "rare",
  "thunder-ultimate-locks": "epic",
  "sky-ultimate-power": "rare",
  "sky-ultimate-locks": "legendary",
  "cinder-ultimate-power": "rare",
  "cinder-ultimate-lanes": "epic",
};
const UPGRADE_RARITY_GROWTH_CAP_WAVE = 12;
const RARITY_WEIGHTS: Record<UpgradeRarity, number> = { common: 52, rare: 32, epic: 16, legendary: 7 };
const RARITY_LATE_WAVE_BONUS: Record<UpgradeRarity, number> = { common: -8, rare: 10, epic: 14, legendary: 11 };
const RARITY_LABELS: Record<UpgradeRarity, string> = { common: "普通", rare: "稀有", epic: "史诗", legendary: "传说" };
const upgradeRarity = (upgrade: Upgrade): UpgradeRarity => upgrade.rarity || UPGRADE_RARITY[upgrade.id] || "common";
const upgradeRarityWeight = (rarity: UpgradeRarity, wave: number) => {
  const progress = Math.min(1, Math.max(0, (Math.max(1, wave) - 1) / (UPGRADE_RARITY_GROWTH_CAP_WAVE - 1)));
  return Math.max(1, RARITY_WEIGHTS[rarity] + RARITY_LATE_WAVE_BONUS[rarity] * progress);
};

const GUARDIAN_SHIELD_MAX = 5;
const MIN_GUARDIAN_COOLDOWN = 7;
const MAX_UPGRADE_REROLLS = 2;
const MAX_SHOP_REROLLS = 3;
const roundShopPrice = (value: number) => Math.max(5, Math.ceil(value / 5) * 5);
const shopRerollPrice = (wave: number, used: number, wallet: number) => {
  const lateWave = Math.max(0, wave - 1);
  const wavePrice = (14 + wave * 4 + Math.pow(lateWave, 1.58) * 2.5) * (1 + used * .42);
  const economyFloor = wallet * (.04 + used * .032);
  return roundShopPrice(Math.max(wavePrice, economyFloor));
};
const upgradeRerollPrice = (wave: number, used: number) => 4 + Math.floor(Math.max(0, wave - 1) / 4) + used * 3;
const shuffled = <T,>(items: T[]) => [...items].sort(() => Math.random() - .5);
const ultimateUpgradeAvailable = (upgrade: Upgrade, currentBuild: BuildFrame) => {
  if (upgrade.id === "assault-ultimate-locks") return currentBuild.ultimateTargets < 14;
  if (upgrade.id === "guardian-ultimate-duration") return currentBuild.ultimateDuration < 5.4;
  if (upgrade.id === "engineer-ultimate-locks") return currentBuild.ultimateTargets < 20;
  if (upgrade.id === "phantom-ultimate-locks") return currentBuild.ultimateTargets < 13;
  if (upgrade.id === "laser-ultimate-lanes") return currentBuild.ultimateLanes < 16;
  if (upgrade.id === "frost-ultimate-lanes") return currentBuild.ultimateLanes < 4;
  if (upgrade.id === "blade-ultimate-echoes") return currentBuild.ultimateEchoes < 4;
  if (upgrade.id === "gravity-ultimate-range") return currentBuild.ultimateRange < 670;
  if (upgrade.id === "thunder-ultimate-locks") return currentBuild.ultimateTargets < 16;
  if (upgrade.id === "sky-ultimate-locks") return currentBuild.ultimateTargets < 9;
  if (upgrade.id === "cinder-ultimate-lanes") return currentBuild.ultimateLanes < 5;
  return true;
};
const secondaryUpgradeAvailable = (upgrade: Upgrade, currentBuild: BuildFrame) => {
  if (upgrade.id === "assault-secondary-salvo") return currentBuild.secondaryProjectiles < 2;
  if (upgrade.id === "guardian-secondary-radius") return currentBuild.secondaryArea < 1.5;
  if (upgrade.id === "engineer-secondary-swarm") return currentBuild.secondaryProjectiles < 6;
  if (upgrade.id === "phantom-secondary-blades") return currentBuild.secondaryProjectiles < 2;
  if (upgrade.id === "laser-secondary-facets") return currentBuild.secondaryProjectiles < 2;
  if (upgrade.id === "frost-secondary-control") return currentBuild.secondaryControl < 1.6;
  if (upgrade.id === "blade-secondary-radius") return currentBuild.secondaryArea < 1.5;
  if (upgrade.id === "gravity-secondary-radius") return currentBuild.secondaryArea < 1.5;
  if (upgrade.id === "thunder-secondary-nodes") return currentBuild.secondaryProjectiles < 6;
  if (upgrade.id === "sky-secondary-locks") return currentBuild.secondaryProjectiles < 3;
  if (upgrade.id === "cinder-secondary-scorch") return currentBuild.secondaryArea < 1.6;
  return true;
};
const weightedUpgradePick = (items: Upgrade[], excludedIds: Set<string>, wave: number) => {
  const available = items.filter((upgrade) => !excludedIds.has(upgrade.id));
  const weighted = available.map((upgrade) => {
    const rarity = upgradeRarity(upgrade);
    return { upgrade, rarity, weight: upgradeRarityWeight(rarity, wave) };
  });
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return { ...entry.upgrade, rarity: entry.rarity };
  }
  const fallback = weighted[weighted.length - 1];
  return fallback ? { ...fallback.upgrade, rarity: fallback.rarity } : null;
};
const rollUpgradeChoices = (classId: ClassId, currentBuild: BuildFrame, wave: number) => {
  const availableUltimate = ULTIMATE_UPGRADES[classId].filter((upgrade) => ultimateUpgradeAvailable(upgrade, currentBuild));
  const availableSecondary = SECONDARY_UPGRADES[classId].filter((upgrade) => secondaryUpgradeAvailable(upgrade, currentBuild));
  const classPool = [...CLASS_UPGRADES[classId], ...availableSecondary, ...availableUltimate];
  const fullPool = [...UPGRADES, ...classPool];
  const excluded = new Set<string>();
  const choices: Upgrade[] = [];
  while (choices.length < 4) {
    const choice = weightedUpgradePick(fullPool, excluded, wave);
    if (!choice) break;
    choices.push(choice);
    excluded.add(choice.id);
  }
  return shuffled(choices);
};
const SHOP_CATEGORIES: ShopCategory[] = ["补给", "武装", "防御", "核心"];
const SHOP_CATEGORY_PRICE_RATE: Record<ShopCategory, number> = { 补给: .028, 武装: .045, 防御: .042, 核心: .055 };
const SHOP_RARITY_WEIGHTS: Record<UpgradeRarity, number> = { common: 62, rare: 26, epic: 9, legendary: 3 };
const SHOP_RARITY_PRICE_MULTIPLIER: Record<UpgradeRarity, number> = { common: 1, rare: 1.05, epic: 1.14, legendary: 1.28 };
const weightedShopPick = (items: ShopItem[]) => {
  const totalWeight = items.reduce((sum, item) => sum + SHOP_RARITY_WEIGHTS[item.rarity], 0);
  let roll = Math.random() * totalWeight;
  for (const item of items) {
    roll -= SHOP_RARITY_WEIGHTS[item.rarity];
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
};
const rollShopItems = (wave: number, wallet: number, recentIds: string[] = []) => {
  const lateWave = Math.max(0, wave - 1);
  const priceScale = 1 + lateWave * .125 + Math.pow(lateWave, 1.42) * .05;
  const unlocked = SHOP_ITEMS.filter((item) => (item.unlockWave || 1) <= wave);
  const recent = new Set(recentIds);
  const picked = new Set<string>();
  const choices = SHOP_CATEGORIES.flatMap((category) => {
    const categoryItems = unlocked.filter((item) => item.category === category && !picked.has(item.id));
    const freshItems = categoryItems.filter((item) => !recent.has(item.id));
    const item = weightedShopPick(freshItems.length ? freshItems : categoryItems);
    if (!item) return [];
    picked.add(item.id);
    const economyFloor = wallet * (item.priceRate || SHOP_CATEGORY_PRICE_RATE[item.category]) * .82;
    const rarityPrice = item.cost * .88 * priceScale * SHOP_RARITY_PRICE_MULTIPLIER[item.rarity];
    return [{ ...item, cost: roundShopPrice(Math.max(rarityPrice, economyFloor)) }];
  });
  const shuffledChoices = shuffled(choices);
  if (wallet >= 5 && shuffledChoices.length && !shuffledChoices.some((item) => item.cost <= wallet)) {
    const affordableCost = Math.max(5, Math.floor(wallet / 5) * 5);
    const fallback = unlocked
      .filter((item) => item.rarity === "common")
      .sort((a, b) => a.cost - b.cost)[0];
    if (fallback) {
      const fallbackIndex = shuffledChoices.findIndex((item) => item.id === fallback.id);
      const replaceIndex = fallbackIndex >= 0
        ? fallbackIndex
        : Math.max(0, shuffledChoices.findIndex((item) => item.category === fallback.category));
      shuffledChoices[replaceIndex] = { ...fallback, cost: affordableCost };
    } else {
      const cheapestIndex = shuffledChoices.reduce(
        (best, item, index) => item.cost < shuffledChoices[best].cost ? index : best,
        0,
      );
      shuffledChoices[cheapestIndex] = { ...shuffledChoices[cheapestIndex], cost: affordableCost };
    }
  }
  return shuffledChoices;
};

const WAVE_INTERVAL_SECONDS = 45;
const SHOP_EVERY_WAVES = 2;
const supplyRewardFor = (kills: number, wave: number) =>
  Math.max(8, Math.round(Math.sqrt(Math.max(0, kills)) * 3.2 + wave * 2.5));

const CLASSES: ClassSpec[] = [
  { id: "assault", name: "强袭型", role: "高火力突击", active: "导弹风暴：向四周发射高伤导弹", secondary: "爆破标枪：锁定高威胁目标并引爆重型弹头", passive: "爆破弹：命中产生范围爆炸", ultimate: "天穹火雨：锁定多个敌群，从空中逐点轰炸", cooldown: 10, secondaryCooldown: 8, color: "#f4c95d", sprite: 0, sheet: "core", radius: 18, renderSize: 78 },
  { id: "guardian", name: "堡垒型", role: "重甲守卫", active: "绝对屏障：免疫伤害，强化上限 5 秒", secondary: "震荡壁垒：击退并麻痹周围敌人", passive: "穿甲重炮：可连续贯穿多个敌人", ultimate: "不灭要塞：展开六面护盾阵地并持续修复队伍", cooldown: 14, secondaryCooldown: 11, color: "#58c7c0", sprite: 1, sheet: "core", radius: 24, renderSize: 88 },
  { id: "engineer", name: "技师型", role: "无人机支援", active: "修复脉冲：为全队回复生命", secondary: "追猎蜂群：无人机齐射追踪脉冲弹", passive: "链式脉冲：无人机弹丸会跳跃攻击", ultimate: "蜂群超载：召来轨道蜂群逐一猎杀并链式放电", cooldown: 16, secondaryCooldown: 10, color: "#92a35c", sprite: 2, sheet: "core", radius: 20, renderSize: 82 },
  { id: "phantom", name: "幻影型", role: "高速刺杀", active: "相位突进：瞬移并短暂无敌", secondary: "相位回刃：发射三枚高穿透折返刃", passive: "相位针刺：高射速、高暴击并可贯穿", ultimate: "虚空猎杀：在高威胁目标之间连续相位处决", cooldown: 9, secondaryCooldown: 7, color: "#9ec9ff", sprite: 3, sheet: "core", radius: 14, renderSize: 72 },
  { id: "laser", name: "赤曜型", role: "贯穿激光猎手", active: "聚焦光束：发射横贯战场的高能激光", secondary: "棱镜十字：向目标交叉发射四道贯穿光束", passive: "热能射线：高速弹丸可贯穿多名敌人", ultimate: "赤曜审判：以机体为中心向四面八方发射贯穿激光", cooldown: 12, secondaryCooldown: 9, color: "#ff5b58", sprite: 0, sheet: "specialist", radius: 15, renderSize: 82 },
  { id: "frost", name: "霜垒型", role: "冰冻攻城炮", active: "绝对零域：冻结附近敌人并造成伤害", secondary: "冰狱长枪：发射可冻结并碎裂的重型冰枪", passive: "低温弹头：命中后显著降低敌人速度", ultimate: "永冻纪元：向前推进冰川风暴，冻结整条战线", cooldown: 15, secondaryCooldown: 10, color: "#8bdcff", sprite: 1, sheet: "specialist", radius: 25, renderSize: 94 },
  { id: "blade", name: "裂锋型", role: "等离子近战", active: "磁轨冲锋：扑向目标并释放双重圆弧斩", secondary: "旋刃圆舞：高速回旋刀身并斩击近敌", passive: "熔断刃：近距离自动斩击并修复少量生命", ultimate: "红莲断界：沿一条战线高速突进并留下连环斩痕", cooldown: 10, secondaryCooldown: 8, color: "#ff9b43", sprite: 0, sheet: "vanguard", radius: 18, renderSize: 86 },
  { id: "gravity", name: "星渊型", role: "重力控场", active: "坍缩奇点：牵引附近敌人并引爆核心", secondary: "斥力反转：反向重力击退并重创近敌", passive: "引力弹：穿透、减速并产生小型爆炸", ultimate: "事件视界：在敌群中心制造奇点，持续牵引后坍缩", cooldown: 14, secondaryCooldown: 11, color: "#a58cff", sprite: 1, sheet: "vanguard", radius: 23, renderSize: 92 },
  { id: "thunder", name: "雷霆型", role: "连锁电弧控场", active: "雷链过载：自动串联附近敌人并短暂麻痹", secondary: "电磁脉冲：范围麻痹并扩散多重电弧", passive: "感应雷弹：命中后电弧跳跃至附近目标", ultimate: "天罚雷域：连续标记高威胁目标并降下多轮落雷", cooldown: 12, secondaryCooldown: 9, color: "#48dfff", sprite: 0, sheet: "expedition", radius: 17, renderSize: 86 },
  { id: "sky", name: "天隼型", role: "超远程轨道狙击", active: "贯星狙击：贯穿整条战线并重创首领", secondary: "猎杀标记：向首领或强敌降下三发轨道矛", passive: "弱点照准：高伤害、高暴击、超高速贯穿弹", ultimate: "神矛阵列：轨道光矛依次点杀最高威胁目标", cooldown: 14, secondaryCooldown: 12, color: "#ff6a62", sprite: 1, sheet: "expedition", radius: 15, renderSize: 88 },
  { id: "cinder", name: "熔炉型", role: "重装燃烧推进", active: "焚城喷流：向敌群喷出锥形烈焰并持续灼烧", secondary: "熔火地雷：投射爆炸核心并留下持续灼烧", passive: "熔岩弹：爆炸后点燃范围内敌人", ultimate: "炼狱推进：多道火墙横推战场并留下燃烧地带", cooldown: 13, secondaryCooldown: 10, color: "#ff8a32", sprite: 2, sheet: "expedition", radius: 26, renderSize: 98 },
];

const BOSS_VARIANTS: Record<BossVariant, { name: string; sprite: number; sheet: "core" | "v2"; color: string; hp: number; speed: number; hit: number; range: number }> = {
  rift: { name: "裂界泰坦", sprite: 0, sheet: "core", color: "#ff4f7c", hp: 1, speed: 1, hit: 1, range: 305 },
  storm: { name: "雷暴航母", sprite: 1, sheet: "core", color: "#5ca9ff", hp: .86, speed: 1.18, hit: .9, range: 385 },
  weaver: { name: "深渊织母", sprite: 2, sheet: "core", color: "#b37cff", hp: .92, speed: 1.24, hit: .82, range: 255 },
  forge: { name: "熔炉巨像", sprite: 3, sheet: "core", color: "#ff8b42", hp: 1.28, speed: .76, hit: 1.2, range: 335 },
  leviathan: { name: "吞星利维坦", sprite: 0, sheet: "v2", color: "#4d98ff", hp: 1.38, speed: .88, hit: 1.08, range: 270 },
  mirror: { name: "镜界仲裁者", sprite: 1, sheet: "v2", color: "#ff68d7", hp: 1.08, speed: 1.08, hit: .92, range: 350 },
  warden: { name: "时蚀守望者", sprite: 2, sheet: "v2", color: "#66eadf", hp: 1.24, speed: .72, hit: 1.02, range: 315 },
};

const ENEMY_DATA: Record<EnemyKind, { hp: number; speed: number; hit: number; radius: number; color: string; cooldown: number }> = {
  runner: { hp: 24, speed: 105, hit: 6, radius: 13, color: "#e65d43", cooldown: 0 },
  crawler: { hp: 48, speed: 56, hit: 8, radius: 17, color: "#75a94c", cooldown: 0 },
  artillery: { hp: 58, speed: 40, hit: 7, radius: 18, color: "#de8b34", cooldown: 2.55 },
  assassin: { hp: 68, speed: 78, hit: 8, radius: 18, color: "#865bc7", cooldown: 1.9 },
  brute: { hp: 185, speed: 34, hit: 16, radius: 27, color: "#a7542a", cooldown: 0 },
  commander: { hp: 320, speed: 46, hit: 12, radius: 30, color: "#d9b24b", cooldown: 1.75 },
  shieldmite: { hp: 96, speed: 54, hit: 8, radius: 21, color: "#53d6ce", cooldown: 2.2 },
  sniper: { hp: 72, speed: 35, hit: 14, radius: 18, color: "#f0efed", cooldown: 3.35 },
  splitter: { hp: 105, speed: 72, hit: 9, radius: 22, color: "#9fce39", cooldown: 2.8 },
  mortarwasp: { hp: 84, speed: 63, hit: 11, radius: 19, color: "#efa330", cooldown: 2.7 },
  leech: { hp: 118, speed: 52, hit: 10, radius: 21, color: "#a56cff", cooldown: 2.25 },
  rammer: { hp: 230, speed: 48, hit: 20, radius: 29, color: "#568dc9", cooldown: 3.8 },
  boss: { hp: 3400, speed: 42, hit: 15, radius: 48, color: "#f06b66", cooldown: 2.2 },
};
const ENEMY_XP: Record<EnemyKind, number> = {
  runner: 1,
  crawler: 2,
  artillery: 3,
  assassin: 4,
  brute: 7,
  commander: 12,
  shieldmite: 5,
  sniper: 6,
  splitter: 6,
  mortarwasp: 7,
  leech: 8,
  rammer: 11,
  boss: 55,
};
const HEALTH_PACK_ENEMY_KINDS: EnemyKind[] = ["brute", "commander", "leech", "rammer", "boss"];
const ENEMY_ATTACK_MODE: Record<EnemyKind, "melee" | "ranged"> = {
  runner: "melee",
  crawler: "melee",
  artillery: "ranged",
  assassin: "ranged",
  brute: "melee",
  commander: "ranged",
  shieldmite: "melee",
  sniper: "ranged",
  splitter: "melee",
  mortarwasp: "ranged",
  leech: "ranged",
  rammer: "melee",
  boss: "ranged",
};

const makeBuild = (classId: ClassId): BuildFrame => {
  const base: BuildFrame = {
    classId,
    maxHp: 108,
    speed: 250,
    damage: 31,
    interval: .43,
    multi: 1,
    magnet: 84,
    projectileSpeed: 560,
    projectileSize: 5,
    bonusPierce: 0,
    damageReduction: 0,
    critChance: .05,
    skillHaste: 1,
    drones: 0,
    missileWaves: 1,
    missileCount: 12,
    shieldDuration: 3,
    repairPower: 1,
    dashDistance: 190,
    laserPower: 1,
    frostPower: 1,
    dronePower: 1,
    secondaryPower: 1,
    secondaryArea: 1,
    secondaryProjectiles: 0,
    secondaryControl: 1,
    ultimatePower: .9,
    ultimateTargets: 6,
    ultimateLanes: 1,
    ultimateDuration: 3.4,
    ultimateRange: 430,
    ultimateEchoes: 1,
    meleeRange: 122,
    meleePower: 1,
    gravityPower: 1,
    lightningPower: 1,
    sniperPower: 1,
    burnPower: 1,
  };
  if (classId === "assault") return { ...base, maxHp: 116, damage: 46, interval: .6, projectileSpeed: 535, projectileSize: 7.5 };
  if (classId === "guardian") return { ...base, maxHp: 155, speed: 224, damage: 78, interval: 1.05, projectileSpeed: 455, projectileSize: 10, damageReduction: .25 };
  if (classId === "engineer") return { ...base, maxHp: 116, damage: 29, interval: .5, magnet: 118, projectileSpeed: 545, projectileSize: 6, drones: 1, repairPower: 1.15, dronePower: 1.12, ultimateTargets: 8 };
  if (classId === "phantom") return { ...base, maxHp: 100, speed: 302, damage: 19, interval: .24, projectileSpeed: 850, projectileSize: 4.5, critChance: .28, dashDistance: 215, ultimateTargets: 5 };
  if (classId === "laser") return { ...base, maxHp: 106, speed: 280, damage: 22, interval: .26, projectileSpeed: 930, projectileSize: 5, critChance: .15, laserPower: 1.12, ultimateLanes: 8 };
  if (classId === "frost") return { ...base, maxHp: 138, speed: 218, damage: 47, interval: .72, projectileSpeed: 500, projectileSize: 8.5, damageReduction: .12, frostPower: 1.12 };
  if (classId === "blade") return { ...base, maxHp: 132, speed: 292, damage: 66, interval: .56, projectileSpeed: 620, projectileSize: 6, damageReduction: .08, meleeRange: 132, meleePower: 1.08, repairPower: 1.05 };
  if (classId === "gravity") return { ...base, maxHp: 146, speed: 226, damage: 44, interval: .66, magnet: 110, projectileSpeed: 510, projectileSize: 9, damageReduction: .14, gravityPower: 1.12 };
  if (classId === "thunder") return { ...base, maxHp: 112, speed: 274, damage: 27, interval: .36, projectileSpeed: 690, projectileSize: 5.5, critChance: .1, lightningPower: 1.12, ultimateTargets: 8 };
  if (classId === "sky") return { ...base, maxHp: 96, speed: 312, damage: 72, interval: .94, projectileSpeed: 980, projectileSize: 6, critChance: .2, sniperPower: 1.14, ultimateTargets: 4 };
  return { ...base, maxHp: 162, speed: 204, damage: 54, interval: .76, projectileSpeed: 490, projectileSize: 10, damageReduction: .18, burnPower: 1.15, ultimateLanes: 3 };
};

const projectileTraits = (classId: ClassId, combatStats?: Pick<CombatStats, "bonusPierce" | "projectileSize">): Partial<Shot> => {
  if (classId === "assault") return { splash: 54 };
  if (classId === "guardian") return { pierce: 2 };
  if (classId === "engineer") return { chain: true };
  if (classId === "phantom") return { pierce: 1 };
  if (classId === "laser") return { pierce: 4 };
  if (classId === "frost") return { slow: 2.8 };
  if (classId === "blade") return { pierce: 1 };
  if (classId === "gravity") return { slow: 1.4, splash: 48, pierce: 1 };
  if (classId === "thunder") return { chain: true, pierce: 1 };
  if (classId === "sky") return { pierce: 4 + Math.round(combatStats?.bonusPierce || 0) };
  return { splash: 72 + Math.max(0, (combatStats?.projectileSize || 10) - 10) * 4, burn: 4.2, burnDamage: 8 };
};

const mechPreviewClass = (classInfo: ClassSpec) => {
  if (classInfo.id === "laser") return "mechPreview laserPreview";
  if (classInfo.id === "frost") return "mechPreview frostPreview";
  if (classInfo.id === "blade") return "mechPreview bladePreview";
  if (classInfo.id === "gravity") return "mechPreview gravityPreview";
  if (classInfo.id === "thunder") return "mechPreview thunderPreview";
  if (classInfo.id === "sky") return "mechPreview skyPreview";
  if (classInfo.id === "cinder") return "mechPreview cinderPreview";
  return `mechPreview mech-${classInfo.sprite}`;
};
const mechPreviewStyle = (classInfo: ClassSpec): CSSProperties => ({
  backgroundImage: `url("${classInfo.id === "laser"
    ? GAME_ASSETS.laserMech
    : classInfo.id === "frost"
      ? GAME_ASSETS.frostMech
      : classInfo.id === "blade"
        ? GAME_ASSETS.bladeMech
        : classInfo.id === "gravity"
          ? GAME_ASSETS.gravityMech
          : classInfo.id === "thunder"
            ? GAME_ASSETS.thunderMech
            : classInfo.id === "sky"
              ? GAME_ASSETS.skyTalonMech
              : classInfo.id === "cinder"
                ? GAME_ASSETS.cinderForgeMech
                : GAME_ASSETS.playerMechs}")`,
});
const applyBossRelicToBuild = (source: BuildFrame, relic: BossRelicId): BuildFrame => {
  if (relic === "titan-core") {
    return {
      ...source,
      maxHp: source.maxHp + 18,
      damageReduction: Math.min(.62, source.damageReduction + .04),
    };
  }
  if (relic === "overdrive-core") {
    return { ...source, damage: source.damage * 1.14, interval: Math.max(.12, source.interval * .94) };
  }
  return {
    ...source,
    skillHaste: Math.max(.5, source.skillHaste * .9),
    speed: source.speed * 1.06,
  };
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
  const [teammateHp, setTeammateHp] = useState<number | null>(null);
  const [teammateMaxHp, setTeammateMaxHp] = useState(100);
  const [rescueProgress, setRescueProgress] = useState(0);
  const [kills, setKills] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [wave, setWave] = useState(1);
  const [coins, setCoins] = useState(0);
  const [ultimateEnergy, setUltimateEnergy] = useState(0);
  const [choices, setChoices] = useState<Upgrade[] | null>(null);
  const [shopItems, setShopItems] = useState<ShopItem[] | null>(null);
  const [supplyReward, setSupplyReward] = useState(0);
  const [waitingSupply, setWaitingSupply] = useState(false);
  const [upgradeRerolls, setUpgradeRerolls] = useState(0);
  const [shopRerolls, setShopRerolls] = useState(0);
  const [bossLootNotice, setBossLootNotice] = useState("");
  const [selectedClass, setSelectedClass] = useState<ClassId>("assault");
  const [skillCooldown, setSkillCooldown] = useState(0);
  const [secondarySkillCooldown, setSecondarySkillCooldown] = useState(0);
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
  const secondarySkillRef = useRef<() => void>(() => {});
  const activeUltimateRef = useRef<() => void>(() => {});
  const buyShopItemRef = useRef<(id: string) => void>(() => {});
  const finishShopRef = useRef<() => void>(() => {});
  const rerollShopRef = useRef<() => void>(() => {});
  const rerollUpgradeRef = useRef<() => void>(() => {});
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
    pausedRef.current = false;
    setLevel(1); setXp(0); setHp(ownBuildRef.current.maxHp); setMaxHp(ownBuildRef.current.maxHp); setTeammateHp(null); setRescueProgress(0); setKills(0); setSeconds(0); setSkillCooldown(0); setSecondarySkillCooldown(0);
    setWave(1); setCoins(0); setUltimateEnergy(0); setShopItems(null); setSupplyReward(0); setWaitingSupply(false);
    setUpgradeRerolls(0); setShopRerolls(0); setBossLootNotice("");
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
    audioRef.current?.setScene(view === "game" ? (paused || choices || shopItems || waitingSupply ? "pause" : "game") : "menu");
  }, [choices, paused, shopItems, view, waitingSupply]);

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
    setTeammateHp(null);
    setRescueProgress(0);
    setShopItems(null);
    setWaitingSupply(false);
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
          appId: "ember-protocol-v9",
          password: `ember-sync-v9-${code}`,
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
      const gameplay = room.makeAction<NetPayload>("ember-game-v9");
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

    const W = 1600, H = 900;
    canvas.width = W; canvas.height = H;
    const network = netRef.current;
    const isAuthority = network?.role !== "join";
    let raf = 0, last = performance.now(), elapsed = 0, spawnClock = 0, fireClock = 0;
    let nextSurgeAt = 22, surgeRemaining = 0, surgeSpawnClock = 0;
    let active = true, localPaused = false, currentXp = 0, currentLevel = 1, currentKills = 0;
    let netClock = 0, worldClock = 0, remoteFireClock = 0, gameOverSent = false, nextEnemyId = 1;
    let selfShieldUntil = 0, remoteShieldUntil = 0, skillReadyAt = 0, secondarySkillReadyAt = 0, shownCooldown = -1, shownSecondaryCooldown = -1;
    let hostReviveProgress = 0, guestReviveProgress = 0;
    let localUpgradeDone = false, waitingForRemoteUpgrade = false;
    let localUpgradeStartedAlive = false, localUpgradeStartHp = 0;
    let localShopStartedAlive = false, localShopStartHp = 0;
    let coOpRunEstablished = Boolean(network?.role === "host" && network.connected());
    let hostCoins = 0, guestCoins = 0, hostUltimate = 0, guestUltimate = 0;
    let currentWave = 1, waveKills = 0, nextWaveAt = WAVE_INTERVAL_SECONDS, lastBossWave = 0;
    let bossBag: BossVariant[] = [];
    let previousBossVariant: BossVariant | null = null;
    let localUpgradeRerolls = 0, localShopRerolls = 0;
    let shopStock: ShopItem[] = [];
    let recentShopIds: string[] = [];
    let localShopDone = false, remoteShopDone = false;
    let pendingMissileWaves: { actor: Actor; combatStats: BuildFrame | CombatStats; owner: PlayerSide; delay: number }[] = [];
    const REVIVE_SECONDS = 2;
    const REVIVE_RANGE = 88;
    const ULTIMATE_MAX = 100;
    let build = { ...ownBuildRef.current };
    let stats: CombatStats = { ...build };
    const classSpec = () => CLASSES.find((item) => item.id === build.classId) || CLASSES[0];
    let player: Actor = {
      x: network?.role === "join" ? W / 2 + 52 : W / 2 - 52,
      y: H / 2,
      r: classSpec().radius,
      hp: build.maxHp,
      maxHp: build.maxHp,
      color: classSpec().color,
      classId: build.classId,
    };
    let remote: Actor | null = null;
    let enemies: Enemy[] = [], shots: Shot[] = [], gems: Gem[] = [], beams: Beam[] = [], effects: CombatEffect[] = [], particles: {x:number;y:number;vx:number;vy:number;life:number;color:string}[] = [];
    const keys = new Set<string>();
    const pointer = { x: W / 2, y: H / 2, down: false };
    const audio = audioRef.current;
    const playerSprites = new Image();
    const laserSprite = new Image();
    const frostSprite = new Image();
    const bladeSprite = new Image();
    const gravitySprite = new Image();
    const thunderSprite = new Image();
    const skySprite = new Image();
    const cinderSprite = new Image();
    const enemySprites = new Image();
    const bossVariantSprites = new Image();
    const bossVariantSpritesV2 = new Image();
    const enemyReinforcementSprites = new Image();
    const bossProjectileSprites = new Image();
    const bossProjectileSpritesV2 = new Image();
    const enemyReinforcementProjectiles = new Image();
    const projectileSprites = new Image();
    const specialistProjectiles = new Image();
    const droneSprites = new Image();
    const specialistDrones = new Image();
    const vanguardDrones = new Image();
    const vanguardProjectiles = new Image();
    const enemyProjectiles = new Image();
    const assassinProjectile = new Image();
    const v2SupportAssets = new Image();
    playerSprites.src = GAME_ASSETS.playerMechs;
    laserSprite.src = GAME_ASSETS.laserMech;
    frostSprite.src = GAME_ASSETS.frostMech;
    bladeSprite.src = GAME_ASSETS.bladeMech;
    gravitySprite.src = GAME_ASSETS.gravityMech;
    thunderSprite.src = GAME_ASSETS.thunderMech;
    skySprite.src = GAME_ASSETS.skyTalonMech;
    cinderSprite.src = GAME_ASSETS.cinderForgeMech;
    enemySprites.src = GAME_ASSETS.enemyMechs;
    bossVariantSprites.src = GAME_ASSETS.bossVariants;
    bossVariantSpritesV2.src = GAME_ASSETS.bossVariantsV2;
    enemyReinforcementSprites.src = GAME_ASSETS.enemyReinforcements;
    bossProjectileSprites.src = GAME_ASSETS.bossProjectiles;
    bossProjectileSpritesV2.src = GAME_ASSETS.bossProjectilesV2;
    enemyReinforcementProjectiles.src = GAME_ASSETS.enemyReinforcementProjectiles;
    projectileSprites.src = GAME_ASSETS.projectileMechs;
    specialistProjectiles.src = GAME_ASSETS.specialistProjectiles;
    droneSprites.src = GAME_ASSETS.supportDrones;
    specialistDrones.src = GAME_ASSETS.specialistDrones;
    vanguardDrones.src = GAME_ASSETS.vanguardDrones;
    vanguardProjectiles.src = GAME_ASSETS.vanguardProjectiles;
    enemyProjectiles.src = GAME_ASSETS.enemyProjectiles;
    assassinProjectile.src = GAME_ASSETS.assassinProjectile;
    v2SupportAssets.src = GAME_ASSETS.v2SupportAssets;
    const unsubscribeNetwork = network?.subscribe((data) => {
      if (data.t === "player" && isAuthority) {
        coOpRunEstablished = true;
        const remoteBuild = remoteBuildRef.current || makeBuild("assault");
        const remoteSpec = CLASSES.find((item) => item.id === remoteBuild.classId) || CLASSES[0];
        remote = {
          x: data.x,
          y: data.y,
          r: remoteSpec.radius,
          hp: remote?.hp ?? remoteBuild.maxHp,
          maxHp: remote?.maxHp ?? remoteBuild.maxHp,
          color: CLASSES.find((item) => item.id === remoteBuild.classId)?.color || "#78a99d",
          name: "伙伴",
          classId: remoteBuild.classId,
        };
      }
      if (data.t === "build" && isAuthority) {
        remoteBuildRef.current = data.build;
        if (remote) {
          const remoteSpec = CLASSES.find((item) => item.id === data.build.classId) || CLASSES[0];
          remote.classId = data.build.classId;
          remote.color = remoteSpec.color;
          remote.r = remoteSpec.radius;
          remote.maxHp = Math.max(remote.maxHp, data.build.maxHp);
        }
      }
      if (data.t === "upgrade-done" && isAuthority) {
        remoteBuildRef.current = data.build;
        waitingForRemoteUpgrade = false;
        setWaitingPeerUpgrade(false);
        if (remote) {
          const remoteWasAlive = remote.hp > 0;
          remote.maxHp = data.build.maxHp;
          remote.hp = reconcilePausedPeerHp(remoteWasAlive, data.hp, data.build.maxHp);
        }
        if (localUpgradeDone) {
          localPaused = false;
          void network?.send({ t: "upgrade-resume" });
        }
      }
      if (data.t === "skill" && isAuthority && remote) {
        const remoteBuild = remoteBuildRef.current || makeBuild(data.classId);
        const skillStart = { x: remote.x, y: remote.y };
        if (data.classId === "assault") queueMissileStorm(remote, remoteBuild, "guest");
        if (data.classId === "guardian") remoteShieldUntil = performance.now() + Math.min(GUARDIAN_SHIELD_MAX, remoteBuild.shieldDuration) * 1000;
        if (data.classId === "engineer") {
          const repair = 34 * remoteBuild.repairPower;
          if (player.hp > 0) player.hp = Math.min(player.maxHp, player.hp + repair);
          if (remote.hp > 0) remote.hp = Math.min(remote.maxHp, remote.hp + repair);
          setHp(Math.ceil(player.hp));
        }
        if (data.classId === "phantom") {
          remote.x = clamp(data.x, 30, W - 30);
          remote.y = clamp(data.y, 30, H - 30);
          remoteShieldUntil = performance.now() + 1200;
        }
        if (data.classId === "laser") fireLaser(remote, remoteBuild, "guest");
        if (data.classId === "frost") freezeArea(remote, remoteBuild, "guest");
        if (data.classId === "blade") bladeRush(remote, remoteBuild, "guest", data.x, data.y);
        if (data.classId === "gravity") gravityWell(remote, remoteBuild, "guest");
        if (data.classId === "thunder") thunderChain(remote, remoteBuild, "guest");
        if (data.classId === "sky") railSnipe(remote, remoteBuild, "guest");
        if (data.classId === "cinder") incinerateCone(remote, remoteBuild, "guest");
        triggerSkillEffect(remote, data.classId, skillStart);
        audio?.play("skill");
      }
      if (data.t === "skill2" && isAuthority && remote) {
        const remoteBuild = remoteBuildRef.current || makeBuild(data.classId);
        executeSecondarySkill(remote, remoteBuild, data.classId, "guest");
        audio?.play("skill");
      }
      if (data.t === "ultimate" && isAuthority && remote) {
        const remoteStats = remoteBuildRef.current || makeBuild(data.classId);
        guestUltimate = 0;
        executeUltimate(remote, remoteStats, data.classId, "guest");
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
        beams = frame.beams;
        effects = frame.effects;
        hostReviveProgress = frame.revive.host;
        guestReviveProgress = frame.revive.guest;
        hostCoins = frame.wallet.host;
        guestCoins = frame.wallet.guest;
        hostUltimate = frame.ultimate.host;
        guestUltimate = frame.ultimate.guest;
        currentWave = frame.wave;
        remote = {
          ...frame.host,
          r: (CLASSES.find((item) => item.id === frame.host.classId) || CLASSES[0]).radius,
          color: CLASSES.find((item) => item.id === frame.host.classId)?.color || "#78a99d",
          name: "队长",
        };
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
        setTeammateHp(Math.max(0, Math.ceil(frame.host.hp)));
        setTeammateMaxHp(frame.host.maxHp);
        setRescueProgress(clamp(frame.revive.guest / REVIVE_SECONDS, 0, 1));
        setCoins(frame.wallet.guest);
        setUltimateEnergy(frame.ultimate.guest);
        setWave(frame.wave);
      }
      if (data.t === "levelup" && !isAuthority) {
        currentLevel = data.level;
        localUpgradeDone = false;
        localUpgradeStartedAlive = player.hp > 0;
        localUpgradeStartHp = player.hp;
        localPaused = true;
        localUpgradeRerolls = 0;
        setUpgradeRerolls(0);
        setLevel(data.level);
        setChoices(rollUpgradeChoices(build.classId, build, currentWave));
      }
      if (data.t === "upgrade-resume" && !isAuthority) {
        localPaused = false;
        setWaitingPeerUpgrade(false);
      }
      if (data.t === "shop-open" && !isAuthority) {
        guestCoins = data.coins;
        currentWave = data.wave;
        localShopDone = false;
        localShopStartedAlive = player.hp > 0;
        localShopStartHp = player.hp;
        localPaused = true;
        localShopRerolls = 0;
        setShopRerolls(0);
        setCoins(guestCoins);
        setWave(currentWave);
        setSupplyReward(data.reward);
        setWaitingSupply(false);
        shopStock = rollShopItems(currentWave, guestCoins, recentShopIds);
        recentShopIds = shopStock.map((item) => item.id);
        setShopItems(shopStock);
      }
      if (data.t === "shop-done" && isAuthority) {
        guestCoins = data.coins;
        guestUltimate = data.ultimate;
        remoteBuildRef.current = data.build;
        remoteShopDone = true;
        if (remote) {
          const remoteWasAlive = remote.hp > 0;
          remote.maxHp = data.build.maxHp;
          remote.hp = reconcilePausedPeerHp(remoteWasAlive, data.hp, data.build.maxHp);
        }
        if (localShopDone) {
          localPaused = false;
          setWaitingSupply(false);
          void network?.send({ t: "shop-resume" });
        }
      }
      if (data.t === "shop-resume" && !isAuthority) {
        localPaused = false;
        setWaitingSupply(false);
      }
      if (data.t === "boss-loot" && !isAuthority) {
        const relic = BOSS_RELICS.find((entry) => entry.id === data.relic);
        const previousMaxHp = build.maxHp;
        build = applyBossRelicToBuild(build, data.relic);
        stats = { ...build };
        ownBuildRef.current = { ...build };
        player.maxHp = build.maxHp;
        if (build.maxHp > previousMaxHp && player.hp > 0) player.hp += build.maxHp - previousMaxHp;
        setMaxHp(player.maxHp);
        setHp(Math.ceil(player.hp));
        setBossLootNotice(relic ? `${relic.icon} ${relic.title} · ${relic.desc}` : "获得 Boss 核心");
      }
      if (data.t === "pause" && !isAuthority) {
        setPaused(data.paused);
      }
      if (
        data.t === "gameover" &&
        !isAuthority &&
        teamRunDefeated(data.hostHp, data.guestHp, true)
      ) {
        audio?.play("game-over");
        player.hp = 0;
        setHp(0);
        localPaused = true;
        setPaused(true);
      }
    });

    const reset = () => {
      localPaused = false;
      elapsed = 0; spawnClock = 0; fireClock = 0; nextSurgeAt = 22; surgeRemaining = 0; surgeSpawnClock = 0; currentXp = 0; currentLevel = 1; currentKills = 0;
      netClock = 0; worldClock = 0; remoteFireClock = 0; gameOverSent = false;
      nextEnemyId = 1;
      selfShieldUntil = 0; remoteShieldUntil = 0; skillReadyAt = 0; secondarySkillReadyAt = 0; shownCooldown = -1; shownSecondaryCooldown = -1;
      hostReviveProgress = 0; guestReviveProgress = 0;
      hostCoins = 0; guestCoins = 0; hostUltimate = 0; guestUltimate = 0;
      currentWave = 1; waveKills = 0; nextWaveAt = WAVE_INTERVAL_SECONDS; lastBossWave = 0;
      bossBag = [];
      previousBossVariant = null;
      localUpgradeRerolls = 0; localShopRerolls = 0; shopStock = []; recentShopIds = [];
      localShopDone = false; remoteShopDone = false; pendingMissileWaves = [];
      localUpgradeDone = false; waitingForRemoteUpgrade = false;
      localUpgradeStartedAlive = false; localUpgradeStartHp = 0;
      localShopStartedAlive = false; localShopStartHp = 0;
      coOpRunEstablished = Boolean(network?.role === "host" && network.connected());
      keys.clear();
      setWaitingPeerUpgrade(false);
      build = { ...ownBuildRef.current };
      stats = { ...build };
      player = {
        x: network?.role === "join" ? W / 2 + 52 : W / 2 - 52,
        y: H / 2,
        r: classSpec().radius,
        hp: build.maxHp,
        maxHp: build.maxHp,
        color: CLASSES.find((item) => item.id === build.classId)?.color || "#f4c95d",
        classId: build.classId,
      };
      remote = null;
      enemies = []; shots = []; gems = []; beams = []; effects = []; particles = [];
      setHp(build.maxHp);
      setMaxHp(build.maxHp);
      setTeammateHp(null);
      setRescueProgress(0);
      setSkillCooldown(0);
      setSecondarySkillCooldown(0);
      setWave(1);
      setCoins(0);
      setUltimateEnergy(0);
      setShopItems(null);
      setSupplyReward(0);
      setWaitingSupply(false);
      setUpgradeRerolls(0);
      setShopRerolls(0);
      setBossLootNotice("");
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
      if (id === "reactor") stats.skillHaste = Math.max(.5, stats.skillHaste * .85);
      if (id === "drone") stats.drones += 1;
      if (id === "repair" && player.hp > 0) player.hp = Math.min(player.maxHp, player.hp + 35);
      if (id === "vitality") {
        player.maxHp += 20;
        if (player.hp > 0) player.hp = Math.min(player.maxHp, player.hp + 30);
      }
      if (id === "assault-double-storm") stats.missileWaves += 1;
      if (id === "assault-saturation") stats.missileCount += 4;
      if (id === "assault-warhead") { stats.damage *= 1.18; stats.projectileSize += 1.1; }
      if (id === "guardian-fortress") stats.shieldDuration = Math.min(GUARDIAN_SHIELD_MAX, stats.shieldDuration + .75);
      if (id === "guardian-rail") { stats.damage *= 1.24; stats.projectileSize += 1.4; }
      if (id === "guardian-plating") {
        player.maxHp += 28;
        if (player.hp > 0) player.hp = Math.min(player.maxHp, player.hp + 28);
        stats.damageReduction = Math.min(.6, stats.damageReduction + .05);
      }
      if (id === "engineer-swarm") stats.drones += 1;
      if (id === "engineer-link") stats.dronePower *= 1.35;
      if (id === "engineer-repair") stats.repairPower *= 1.4;
      if (id === "phantom-fold") stats.dashDistance += 70;
      if (id === "phantom-needle") { stats.critChance = Math.min(.72, stats.critChance + .12); stats.damage *= 1.12; }
      if (id === "phantom-cycle") stats.skillHaste = Math.max(.45, stats.skillHaste * .78);
      if (id === "laser-overfocus") stats.laserPower *= 1.3;
      if (id === "laser-prism") { stats.damage *= 1.16; stats.multi += 1; }
      if (id === "laser-capacitor") stats.skillHaste = Math.max(.5, stats.skillHaste * .8);
      if (id === "frost-zero") stats.frostPower *= 1.28;
      if (id === "frost-shatter") { stats.damage *= 1.2; stats.projectileSize += 1.3; }
      if (id === "frost-armor") {
        player.maxHp += 24;
        if (player.hp > 0) player.hp = Math.min(player.maxHp, player.hp + 24);
        stats.damageReduction = Math.min(.6, stats.damageReduction + .05);
      }
      if (id === "blade-edge") { stats.meleeRange *= 1.18; stats.meleePower *= 1.16; }
      if (id === "blade-vamp") {
        stats.repairPower *= 1.45;
        player.maxHp += 16;
        if (player.hp > 0) player.hp = Math.min(player.maxHp, player.hp + 16);
      }
      if (id === "blade-tempo") { stats.interval = Math.max(.24, stats.interval * .85); stats.speed *= 1.08; }
      if (id === "gravity-collapse") stats.gravityPower *= 1.28;
      if (id === "gravity-lens") { stats.damage *= 1.18; stats.multi += 1; }
      if (id === "gravity-anchor") {
        player.maxHp += 22;
        if (player.hp > 0) player.hp = Math.min(player.maxHp, player.hp + 22);
        stats.skillHaste = Math.max(.5, stats.skillHaste * .85);
      }
      if (id === "thunder-capacitor") stats.lightningPower *= 1.25;
      if (id === "thunder-network") stats.ultimateTargets = Math.min(16, stats.ultimateTargets + 2);
      if (id === "thunder-cycle") { stats.interval = Math.max(.18, stats.interval * .9); stats.skillHaste = Math.max(.5, stats.skillHaste * .88); }
      if (id === "sky-focus") { stats.sniperPower *= 1.24; stats.critChance = Math.min(.72, stats.critChance + .04); }
      if (id === "sky-penetrator") { stats.projectileSpeed *= 1.12; stats.bonusPierce += 2; }
      if (id === "sky-thruster") { stats.speed *= 1.1; stats.interval = Math.max(.3, stats.interval * .92); }
      if (id === "cinder-furnace") stats.burnPower *= 1.28;
      if (id === "cinder-nozzle") { stats.projectileSize *= 1.22; stats.damage *= 1.08; }
      if (id === "cinder-plating") {
        player.maxHp += 26;
        if (player.hp > 0) player.hp = Math.min(player.maxHp, player.hp + 26);
        stats.damageReduction = Math.min(.62, stats.damageReduction + .04);
      }
      if (id.endsWith("-secondary-power")) stats.secondaryPower *= 1.22;
      if (id === "assault-secondary-salvo") stats.secondaryProjectiles = Math.min(2, stats.secondaryProjectiles + 1);
      if (id === "guardian-secondary-radius") stats.secondaryArea = Math.min(1.53, stats.secondaryArea * 1.15);
      if (id === "engineer-secondary-swarm") stats.secondaryProjectiles = Math.min(6, stats.secondaryProjectiles + 2);
      if (id === "phantom-secondary-blades") stats.secondaryProjectiles = Math.min(2, stats.secondaryProjectiles + 1);
      if (id === "laser-secondary-facets") stats.secondaryProjectiles = Math.min(2, stats.secondaryProjectiles + 1);
      if (id === "frost-secondary-control") {
        stats.secondaryControl = Math.min(1.65, stats.secondaryControl * 1.18);
        stats.secondaryArea = Math.min(1.65, stats.secondaryArea * 1.18);
      }
      if (id === "blade-secondary-radius") stats.secondaryArea = Math.min(1.53, stats.secondaryArea * 1.15);
      if (id === "gravity-secondary-radius") stats.secondaryArea = Math.min(1.53, stats.secondaryArea * 1.15);
      if (id === "thunder-secondary-nodes") stats.secondaryProjectiles = Math.min(6, stats.secondaryProjectiles + 2);
      if (id === "sky-secondary-locks") stats.secondaryProjectiles = Math.min(3, stats.secondaryProjectiles + 1);
      if (id === "cinder-secondary-scorch") {
        stats.secondaryControl = Math.min(1.65, stats.secondaryControl * 1.18);
        stats.secondaryArea = Math.min(1.65, stats.secondaryArea * 1.18);
      }
      if (id.endsWith("-ultimate-power")) stats.ultimatePower *= 1.2;
      if (id === "assault-ultimate-locks") stats.ultimateTargets = Math.min(14, stats.ultimateTargets + 2);
      if (id === "guardian-ultimate-duration") stats.ultimateDuration = Math.min(5.4, stats.ultimateDuration + .5);
      if (id === "engineer-ultimate-locks") stats.ultimateTargets = Math.min(20, stats.ultimateTargets + 3);
      if (id === "phantom-ultimate-locks") stats.ultimateTargets = Math.min(13, stats.ultimateTargets + 2);
      if (id === "laser-ultimate-lanes") stats.ultimateLanes = Math.min(16, stats.ultimateLanes + 2);
      if (id === "frost-ultimate-lanes") stats.ultimateLanes = Math.min(4, stats.ultimateLanes + 1);
      if (id === "blade-ultimate-echoes") stats.ultimateEchoes = Math.min(4, stats.ultimateEchoes + 1);
      if (id === "gravity-ultimate-range") stats.ultimateRange = Math.min(670, stats.ultimateRange + 80);
      if (id === "thunder-ultimate-locks") stats.ultimateTargets = Math.min(16, stats.ultimateTargets + 2);
      if (id === "sky-ultimate-locks") stats.ultimateTargets = Math.min(9, stats.ultimateTargets + 1);
      if (id === "cinder-ultimate-lanes") stats.ultimateLanes = Math.min(5, stats.ultimateLanes + 1);
      if (localUpgradeStartedAlive) {
        player.hp = Math.min(
          player.maxHp,
          Math.max(1, player.hp, localUpgradeStartHp) + player.maxHp * .18,
        );
      } else {
        player.hp = 0;
      }
      build = { ...build, ...stats, maxHp: player.maxHp };
      ownBuildRef.current = { ...build };
      setHp(Math.ceil(player.hp));
      setMaxHp(player.maxHp);
      audio?.play("upgrade");
      localUpgradeDone = true;
      const connectedGuest = network?.role === "join" && network.connected();
      if (connectedGuest) {
        void network.send({ t: "upgrade-done", build: ownBuildRef.current, hp: player.hp });
      }
      if (network?.role === "host" && network.connected()) {
        void network.send({ t: "build", build: ownBuildRef.current });
      }
      setWaitingPeerUpgrade(Boolean(connectedGuest || (network?.role === "host" && waitingForRemoteUpgrade)));
      if (connectedGuest) return;
      if (!waitingForRemoteUpgrade) {
        localPaused = false;
        setWaitingPeerUpgrade(false);
        if (network?.role === "host" && network.connected()) {
          void network.send({ t: "upgrade-resume" });
        }
      }
    };

    const localWallet = () => network?.role === "join" ? guestCoins : hostCoins;
    const setLocalWallet = (value: number) => {
      if (network?.role === "join") guestCoins = value;
      else hostCoins = value;
      setCoins(value);
    };
    const localUltimate = () => network?.role === "join" ? guestUltimate : hostUltimate;
    const setLocalUltimate = (value: number) => {
      const next = clamp(value, 0, ULTIMATE_MAX);
      if (network?.role === "join") guestUltimate = next;
      else hostUltimate = next;
      setUltimateEnergy(next);
    };
    buyShopItemRef.current = (id) => {
      const item = shopStock.find((entry) => entry.id === id);
      if (!item || localWallet() < item.cost) return;
      setLocalWallet(localWallet() - item.cost);
      if (id === "medkit" && player.hp > 0) player.hp = Math.min(player.maxHp, player.hp + 36);
      if (id === "repair-gel") {
        player.maxHp += 4;
        if (player.hp > 0) player.hp = Math.min(player.maxHp, player.hp + 26);
      }
      if (id === "combat-cocktail") {
        if (player.hp > 0) player.hp = Math.min(player.maxHp, player.hp + 18);
        setLocalUltimate(localUltimate() + 12);
      }
      if (id === "full-service" && player.hp > 0) player.hp = Math.min(player.maxHp, player.hp + player.maxHp * .32);
      if (id === "overhaul") {
        player.maxHp += 12;
        player.hp = Math.min(player.maxHp, player.hp + 12);
      }
      if (id === "ammo") stats.damage *= 1.08;
      if (id === "coolant") stats.interval *= .94;
      if (id === "crit-optic") {
        stats.critChance = Math.min(.72, stats.critChance + .06);
        stats.projectileSpeed *= 1.08;
      }
      if (id === "projectile-core") {
        stats.damage *= 1.05;
        stats.projectileSpeed *= 1.14;
        stats.projectileSize += .8;
      }
      if (id === "multi-loader") {
        stats.multi += 1;
        stats.interval *= 1.07;
      }
      if (id === "collector") stats.magnet *= 1.14;
      if (id === "drone-kit") stats.drones += 1;
      if (id === "reactor-cell") stats.skillHaste = Math.max(.5, stats.skillHaste * .93);
      if (id === "servo") stats.speed *= 1.07;
      if (id === "armor-plate") stats.damageReduction = Math.min(.62, stats.damageReduction + .04);
      if (id === "adaptive-hull") {
        player.maxHp += 8;
        if (player.hp > 0) player.hp = Math.min(player.maxHp, player.hp + 24);
        stats.damageReduction = Math.min(.62, stats.damageReduction + .02);
      }
      if (id === "evasion-drive") {
        stats.speed *= 1.05;
        stats.damageReduction = Math.min(.62, stats.damageReduction + .02);
        stats.skillHaste = Math.max(.5, stats.skillHaste * .97);
      }
      if (id === "drone-overclock") stats.dronePower *= 1.2;
      if (id === "signature-module") {
        if (build.classId === "assault") { stats.missileCount += 2; stats.projectileSize += .35; }
        if (build.classId === "guardian") { stats.shieldDuration = Math.min(GUARDIAN_SHIELD_MAX, stats.shieldDuration + .35); stats.damageReduction = Math.min(.62, stats.damageReduction + .015); }
        if (build.classId === "engineer") { stats.dronePower *= 1.15; stats.repairPower *= 1.1; }
        if (build.classId === "phantom") { stats.dashDistance += 35; stats.critChance = Math.min(.72, stats.critChance + .03); }
        if (build.classId === "laser") stats.laserPower *= 1.15;
        if (build.classId === "frost") stats.frostPower *= 1.15;
        if (build.classId === "blade") { stats.meleePower *= 1.15; stats.meleeRange *= 1.06; }
        if (build.classId === "gravity") stats.gravityPower *= 1.15;
        if (build.classId === "thunder") stats.lightningPower *= 1.15;
        if (build.classId === "sky") stats.sniperPower *= 1.15;
        if (build.classId === "cinder") stats.burnPower *= 1.15;
      }
      if (id === "ultimate-amplifier") stats.ultimatePower *= 1.12;
      if (id === "ult-battery") setLocalUltimate(localUltimate() + 22);
      build = { ...build, ...stats, maxHp: player.maxHp };
      ownBuildRef.current = { ...build };
      setHp(Math.ceil(player.hp));
      setMaxHp(player.maxHp);
      shopStock = shopStock.filter((entry) => entry.id !== id);
      setShopItems(shopStock);
      audio?.play("upgrade");
    };
    rerollShopRef.current = () => {
      const cost = shopRerollPrice(currentWave, localShopRerolls, localWallet());
      if (localShopRerolls >= MAX_SHOP_REROLLS || localWallet() < cost) return;
      setLocalWallet(localWallet() - cost);
      localShopRerolls += 1;
      setShopRerolls(localShopRerolls);
      shopStock = rollShopItems(currentWave, localWallet(), recentShopIds);
      recentShopIds = shopStock.map((item) => item.id);
      setShopItems(shopStock);
      audio?.play("ui");
    };
    rerollUpgradeRef.current = () => {
      const cost = upgradeRerollPrice(currentWave, localUpgradeRerolls);
      if (localUpgradeRerolls >= MAX_UPGRADE_REROLLS || localWallet() < cost) return;
      setLocalWallet(localWallet() - cost);
      localUpgradeRerolls += 1;
      setUpgradeRerolls(localUpgradeRerolls);
      setChoices(rollUpgradeChoices(build.classId, build, currentWave));
      audio?.play("ui");
    };
    finishShopRef.current = () => {
      localShopDone = true;
      shopStock = [];
      setShopItems(null);
      if (localShopStartedAlive) {
        player.hp = Math.min(player.maxHp, Math.max(1, player.hp, localShopStartHp));
      } else {
        player.hp = 0;
      }
      setHp(Math.ceil(player.hp));
      if (network?.role === "join") {
        setWaitingSupply(true);
        if (network.connected()) {
          void network.send({
            t: "shop-done",
            build: ownBuildRef.current,
            hp: player.hp,
            coins: guestCoins,
            ultimate: guestUltimate,
          });
        }
        return;
      }
      if (network?.connected()) void network.send({ t: "build", build: ownBuildRef.current });
      if (remote && network?.connected() && !remoteShopDone) {
        setWaitingSupply(true);
        return;
      }
      localPaused = false;
      setWaitingSupply(false);
      if (network?.connected()) void network.send({ t: "shop-resume" });
    };

    activeSkillRef.current = () => {
      const now = performance.now();
      if (player.hp <= 0 || now < skillReadyAt || localPaused || pausedRef.current) return;
      const spec = classSpec();
      const skillStart = { x: player.x, y: player.y };
      const minimumCooldown = spec.id === "guardian" ? MIN_GUARDIAN_COOLDOWN : 4;
      const cooldownSeconds = Math.max(minimumCooldown, spec.cooldown * stats.skillHaste);
      skillReadyAt = now + cooldownSeconds * 1000;
      setSkillCooldown(Math.ceil((skillReadyAt - now) / 1000));
      if (network?.role === "join") {
        if (build.classId === "guardian") selfShieldUntil = now + Math.min(GUARDIAN_SHIELD_MAX, stats.shieldDuration, cooldownSeconds - 2) * 1000;
        if (build.classId === "phantom") {
          const dashX = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0);
          let dashY = (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0);
          const dashLength = Math.hypot(dashX, dashY) || 1;
          if (!dashX && !dashY) dashY = -1;
          player.x = clamp(player.x + dashX / dashLength * stats.dashDistance, 30, W - 30);
          player.y = clamp(player.y + dashY / dashLength * stats.dashDistance, 30, H - 30);
          selfShieldUntil = now + 1200;
        }
        if (build.classId === "blade") bladeRush(player, stats, "guest");
        triggerSkillEffect(player, build.classId, skillStart);
        if (network.connected()) void network.send({ t: "skill", classId: build.classId, x: player.x, y: player.y });
        audio?.play("skill");
        return;
      }
      if (build.classId === "assault") queueMissileStorm(player, stats, "host");
      if (build.classId === "guardian") selfShieldUntil = now + Math.min(GUARDIAN_SHIELD_MAX, stats.shieldDuration, cooldownSeconds - 2) * 1000;
      if (build.classId === "engineer") {
        const repair = 34 * stats.repairPower;
        if (player.hp > 0) player.hp = Math.min(player.maxHp, player.hp + repair);
        if (remote && remote.hp > 0) remote.hp = Math.min(remote.maxHp, remote.hp + repair);
        setHp(Math.ceil(player.hp));
      }
      if (build.classId === "phantom") {
        const dashX = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0);
        let dashY = (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0);
        const dashLength = Math.hypot(dashX, dashY) || 1;
        if (!dashX && !dashY) dashY = -1;
        player.x = clamp(player.x + dashX / dashLength * stats.dashDistance, 30, W - 30);
        player.y = clamp(player.y + dashY / dashLength * stats.dashDistance, 30, H - 30);
        selfShieldUntil = now + 1200;
      }
      if (build.classId === "laser") fireLaser(player, stats, "host");
      if (build.classId === "frost") freezeArea(player, stats, "host");
      if (build.classId === "blade") bladeRush(player, stats, "host");
      if (build.classId === "gravity") gravityWell(player, stats, "host");
      if (build.classId === "thunder") thunderChain(player, stats, "host");
      if (build.classId === "sky") railSnipe(player, stats, "host");
      if (build.classId === "cinder") incinerateCone(player, stats, "host");
      triggerSkillEffect(player, build.classId, skillStart);
      audio?.play("skill");
    };

    secondarySkillRef.current = () => {
      const now = performance.now();
      if (player.hp <= 0 || now < secondarySkillReadyAt || localPaused || pausedRef.current) return;
      const spec = classSpec();
      const cooldownSeconds = Math.max(4, spec.secondaryCooldown * stats.skillHaste);
      secondarySkillReadyAt = now + cooldownSeconds * 1000;
      setSecondarySkillCooldown(Math.ceil((secondarySkillReadyAt - now) / 1000));
      if (network?.role === "join") {
        triggerSecondarySkillEffect(player, build.classId);
        if (network.connected()) void network.send({ t: "skill2", classId: build.classId, x: player.x, y: player.y });
        audio?.play("skill");
        return;
      }
      executeSecondarySkill(player, stats, build.classId, "host");
      audio?.play("skill");
    };

    const down = (e: KeyboardEvent) => {
      keys.add(e.key.toLowerCase());
      if (e.key.toLowerCase() === "q" || e.code === "Space") {
        e.preventDefault();
        activeSkillRef.current();
      }
      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        activeUltimateRef.current();
      }
      if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        secondarySkillRef.current();
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
      const candidates: Array<{ kind: EnemyKind; weight: number }> = [
        { kind: "runner", weight: Math.max(24, 48 - elapsed * .045) },
        { kind: "crawler", weight: Math.max(20, 38 - elapsed * .035) },
      ];
      const addEvolvedEnemy = (kind: EnemyKind, unlockAt: number, maxWeight: number, growthTime = 90) => {
        if (elapsed <= unlockAt) return;
        candidates.push({ kind, weight: maxWeight * clamp((elapsed - unlockAt) / growthTime, .08, 1) });
      };
      addEvolvedEnemy("artillery", 55, 13);
      addEvolvedEnemy("shieldmite", 70, 14);
      addEvolvedEnemy("assassin", 90, 11);
      addEvolvedEnemy("sniper", 110, 10);
      addEvolvedEnemy("brute", 130, 13);
      addEvolvedEnemy("splitter", 150, 12);
      addEvolvedEnemy("mortarwasp", 175, 10);
      addEvolvedEnemy("leech", 205, 9);
      addEvolvedEnemy("rammer", 240, 9);
      addEvolvedEnemy("commander", 285, 5, 130);
      const totalWeight = candidates.reduce((sum, entry) => sum + entry.weight, 0);
      let enemyRoll = Math.random() * totalWeight;
      let kind: EnemyKind = "runner";
      for (const candidate of candidates) {
        enemyRoll -= candidate.weight;
        if (enemyRoll <= 0) {
          kind = candidate.kind;
          break;
        }
      }
      const config = ENEMY_DATA[kind];
      const coOpScale = remote ? 1.2 : 1;
      const eliteChance = clamp((elapsed - 48) / 620, 0, .16);
      const elite = kind === "commander" || Math.random() < eliteChance;
      const lateScale = 1 + elapsed / 185 + Math.pow(elapsed / 540, 1.7);
      const maxHp = config.hp * lateScale * coOpScale * (elite ? 1.75 : 1);
      enemies.push({
        id: nextEnemyId++,
        x,
        y,
        r: config.radius * (elite ? 1.16 : 1),
        hp: maxHp,
        maxHp,
        speed: config.speed + Math.min(16, elapsed * .035),
        hit: config.hit * (elite ? 1.28 : 1),
        color: config.color,
        kind,
        elite,
        cooldown: config.cooldown ? Math.random() * config.cooldown : 0,
        slow: 0,
        barrier: kind === "shieldmite" ? maxHp * .7 : undefined,
      });
    };
    const spawnBoss = () => {
      const config = ENEMY_DATA.boss;
      if (!bossBag.length) {
        bossBag = shuffled<BossVariant>(["rift", "storm", "leviathan", "weaver", "mirror", "forge", "warden"]);
        const nextIndex = bossBag.length - 1;
        if (previousBossVariant && bossBag[nextIndex] === previousBossVariant && bossBag.length > 1) {
          [bossBag[0], bossBag[nextIndex]] = [bossBag[nextIndex], bossBag[0]];
        }
      }
      const bossVariant = bossBag.pop() || "rift";
      previousBossVariant = bossVariant;
      const variant = BOSS_VARIANTS[bossVariant];
      const coOpScale = remote ? 1.5 : 1;
      const lateBossWave = Math.max(0, currentWave - 3);
      const waveScale = 1 + lateBossWave * .38 + Math.pow(lateBossWave / 6, 1.45) * .5;
      const maxHp = config.hp * variant.hp * waveScale * coOpScale;
      enemies.push({
        id: nextEnemyId++,
        x: W / 2,
        y: -70,
        r: bossVariant === "leviathan" ? 60 : bossVariant === "warden" ? 54 : bossVariant === "mirror" ? 47 : config.radius,
        hp: maxHp,
        maxHp,
        speed: (config.speed + Math.min(12, currentWave * 1.2)) * variant.speed,
        hit: config.hit * variant.hit * (1 + Math.min(.32, currentWave * .025)),
        color: variant.color,
        kind: "boss",
        elite: true,
        cooldown: .8,
        slow: 0,
        bossPhase: 1,
        bossVariant,
      });
      lastBossWave = currentWave;
      setBossLootNotice(`⚠ 第 ${currentWave} 波 · ${variant.name}入侵`);
      audio?.play("ultimate");
    };
    const burst = (x:number,y:number,color:string,n=8) => {
      for(let i=0;i<n;i++){ const a=Math.random()*Math.PI*2,s=40+Math.random()*120; particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.35,color}); }
      if (particles.length > 360) particles.splice(0, particles.length - 360);
    };
    const addEffect = (effect: Omit<CombatEffect, "life" | "duration">, duration: number) => {
      effects.push({ ...effect, life: duration, duration });
      if (effects.length > 120) effects.splice(0, effects.length - 120);
    };
    const impactEffect = (x: number, y: number, color: string, radius = 24) => {
      addEffect({ kind: "impact", x, y, color, radius }, .28);
    };
    const triggerSkillEffect = (actor: Actor, classId: ClassId, start: Pick<Actor, "x" | "y"> = actor) => {
      const colors: Record<ClassId, string> = {
        assault: "#f4c95d",
        guardian: "#75e6da",
        engineer: "#a9ef84",
        phantom: "#a78cff",
        laser: "#ff5b58",
        frost: "#8bdcff",
        blade: "#ff9b43",
        gravity: "#a58cff",
        thunder: "#48dfff",
        sky: "#ff6a62",
        cinder: "#ff8a32",
      };
      const radii: Record<ClassId, number> = {
        assault: 190,
        guardian: 118,
        engineer: 165,
        phantom: 92,
        laser: 108,
        frost: 410,
        blade: 170,
        gravity: 330,
        thunder: 290,
        sky: 520,
        cinder: 440,
      };
      const color = colors[classId];
      addEffect({ kind: "skill", classId, x: actor.x, y: actor.y, color, radius: radii[classId] }, classId === "frost" ? 1 : .72);
      if (classId === "phantom") {
        addEffect({ kind: "dash", classId, x: start.x, y: start.y, x2: actor.x, y2: actor.y, color, radius: 34 }, .48);
      }
      burst(actor.x, actor.y, color, classId === "frost" ? 24 : 14);
    };
    const triggerSecondarySkillEffect = (
      actor: Actor,
      classId: ClassId,
      target?: { x: number; y: number },
      radius = 180,
    ) => {
      const color = CLASSES.find((entry) => entry.id === classId)?.color || "#f4c95d";
      addEffect({
        kind: "skill",
        variant: "secondary",
        classId,
        x: actor.x,
        y: actor.y,
        x2: target?.x,
        y2: target?.y,
        color,
        radius,
      }, .82);
      burst(actor.x, actor.y, color, classId === "blade" || classId === "guardian" ? 22 : 14);
    };
    const dronePosition = (actor: Actor, index: number, count: number, now = performance.now()) => {
      const angle = now / 1300 + index / Math.max(1, count) * Math.PI * 2;
      const orbit = actor.r + 25 + (index % 2) * 7;
      return { x: actor.x + Math.cos(angle) * orbit, y: actor.y + Math.sin(angle) * orbit, angle };
    };
    const fireMissileWave = (actor: Actor, combatStats: BuildFrame | CombatStats, owner: PlayerSide) => {
      const count = Math.max(8, Math.round(combatStats.missileCount));
      for (let index = 0; index < count; index++) {
        const angle = index / count * Math.PI * 2;
        shots.push({
          x: actor.x,
          y: actor.y,
          vx: Math.cos(angle) * 550,
          vy: Math.sin(angle) * 550,
          r: 7 + Math.max(0, combatStats.projectileSize - 7) * .35,
          damage: combatStats.damage * 1.78,
          life: 1.5,
          owner,
          classId: "assault",
          ...projectileTraits("assault"),
        });
      }
      burst(actor.x, actor.y, "#f4c95d", 18);
    };
    const queueMissileStorm = (actor: Actor, combatStats: BuildFrame | CombatStats, owner: PlayerSide) => {
      fireMissileWave(actor, combatStats, owner);
      for (let waveIndex = 1; waveIndex < combatStats.missileWaves; waveIndex++) {
        pendingMissileWaves.push({ actor, combatStats: { ...combatStats }, owner, delay: waveIndex * .28 });
      }
    };
    const applyEnemyDamage = (enemy: Enemy, amount: number, owner?: PlayerSide) => {
      const phase = enemy.bossPhase || 1;
      const bossResilience = enemy.kind !== "boss" ? 1 : phase === 1 ? .82 : phase === 2 ? .74 : .68;
      enemy.hp -= amount * bossResilience;
      if (owner) enemy.lastHitBy = owner;
    };
    const fireLaser = (actor: Actor, combatStats: BuildFrame | CombatStats, owner: PlayerSide) => {
      const target = enemies.length
        ? enemies.reduce((nearest, enemy) => dist(actor, enemy) < dist(actor, nearest) ? enemy : nearest)
        : null;
      const angle = target ? Math.atan2(target.y - actor.y, target.x - actor.x) : 0;
      const length = 1550;
      const x2 = actor.x + Math.cos(angle) * length;
      const y2 = actor.y + Math.sin(angle) * length;
      beams.push({ x1: actor.x, y1: actor.y, x2, y2, life: .36, width: 16 * combatStats.laserPower, color: "#ff4f50" });
      for (const enemy of enemies) {
        const along = (enemy.x - actor.x) * Math.cos(angle) + (enemy.y - actor.y) * Math.sin(angle);
        const perpendicular = Math.abs((enemy.x - actor.x) * Math.sin(angle) - (enemy.y - actor.y) * Math.cos(angle));
        if (along > 0 && along < length && perpendicular < enemy.r + 19 * combatStats.laserPower) {
          applyEnemyDamage(enemy, combatStats.damage * 9 * combatStats.laserPower, owner);
          burst(enemy.x, enemy.y, "#ff5b58", 9);
        }
      }
    };
    const freezeArea = (actor: Actor, combatStats: BuildFrame | CombatStats, owner: PlayerSide) => {
      const radius = 410 * combatStats.frostPower;
      for (const enemy of enemies) {
        if (dist(actor, enemy) > radius) continue;
        enemy.frozen = Math.max(enemy.frozen || 0, Math.min(3.2, 1.45 * combatStats.frostPower));
        enemy.slow = Math.max(enemy.slow, 5.5 * combatStats.frostPower);
        applyEnemyDamage(enemy, combatStats.damage * 2.4 * combatStats.frostPower, owner);
        burst(enemy.x, enemy.y, "#8bdcff", 7);
      }
      for (let index = 0; index < 30; index++) {
        const angle = index / 30 * Math.PI * 2;
        const speed = 160 + Math.random() * 150;
        particles.push({ x: actor.x, y: actor.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .7, color: "#b9efff" });
      }
    };
    const fireBlade = (actor: Actor, combatStats: BuildFrame | CombatStats, owner: PlayerSide, multiplier = 1) => {
      const range = combatStats.meleeRange * combatStats.meleePower;
      const target = enemies
        .filter((enemy) => enemy.hp > 0 && dist(actor, enemy) <= range + enemy.r)
        .sort((a, b) => dist(actor, a) - dist(actor, b))[0];
      if (!target) return false;
      const angle = Math.atan2(target.y - actor.y, target.x - actor.x);
      const damage = combatStats.damage * combatStats.meleePower * multiplier;
      let hitCount = 0;
      for (const enemy of enemies) {
        const distance = dist(actor, enemy);
        if (enemy.hp <= 0 || distance > range + enemy.r) continue;
        const enemyAngle = Math.atan2(enemy.y - actor.y, enemy.x - actor.x);
        const angleDelta = Math.abs(Math.atan2(Math.sin(enemyAngle - angle), Math.cos(enemyAngle - angle)));
        if (angleDelta > .92) continue;
        applyEnemyDamage(enemy, damage, owner);
        hitCount += 1;
        burst(enemy.x, enemy.y, "#ff9b43", 7);
        impactEffect(enemy.x, enemy.y, "#ffb25d", 34);
      }
      addEffect({
        kind: "slash",
        classId: "blade",
        x: actor.x,
        y: actor.y,
        x2: actor.x + Math.cos(angle) * range,
        y2: actor.y + Math.sin(angle) * range,
        color: "#ff9b43",
        radius: range,
      }, .3);
      if (hitCount > 0 && actor.hp > 0) {
        actor.hp = Math.min(actor.maxHp, actor.hp + Math.min(5, hitCount * 1.25 * combatStats.repairPower));
        if (actor === player) setHp(Math.ceil(player.hp));
      }
      audio?.play("hit");
      return true;
    };
    const bladeRush = (
      actor: Actor,
      combatStats: BuildFrame | CombatStats,
      owner: PlayerSide,
      syncedX?: number,
      syncedY?: number,
    ) => {
      const start = { x: actor.x, y: actor.y };
      const target = enemies.filter((enemy) => enemy.hp > 0).sort((a, b) => dist(actor, a) - dist(actor, b))[0];
      if (typeof syncedX === "number" && typeof syncedY === "number") {
        actor.x = clamp(syncedX, 30, W - 30);
        actor.y = clamp(syncedY, 30, H - 30);
      } else if (target) {
        const angle = Math.atan2(target.y - actor.y, target.x - actor.x);
        const travel = Math.min(combatStats.dashDistance, Math.max(0, dist(actor, target) - target.r - 20));
        actor.x = clamp(actor.x + Math.cos(angle) * travel, 30, W - 30);
        actor.y = clamp(actor.y + Math.sin(angle) * travel, 30, H - 30);
      }
      if (actor === player) selfShieldUntil = performance.now() + 800;
      else remoteShieldUntil = performance.now() + 800;
      addEffect({ kind: "dash", classId: "blade", x: start.x, y: start.y, x2: actor.x, y2: actor.y, color: "#ff9b43", radius: 42 }, .42);
      fireBlade(actor, combatStats, owner, 2.35);
      for (const enemy of enemies) {
        if (dist(actor, enemy) > combatStats.meleeRange * 1.25 + enemy.r) continue;
        applyEnemyDamage(enemy, combatStats.damage * combatStats.meleePower * .75, owner);
      }
    };
    const gravityWell = (actor: Actor, combatStats: BuildFrame | CombatStats, owner: PlayerSide) => {
      const radius = 330 * combatStats.gravityPower;
      for (const enemy of enemies) {
        const distance = dist(actor, enemy);
        if (distance > radius) continue;
        const angle = Math.atan2(actor.y - enemy.y, actor.x - enemy.x);
        const pull = Math.min(120, distance * .34) * combatStats.gravityPower;
        enemy.x += Math.cos(angle) * pull;
        enemy.y += Math.sin(angle) * pull;
        enemy.slow = Math.max(enemy.slow, 2.6 * combatStats.gravityPower);
        applyEnemyDamage(enemy, combatStats.damage * 2.3 * combatStats.gravityPower, owner);
        burst(enemy.x, enemy.y, "#a58cff", 6);
      }
      addEffect({ kind: "skill", classId: "gravity", x: actor.x, y: actor.y, color: "#a58cff", radius }, 1);
      burst(actor.x, actor.y, "#a58cff", 24);
    };
    const thunderChain = (actor: Actor, combatStats: BuildFrame | CombatStats, owner: PlayerSide) => {
      const targetCount = clamp(3 + Math.floor(combatStats.ultimateTargets / 3), 5, 9);
      const remaining = enemies.filter((enemy) => enemy.hp > 0);
      let source = { x: actor.x, y: actor.y };
      for (let index = 0; index < targetCount && remaining.length; index++) {
        const target = remaining
          .filter((enemy) => index === 0 ? dist(source, enemy) < 560 : dist(source, enemy) < 275)
          .sort((a, b) => dist(source, a) - dist(source, b))[0];
        if (!target) break;
        const damageScale = Math.max(.54, 1 - index * .09);
        applyEnemyDamage(target, combatStats.damage * 3.15 * combatStats.lightningPower * damageScale, owner);
        target.stunned = Math.max(target.stunned || 0, .34);
        beams.push({ x1: source.x, y1: source.y, x2: target.x, y2: target.y, life: .3, width: Math.max(3, 8 - index * .6), color: index % 2 ? "#b9f8ff" : "#48dfff" });
        burst(target.x, target.y, "#48dfff", 8);
        source = { x: target.x, y: target.y };
        remaining.splice(remaining.indexOf(target), 1);
      }
      addEffect({ kind: "skill", classId: "thunder", x: actor.x, y: actor.y, color: "#48dfff", radius: 290 }, .88);
    };
    const railSnipe = (actor: Actor, combatStats: BuildFrame | CombatStats, owner: PlayerSide) => {
      const target = enemies
        .filter((enemy) => enemy.hp > 0)
        .sort((a, b) => (b.kind === "boss" ? 1 : 0) - (a.kind === "boss" ? 1 : 0) || b.maxHp - a.maxHp)[0];
      const angle = target ? Math.atan2(target.y - actor.y, target.x - actor.x) : -Math.PI / 2;
      const length = 1650;
      const x2 = actor.x + Math.cos(angle) * length;
      const y2 = actor.y + Math.sin(angle) * length;
      beams.push({ x1: actor.x, y1: actor.y, x2, y2, life: .58, width: 11 + combatStats.projectileSize, color: "#fff1df" });
      for (const enemy of enemies) {
        const along = (enemy.x - actor.x) * Math.cos(angle) + (enemy.y - actor.y) * Math.sin(angle);
        const perpendicular = Math.abs((enemy.x - actor.x) * Math.sin(angle) - (enemy.y - actor.y) * Math.cos(angle));
        if (along <= 0 || along >= length || perpendicular >= enemy.r + 16) continue;
        const bossMultiplier = enemy.kind === "boss" ? 1.28 : 1;
        applyEnemyDamage(enemy, combatStats.damage * 7.6 * combatStats.sniperPower * bossMultiplier, owner);
        burst(enemy.x, enemy.y, "#ff6a62", 12);
      }
      addEffect({ kind: "skill", classId: "sky", x: actor.x, y: actor.y, x2, y2, color: "#ff6a62", radius: 520 }, .72);
    };
    const incinerateCone = (actor: Actor, combatStats: BuildFrame | CombatStats, owner: PlayerSide) => {
      const target = enemies.filter((enemy) => enemy.hp > 0).sort((a, b) => dist(actor, a) - dist(actor, b))[0];
      const angle = target ? Math.atan2(target.y - actor.y, target.x - actor.x) : -Math.PI / 2;
      const range = 470;
      for (const enemy of enemies) {
        const distance = dist(actor, enemy);
        if (distance > range + enemy.r) continue;
        const enemyAngle = Math.atan2(enemy.y - actor.y, enemy.x - actor.x);
        const delta = Math.abs(Math.atan2(Math.sin(enemyAngle - angle), Math.cos(enemyAngle - angle)));
        if (delta > .62) continue;
        applyEnemyDamage(enemy, combatStats.damage * 2.5 * combatStats.burnPower, owner);
        enemy.burn = Math.max(enemy.burn || 0, 5.2 * combatStats.burnPower);
        enemy.burnDamage = Math.max(enemy.burnDamage || 0, combatStats.damage * .42 * combatStats.burnPower);
        enemy.burnOwner = owner;
        burst(enemy.x, enemy.y, "#ff8a32", 10);
      }
      addEffect({ kind: "skill", classId: "cinder", x: actor.x, y: actor.y, x2: actor.x + Math.cos(angle) * range, y2: actor.y + Math.sin(angle) * range, color: "#ff8a32", radius: range }, 1.05);
    };
    const executeSecondarySkill = (
      actor: Actor,
      combatStats: BuildFrame | CombatStats,
      classId: ClassId,
      owner: PlayerSide,
    ) => {
      const threats = prioritizeUltimateTargets(enemies.filter((enemy) => enemy.hp > 0), actor, 8);
      const target = threats[0];
      const aimAngle = target ? Math.atan2(target.y - actor.y, target.x - actor.x) : -Math.PI / 2;
      const secondaryPower = combatStats.secondaryPower;
      const secondaryArea = combatStats.secondaryArea;
      const secondaryProjectiles = Math.round(combatStats.secondaryProjectiles);
      const secondaryControl = combatStats.secondaryControl;
      const pushEnemies = (radius: number, distance: number, damage: number, stun = 0) => {
        for (const enemy of enemies) {
          const range = dist(actor, enemy);
          if (enemy.hp <= 0 || range > radius + enemy.r || range < 1) continue;
          const angle = Math.atan2(enemy.y - actor.y, enemy.x - actor.x);
          enemy.x = clamp(enemy.x + Math.cos(angle) * distance, -80, W + 80);
          enemy.y = clamp(enemy.y + Math.sin(angle) * distance, -80, H + 80);
          if (stun > 0) enemy.stunned = Math.max(enemy.stunned || 0, stun);
          applyEnemyDamage(enemy, damage, owner);
          burst(enemy.x, enemy.y, classId === "guardian" ? "#75e6da" : "#a58cff", 7);
        }
      };
      const damageLine = (angle: number, width: number, damage: number, color: string) => {
        const reach = 1700;
        for (const direction of [-1, 1]) {
          const lineAngle = angle + (direction < 0 ? Math.PI : 0);
          const x2 = actor.x + Math.cos(lineAngle) * reach;
          const y2 = actor.y + Math.sin(lineAngle) * reach;
          beams.push({ x1: actor.x, y1: actor.y, x2, y2, life: .5, width, color });
          for (const enemy of enemies) {
            const along = (enemy.x - actor.x) * Math.cos(lineAngle) + (enemy.y - actor.y) * Math.sin(lineAngle);
            const perpendicular = Math.abs((enemy.x - actor.x) * Math.sin(lineAngle) - (enemy.y - actor.y) * Math.cos(lineAngle));
            if (along > 0 && along < reach && perpendicular < enemy.r + width) applyEnemyDamage(enemy, damage, owner);
          }
        }
      };

      if (classId === "assault") {
        const salvo = 1 + secondaryProjectiles;
        for (let index = 0; index < salvo; index++) {
          const angle = aimAngle + (index - (salvo - 1) / 2) * .16;
          shots.push({
            x: actor.x, y: actor.y,
            vx: Math.cos(angle) * 720, vy: Math.sin(angle) * 720,
            r: 12, damage: combatStats.damage * 3.6 * secondaryPower, life: 2.8,
            owner, classId, splash: 118, pierce: 1, skill2: true,
          });
        }
        triggerSecondarySkillEffect(actor, classId, target, 150);
      }
      if (classId === "guardian") {
        pushEnemies(255 * secondaryArea, 190 * secondaryArea, combatStats.damage * 2.2 * secondaryPower, .85);
        if (actor === player) selfShieldUntil = Math.max(selfShieldUntil, performance.now() + 650);
        else remoteShieldUntil = Math.max(remoteShieldUntil, performance.now() + 650);
        triggerSecondarySkillEffect(actor, classId, undefined, 255 * secondaryArea);
      }
      if (classId === "engineer") {
        const volley = Math.max(5, Math.round(combatStats.drones * 3 + 2 + secondaryProjectiles));
        for (let index = 0; index < volley; index++) {
          const origin = dronePosition(actor, index, volley);
          const prey = threats[index % Math.max(1, threats.length)];
          const angle = prey ? Math.atan2(prey.y - origin.y, prey.x - origin.x) : index / volley * Math.PI * 2;
          shots.push({
            x: origin.x, y: origin.y,
            vx: Math.cos(angle) * 780, vy: Math.sin(angle) * 780,
            r: 6, damage: combatStats.damage * 1.5 * combatStats.dronePower * secondaryPower, life: 2.4,
            owner, classId, chain: true, pierce: 1, skill2: true,
          });
        }
        triggerSecondarySkillEffect(actor, classId, target, 210);
      }
      if (classId === "phantom") {
        const bladeCount = 3 + secondaryProjectiles;
        for (let index = 0; index < bladeCount; index++) {
          const angle = aimAngle + (index - (bladeCount - 1) / 2) * .15;
          shots.push({
            x: actor.x, y: actor.y,
            vx: Math.cos(angle) * 980, vy: Math.sin(angle) * 980,
            r: 7, damage: combatStats.damage * 2.55 * secondaryPower, life: 2.2,
            owner, classId, pierce: 4, skill2: true,
          });
        }
        triggerSecondarySkillEffect(actor, classId, target, 190);
      }
      if (classId === "laser") {
        const axes = 2 + secondaryProjectiles;
        for (let index = 0; index < axes; index++) {
          const angle = aimAngle + index / axes * Math.PI;
          const width = (index === 0 ? 11 : 8) * combatStats.laserPower;
          const damage = combatStats.damage * (index === 0 ? 4.2 : 3.1) * combatStats.laserPower * secondaryPower;
          damageLine(angle, width, damage, index % 2 ? "#ffb0a7" : "#ff5b58");
        }
        triggerSecondarySkillEffect(actor, classId, target, 300);
      }
      if (classId === "frost") {
        shots.push({
          x: actor.x, y: actor.y,
          vx: Math.cos(aimAngle) * 620, vy: Math.sin(aimAngle) * 620,
          r: 14, damage: combatStats.damage * 3.35 * combatStats.frostPower * secondaryPower, life: 3,
          owner, classId, pierce: 2, splash: 92 * secondaryArea, slow: 6.5 * secondaryControl, freeze: 1.25 * secondaryControl, skill2: true,
        });
        triggerSecondarySkillEffect(actor, classId, target, 220 * secondaryArea);
      }
      if (classId === "blade") {
        const range = combatStats.meleeRange * 1.55 * combatStats.meleePower * secondaryArea;
        for (let index = 0; index < 3; index++) {
          const angle = aimAngle + index / 3 * Math.PI * 2;
          addEffect({
            kind: "slash", classId, x: actor.x, y: actor.y,
            x2: actor.x + Math.cos(angle) * range, y2: actor.y + Math.sin(angle) * range,
            color: "#ff9b43", radius: range,
          }, .56);
        }
        for (const enemy of enemies) {
          if (enemy.hp <= 0 || dist(actor, enemy) > range + enemy.r) continue;
          applyEnemyDamage(enemy, combatStats.damage * 3.15 * combatStats.meleePower * secondaryPower, owner);
          burst(enemy.x, enemy.y, "#ff9b43", 10);
        }
        if (actor === player) selfShieldUntil = Math.max(selfShieldUntil, performance.now() + 700);
        else remoteShieldUntil = Math.max(remoteShieldUntil, performance.now() + 700);
        triggerSecondarySkillEffect(actor, classId, undefined, range);
      }
      if (classId === "gravity") {
        const gravityRadius = 350 * combatStats.gravityPower * secondaryArea;
        pushEnemies(gravityRadius, 245 * secondaryArea, combatStats.damage * 2.75 * combatStats.gravityPower * secondaryPower, .35);
        triggerSecondarySkillEffect(actor, classId, undefined, gravityRadius);
      }
      if (classId === "thunder") {
        const targets = enemies
          .filter((enemy) => enemy.hp > 0 && dist(actor, enemy) < 410)
          .sort((a, b) => dist(actor, a) - dist(actor, b))
          .slice(0, 10 + secondaryProjectiles);
        for (const [index, enemy] of targets.entries()) {
          enemy.stunned = Math.max(enemy.stunned || 0, .7 * secondaryControl);
          applyEnemyDamage(enemy, combatStats.damage * 2.15 * combatStats.lightningPower * secondaryPower, owner);
          beams.push({
            x1: index ? targets[index - 1].x : actor.x,
            y1: index ? targets[index - 1].y : actor.y,
            x2: enemy.x, y2: enemy.y, life: .34, width: 6, color: "#48dfff",
          });
        }
        triggerSecondarySkillEffect(actor, classId, target, 410);
      }
      if (classId === "sky") {
        const marked = threats.slice(0, 3 + secondaryProjectiles);
        for (const enemy of marked) {
          beams.push({ x1: enemy.x, y1: -100, x2: enemy.x, y2: enemy.y, life: .68, width: 9, color: "#fff1df" });
          addEffect({ kind: "impact", classId, x: enemy.x, y: enemy.y, color: "#ff6a62", radius: 92 }, .52);
          applyEnemyDamage(enemy, combatStats.damage * 4.4 * combatStats.sniperPower * secondaryPower * (enemy.kind === "boss" ? 1.2 : 1), owner);
        }
        triggerSecondarySkillEffect(actor, classId, target, 330);
      }
      if (classId === "cinder") {
        shots.push({
          x: actor.x, y: actor.y,
          vx: Math.cos(aimAngle) * 480, vy: Math.sin(aimAngle) * 480,
          r: 16, damage: combatStats.damage * 2.7 * combatStats.burnPower * secondaryPower, life: 3.4,
          owner, classId, splash: 145 * secondaryArea, burn: 6.5 * secondaryControl, burnDamage: combatStats.damage * .55 * secondaryPower, skill2: true,
        });
        triggerSecondarySkillEffect(actor, classId, target, 240 * secondaryArea);
      }
    };
    const executeUltimate = (actor: Actor, combatStats: BuildFrame | CombatStats, classId: ClassId, owner: PlayerSide) => {
      const power = combatStats.ultimatePower;
      const color = CLASSES.find((entry) => entry.id === classId)?.color || "#f4c95d";
      const aimTarget = prioritizeUltimateTargets(enemies, actor, 1)[0];
      const aimAngle = aimTarget ? Math.atan2(aimTarget.y - actor.y, aimTarget.x - actor.x) : -Math.PI / 2;
      const ultimateReach = Math.hypot(W, H) + 160;
      const damageEnemy = (enemy: Enemy, amount: number) => {
        applyEnemyDamage(enemy, amount, owner);
      };
      if (classId === "assault") {
        const strikeTargets = prioritizeUltimateTargets(enemies, actor, combatStats.ultimateTargets);
        for (const target of strikeTargets) {
          addEffect({ kind: "ultimate", classId, x: target.x, y: target.y, x2: target.x, y2: target.y - 250, color, radius: 92 }, 1.25);
          beams.push({ x1: target.x, y1: target.y - 250, x2: target.x, y2: target.y, life: .46, width: 7, color: "#fff2a8" });
          for (const enemy of enemies) {
            if (dist(target, enemy) <= 86 + enemy.r) damageEnemy(enemy, combatStats.damage * 3.25 * power);
          }
          burst(target.x, target.y, "#f4c95d", 18);
        }
      }
      if (classId === "guardian") {
        const shieldUntil = performance.now() + Math.min(5400, combatStats.ultimateDuration * 1000);
        if (actor === player) selfShieldUntil = shieldUntil;
        else remoteShieldUntil = shieldUntil;
        actor.hp = Math.min(actor.maxHp, actor.hp + actor.maxHp * .32);
        if (player.hp > 0) player.hp = Math.min(player.maxHp, player.hp + player.maxHp * .16);
        if (remote && remote.hp > 0) remote.hp = Math.min(remote.maxHp, remote.hp + remote.maxHp * .16);
        for (const enemy of enemies) {
          const distance = dist(actor, enemy);
          if (distance > 330 || distance < 1) continue;
          const angle = Math.atan2(enemy.y - actor.y, enemy.x - actor.x);
          enemy.x = clamp(enemy.x + Math.cos(angle) * 170, -80, W + 80);
          enemy.y = clamp(enemy.y + Math.sin(angle) * 170, -80, H + 80);
          enemy.slow = Math.max(enemy.slow, 2.5);
          damageEnemy(enemy, combatStats.damage * 1.8 * power);
        }
        addEffect({ kind: "ultimate", classId, x: actor.x, y: actor.y, color, radius: 235 }, Math.min(2.8, combatStats.ultimateDuration));
      }
      if (classId === "engineer") {
        if (player.hp > 0) player.hp = Math.min(player.maxHp, player.hp + 42 * combatStats.repairPower);
        if (remote && remote.hp > 0) remote.hp = Math.min(remote.maxHp, remote.hp + 42 * combatStats.repairPower);
        const targets = prioritizeUltimateTargets(enemies, actor, combatStats.ultimateTargets);
        for (let index = 0; index < Math.max(12, targets.length * 2); index++) {
          const orbitAngle = index / Math.max(12, targets.length * 2) * Math.PI * 2;
          const origin = { x: actor.x + Math.cos(orbitAngle) * 92, y: actor.y + Math.sin(orbitAngle) * 92 };
          const target = targets[index % Math.max(1, targets.length)];
          const shotAngle = target ? Math.atan2(target.y - origin.y, target.x - origin.x) : orbitAngle;
          shots.push({ x: origin.x, y: origin.y, vx: Math.cos(shotAngle) * 780, vy: Math.sin(shotAngle) * 780, r: 5, damage: combatStats.damage * 2.15 * combatStats.dronePower * power, life: 2.65, owner, classId: "engineer", chain: true, pierce: 1 });
        }
        addEffect({ kind: "ultimate", classId, x: actor.x, y: actor.y, color, radius: 120 }, 2);
      }
      if (classId === "phantom") {
        const marked = prioritizeUltimateTargets(enemies, actor, combatStats.ultimateTargets);
        let previous = { x: actor.x, y: actor.y };
        for (const enemy of marked) {
          beams.push({ x1: previous.x, y1: previous.y, x2: enemy.x, y2: enemy.y, life: .5, width: 7, color: "#a78cff" });
          addEffect({ kind: "dash", classId, x: previous.x, y: previous.y, x2: enemy.x, y2: enemy.y, color, radius: 36 }, .48);
          damageEnemy(enemy, combatStats.damage * (enemy.hp < enemy.maxHp * .35 ? 11 : 7.5) * power);
          previous = { x: enemy.x, y: enemy.y };
        }
        addEffect({ kind: "ultimate", classId, x: actor.x, y: actor.y, x2: previous.x, y2: previous.y, color, radius: 180 }, 1.5);
        if (actor === player) selfShieldUntil = performance.now() + 2600;
        else remoteShieldUntil = performance.now() + 2600;
      }
      if (classId === "laser") {
        const length = ultimateReach;
        const beamCount = clamp(Math.round(combatStats.ultimateLanes), 8, 16);
        for (let index = 0; index < beamCount; index++) {
          const beamAngle = aimAngle + index / beamCount * Math.PI * 2;
          const x1 = actor.x, y1 = actor.y;
          const x2 = x1 + Math.cos(beamAngle) * length, y2 = y1 + Math.sin(beamAngle) * length;
          beams.push({ x1, y1, x2, y2, life: .92, width: 25 * combatStats.laserPower, color: "#ff4f50" });
          for (const enemy of enemies) {
            const along = (enemy.x - x1) * Math.cos(beamAngle) + (enemy.y - y1) * Math.sin(beamAngle);
            const perpendicular = Math.abs((enemy.x - x1) * Math.sin(beamAngle) - (enemy.y - y1) * Math.cos(beamAngle));
            if (along <= 0 || along >= length || perpendicular >= enemy.r + 25 * combatStats.laserPower) continue;
            damageEnemy(enemy, combatStats.damage * 5.2 * combatStats.laserPower * power);
          }
        }
        addEffect({ kind: "ultimate", classId, count: beamCount, x: actor.x, y: actor.y, x2: actor.x + Math.cos(aimAngle) * length, y2: actor.y + Math.sin(aimAngle) * length, color, radius: 620 }, 1.35);
      }
      if (classId === "frost") {
        const laneCount = clamp(Math.round(combatStats.ultimateLanes), 1, 4);
        const normalX = -Math.sin(aimAngle), normalY = Math.cos(aimAngle);
        const laneOffsets = Array.from({ length: laneCount }, (_, index) => (index - (laneCount - 1) / 2) * 104);
        for (const offset of laneOffsets) {
          const laneX = actor.x + normalX * offset, laneY = actor.y + normalY * offset;
          const endX = laneX + Math.cos(aimAngle) * ultimateReach, endY = laneY + Math.sin(aimAngle) * ultimateReach;
          beams.push({ x1: laneX, y1: laneY, x2: endX, y2: endY, life: 1.15, width: 18 * combatStats.frostPower, color: "#b9efff" });
          for (const enemy of enemies) {
            const along = (enemy.x - laneX) * Math.cos(aimAngle) + (enemy.y - laneY) * Math.sin(aimAngle);
            const perpendicular = Math.abs((enemy.x - laneX) * Math.sin(aimAngle) - (enemy.y - laneY) * Math.cos(aimAngle));
            const laneWidth = 72 + Math.max(0, along) * .055;
            if (along < -60 || along > ultimateReach || perpendicular > laneWidth + enemy.r) continue;
            enemy.frozen = Math.max(enemy.frozen || 0, Math.min(3.8, 1.8 * combatStats.frostPower));
            enemy.slow = Math.max(enemy.slow, 9 * combatStats.frostPower);
            damageEnemy(enemy, combatStats.damage * 4.8 * combatStats.frostPower * power);
          }
        }
        addEffect({ kind: "ultimate", classId, count: laneCount, x: actor.x, y: actor.y, x2: actor.x + Math.cos(aimAngle) * ultimateReach, y2: actor.y + Math.sin(aimAngle) * ultimateReach, color, radius: 220 }, 2.1);
      }
      if (classId === "blade") {
        const start = { x: actor.x, y: actor.y };
        const travel = aimTarget
          ? Math.min(ultimateReach, Math.max(720, dist(actor, aimTarget) + aimTarget.r + 24))
          : 720;
        const end = { x: clamp(actor.x + Math.cos(aimAngle) * travel, 34, W - 34), y: clamp(actor.y + Math.sin(aimAngle) * travel, 34, H - 34) };
        for (const enemy of enemies) {
          const lineLength = Math.max(1, dist(start, end));
          const along = ((enemy.x - start.x) * (end.x - start.x) + (enemy.y - start.y) * (end.y - start.y)) / lineLength;
          const perpendicular = Math.abs((enemy.x - start.x) * Math.sin(aimAngle) - (enemy.y - start.y) * Math.cos(aimAngle));
          if (along < -enemy.r || along > lineLength + enemy.r || perpendicular > 115 + enemy.r) continue;
          const echoScale = 1 + (Math.round(combatStats.ultimateEchoes) - 1) * .42;
          damageEnemy(enemy, combatStats.damage * 7.2 * combatStats.meleePower * power * echoScale);
          burst(enemy.x, enemy.y, "#ff9b43", 10);
        }
        actor.x = end.x;
        actor.y = end.y;
        addEffect({ kind: "dash", classId, x: start.x, y: start.y, x2: end.x, y2: end.y, color, radius: 72 }, .85);
        const echoCount = clamp(Math.round(combatStats.ultimateEchoes), 1, 4);
        const normalX = -Math.sin(aimAngle), normalY = Math.cos(aimAngle);
        for (let index = 0; index < echoCount; index++) {
          const offset = (index - (echoCount - 1) / 2) * 34;
          addEffect({ kind: "ultimate", classId, x: start.x + normalX * offset, y: start.y + normalY * offset, x2: end.x + normalX * offset, y2: end.y + normalY * offset, color, radius: 180 }, 1.45 + index * .08);
        }
        actor.hp = Math.min(actor.maxHp, actor.hp + actor.maxHp * .24);
        if (actor === player) selfShieldUntil = performance.now() + 2200;
        else remoteShieldUntil = performance.now() + 2200;
      }
      if (classId === "gravity") {
        const gravityRange = clamp(combatStats.ultimateRange, 430, 670);
        const cluster = prioritizeUltimateTargets(enemies, actor, 16);
        const bossTarget = cluster.find((enemy) => enemy.kind === "boss");
        const center = bossTarget
          ? { x: bossTarget.x, y: bossTarget.y }
          : cluster.length
          ? { x: cluster.reduce((sum, enemy) => sum + enemy.x, 0) / cluster.length, y: cluster.reduce((sum, enemy) => sum + enemy.y, 0) / cluster.length }
          : { x: actor.x, y: actor.y };
        for (const enemy of enemies) {
          const distance = dist(center, enemy);
          if (distance > gravityRange) continue;
          const angle = Math.atan2(center.y - enemy.y, center.x - enemy.x);
          enemy.x += Math.cos(angle) * Math.min(330, distance * .72);
          enemy.y += Math.sin(angle) * Math.min(330, distance * .72);
          enemy.slow = Math.max(enemy.slow, 7);
          damageEnemy(enemy, combatStats.damage * (4.2 + Math.max(0, 1 - distance / gravityRange) * 3) * combatStats.gravityPower * power);
          beams.push({ x1: enemy.x, y1: enemy.y, x2: center.x, y2: center.y, life: .52, width: 5, color: "#a58cff" });
        }
        addEffect({ kind: "ultimate", classId, x: center.x, y: center.y, color, radius: gravityRange * .58 }, 2.2);
      }
      if (classId === "thunder") {
        const targets = prioritizeUltimateTargets(enemies, actor, combatStats.ultimateTargets);
        for (const [index, target] of targets.entries()) {
          const strikeDamage = combatStats.damage * 5.1 * combatStats.lightningPower * power;
          damageEnemy(target, strikeDamage);
          target.stunned = Math.max(target.stunned || 0, 1.05);
          beams.push({ x1: target.x + (index % 2 ? 55 : -55), y1: target.y - 520, x2: target.x, y2: target.y, life: .72, width: 10, color: "#b9f8ff" });
          addEffect({ kind: "ultimate", classId, x: target.x, y: target.y, x2: target.x, y2: target.y - 520, color, radius: 110 }, 1.35);
          for (const nearby of enemies) {
            if (nearby === target || dist(target, nearby) > 145 + nearby.r) continue;
            damageEnemy(nearby, strikeDamage * .38);
            beams.push({ x1: target.x, y1: target.y, x2: nearby.x, y2: nearby.y, life: .34, width: 5, color: "#48dfff" });
          }
          burst(target.x, target.y, "#48dfff", 20);
        }
      }
      if (classId === "sky") {
        const targets = prioritizeUltimateTargets(enemies, actor, combatStats.ultimateTargets);
        for (const [index, target] of targets.entries()) {
          const xOffset = (index - (targets.length - 1) / 2) * 38;
          beams.push({ x1: target.x + xOffset, y1: -120, x2: target.x, y2: target.y, life: .95, width: 16, color: "#fff1df" });
          beams.push({ x1: target.x - 110, y1: target.y, x2: target.x + 110, y2: target.y, life: .48, width: 3, color: "#ff6a62" });
          damageEnemy(target, combatStats.damage * 8.8 * combatStats.sniperPower * power * (target.kind === "boss" ? 1.2 : 1));
          addEffect({ kind: "ultimate", classId, x: target.x, y: target.y, x2: target.x, y2: -120, color, radius: 125 }, 1.45);
          burst(target.x, target.y, "#ff6a62", 22);
        }
      }
      if (classId === "cinder") {
        const laneCount = clamp(Math.round(combatStats.ultimateLanes), 3, 5);
        const normalX = -Math.sin(aimAngle), normalY = Math.cos(aimAngle);
        const length = ultimateReach;
        for (let lane = 0; lane < laneCount; lane++) {
          const offset = (lane - (laneCount - 1) / 2) * 118;
          const x1 = actor.x + normalX * offset;
          const y1 = actor.y + normalY * offset;
          const x2 = x1 + Math.cos(aimAngle) * length;
          const y2 = y1 + Math.sin(aimAngle) * length;
          beams.push({ x1, y1, x2, y2, life: 1.55, width: 42, color: lane % 2 ? "#ffb23e" : "#ff672f" });
          for (const enemy of enemies) {
            const along = (enemy.x - x1) * Math.cos(aimAngle) + (enemy.y - y1) * Math.sin(aimAngle);
            const perpendicular = Math.abs((enemy.x - x1) * Math.sin(aimAngle) - (enemy.y - y1) * Math.cos(aimAngle));
            if (along < -50 || along > length || perpendicular > 54 + enemy.r) continue;
            damageEnemy(enemy, combatStats.damage * 4.2 * combatStats.burnPower * power);
            enemy.burn = Math.max(enemy.burn || 0, 6.5 * combatStats.burnPower);
            enemy.burnDamage = Math.max(enemy.burnDamage || 0, combatStats.damage * .52 * combatStats.burnPower * power);
            enemy.burnOwner = owner;
          }
        }
        addEffect({ kind: "ultimate", classId, count: laneCount, x: actor.x, y: actor.y, x2: actor.x + Math.cos(aimAngle) * length, y2: actor.y + Math.sin(aimAngle) * length, color, radius: 310 }, 2.15);
      }
      burst(actor.x, actor.y, color, classId === "guardian" || classId === "engineer" ? 26 : 40);
      setHp(Math.ceil(player.hp));
      audio?.play("ultimate");
    };
    activeUltimateRef.current = () => {
      if (player.hp <= 0 || localPaused || pausedRef.current || localUltimate() < ULTIMATE_MAX) return;
      setLocalUltimate(0);
      if (network?.role === "join") {
        if (network.connected()) void network.send({ t: "ultimate", classId: build.classId, x: player.x, y: player.y });
        addEffect({ kind: "ultimate", classId: build.classId, x: player.x, y: player.y, color: classSpec().color, radius: 420 }, 1.2);
        audio?.play("ultimate");
        return;
      }
      executeUltimate(player, stats, build.classId, "host");
    };
    const levelUp = () => {
      audio?.play("level");
      currentLevel++; setLevel(currentLevel);
      const pool = rollUpgradeChoices(build.classId, build, currentWave);
      localUpgradeDone = false;
      localUpgradeStartedAlive = player.hp > 0;
      localUpgradeStartHp = player.hp;
      localUpgradeRerolls = 0;
      setUpgradeRerolls(0);
      waitingForRemoteUpgrade = Boolean(remote && network?.connected());
      setWaitingPeerUpgrade(false);
      localPaused = true; setChoices(pool);
      if (network?.connected()) {
        void network.send({ t: "levelup", level: currentLevel });
      }
    };

    const xpNeed = () => Math.round(28 + currentLevel * 8.5 + Math.pow(Math.max(0, currentLevel - 1), 1.65) * 2.4);
    const xpGainScale = () => clamp(
      1 / (1 + Math.max(0, currentLevel - 1) * .035 + Math.max(0, currentWave - 1) * .04),
      .32,
      1,
    );
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
          beams,
          effects,
          revive: { host: hostReviveProgress, guest: guestReviveProgress },
          wallet: { host: hostCoins, guest: guestCoins },
          ultimate: { host: hostUltimate, guest: guestUltimate },
          wave: currentWave,
        },
      });
    };

    const update = (dt: number) => {
      let dx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
      let dy = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
      const dm = Math.hypot(dx, dy) || 1; dx /= dm; dy /= dm;
      if (player.hp > 0) {
        player.x = clamp(player.x + dx * stats.speed * dt, 30, W - 30);
        player.y = clamp(player.y + dy * stats.speed * dt, 30, H - 30);
      }

      netClock -= dt;
      if (network?.connected() && network.role === "join" && netClock <= 0) {
        netClock = .033;
        void network.send({ t: "player", x: player.x, y: player.y });
      }

      for (const p of particles) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.vx *= .96; p.vy *= .96;
      }
      particles = particles.filter((particle) => particle.life > 0);
      for (const beam of beams) beam.life -= dt;
      beams = beams.filter((beam) => beam.life > 0);
      for (const effect of effects) effect.life -= dt;
      effects = effects.filter((effect) => effect.life > 0);
      const cooldownRemaining = Math.max(0, Math.ceil((skillReadyAt - performance.now()) / 1000));
      if (cooldownRemaining !== shownCooldown) {
        shownCooldown = cooldownRemaining;
        setSkillCooldown(cooldownRemaining);
      }
      const secondaryCooldownRemaining = Math.max(0, Math.ceil((secondarySkillReadyAt - performance.now()) / 1000));
      if (secondaryCooldownRemaining !== shownSecondaryCooldown) {
        shownSecondaryCooldown = secondaryCooldownRemaining;
        setSecondarySkillCooldown(secondaryCooldownRemaining);
      }
      if (!isAuthority) return;

      elapsed += dt;
      setSeconds(Math.floor(elapsed));
      for (const pending of pendingMissileWaves) pending.delay -= dt;
      for (const pending of pendingMissileWaves.filter((entry) => entry.delay <= 0)) {
        fireMissileWave(pending.actor, pending.combatStats, pending.owner);
      }
      pendingMissileWaves = pendingMissileWaves.filter((entry) => entry.delay > 0);
      if (remote && network?.connected()) {
        const inReviveRange = dist(player, remote) <= REVIVE_RANGE;
        if (player.hp <= 0 && remote.hp > 0) {
          if (inReviveRange) hostReviveProgress = Math.min(REVIVE_SECONDS, hostReviveProgress + dt);
        } else {
          hostReviveProgress = 0;
        }
        if (remote.hp <= 0 && player.hp > 0) {
          if (inReviveRange) guestReviveProgress = Math.min(REVIVE_SECONDS, guestReviveProgress + dt);
        } else {
          guestReviveProgress = 0;
        }
        if (hostReviveProgress >= REVIVE_SECONDS) {
          player.hp = Math.max(1, Math.round(player.maxHp * .45));
          hostReviveProgress = 0;
          selfShieldUntil = performance.now() + 2200;
          setHp(Math.ceil(player.hp));
          addEffect({ kind: "revive", x: player.x, y: player.y, color: "#76f0ae", radius: 150 }, 1.1);
          burst(player.x, player.y, "#76f0ae", 28);
          audio?.play("upgrade");
        }
        if (guestReviveProgress >= REVIVE_SECONDS) {
          remote.hp = Math.max(1, Math.round(remote.maxHp * .45));
          guestReviveProgress = 0;
          remoteShieldUntil = performance.now() + 2200;
          addEffect({ kind: "revive", x: remote.x, y: remote.y, color: "#76f0ae", radius: 150 }, 1.1);
          burst(remote.x, remote.y, "#76f0ae", 28);
          audio?.play("upgrade");
        }
        setTeammateHp(Math.max(0, Math.ceil(remote.hp)));
        setTeammateMaxHp(remote.maxHp);
        setRescueProgress(clamp(hostReviveProgress / REVIVE_SECONDS, 0, 1));
      } else {
        hostReviveProgress = 0;
        guestReviveProgress = 0;
        setTeammateHp(null);
        setRescueProgress(0);
      }
      const coOpActive = Boolean(remote && network?.connected());
      if (elapsed >= nextWaveAt) {
        currentWave += 1;
        nextWaveAt += WAVE_INTERVAL_SECONDS;
        setWave(currentWave);
        const shouldOpenSupply = (currentWave - 1) % SHOP_EVERY_WAVES === 0;
        if (!shouldOpenSupply) return;
        const reward = supplyRewardFor(waveKills, currentWave);
        hostCoins += reward;
        if (coOpActive) guestCoins += reward;
        waveKills = 0;
        localShopDone = false;
        remoteShopDone = false;
        localShopStartedAlive = player.hp > 0;
        localShopStartHp = player.hp;
        localShopRerolls = 0;
        setShopRerolls(0);
        localPaused = true;
        setCoins(hostCoins);
        setSupplyReward(reward);
        setWaitingSupply(false);
        shopStock = rollShopItems(currentWave, hostCoins, recentShopIds);
        recentShopIds = shopStock.map((item) => item.id);
        setShopItems(shopStock);
        if (network?.connected()) void network.send({ t: "shop-open", wave: currentWave, reward, coins: guestCoins });
        return;
      }
      if (currentWave % 3 === 0 && lastBossWave !== currentWave) spawnBoss();
      const bossActive = enemies.some((enemy) => enemy.kind === "boss" && enemy.hp > 0);
      const baseEnemyCap = Math.min(coOpActive ? 240 : 200, (coOpActive ? 100 : 82) + Math.floor(elapsed / 35) * 8);
      const enemyCap = bossActive ? Math.max(34, Math.floor(baseEnemyCap * .58)) : baseEnemyCap;
      if (!bossActive && elapsed >= nextSurgeAt) {
        surgeRemaining = Math.min(coOpActive ? 48 : 40, 14 + Math.floor(elapsed / 50) * 4 + (coOpActive ? 6 : 0));
        nextSurgeAt += Math.max(36, 56 - elapsed * .018);
        surgeSpawnClock = 0;
        setBossLootNotice(`⚠ 兽潮来袭 · ${surgeRemaining} 个生命信号高速接近`);
        audio?.play("skill");
      }
      if (surgeRemaining > 0 && !bossActive) {
        surgeSpawnClock -= dt;
        if (surgeSpawnClock <= 0) {
          const surgeBatch = Math.min(surgeRemaining, coOpActive ? 4 : 3);
          for (let index = 0; index < surgeBatch && enemies.length < enemyCap; index++) spawnEnemy();
          surgeRemaining -= surgeBatch;
          surgeSpawnClock = .24;
        }
      }
      spawnClock -= dt;
      if (spawnClock <= 0) {
        spawnClock = (coOpActive
          ? Math.max(.17, .58 - elapsed * .00145)
          : Math.max(.2, .7 - elapsed * .00155)) * (bossActive ? 1.65 : 1);
        const regularBatch = Math.min(coOpActive ? 4 : 3, 1 + Math.floor(elapsed / 110) + (coOpActive && elapsed > 90 ? 1 : 0));
        for (let index = 0; index < regularBatch && enemies.length < enemyCap; index++) spawnEnemy();
      }

      fireClock -= dt;
      if (fireClock <= 0 && enemies.length && player.hp > 0) {
        fireClock = stats.interval;
        const target = enemies.reduce((a,b) => dist(player,a) < dist(player,b) ? a : b);
        const a0 = Math.atan2(target.y-player.y,target.x-player.x);
        if (build.classId === "blade") {
          fireBlade(player, stats, "host");
        } else {
          for(let i=0;i<stats.multi;i++){
            const spread=(i-(stats.multi-1)/2)*.14;
            const angle=a0+spread;
            const damage = Math.random() < stats.critChance ? stats.damage * 2 : stats.damage;
            shots.push({x:player.x,y:player.y,vx:Math.cos(angle)*stats.projectileSpeed,vy:Math.sin(angle)*stats.projectileSpeed,r:stats.projectileSize,damage,life:1.5,owner:"host",classId:build.classId,...projectileTraits(build.classId,stats)});
          }
        }
        for (let i = 0; i < stats.drones; i++) {
          const droneAngle = a0 + (i % 2 ? .22 : -.22);
          const origin = dronePosition(player, i, stats.drones);
          shots.push({x:origin.x+Math.cos(droneAngle)*12,y:origin.y+Math.sin(droneAngle)*12,vx:Math.cos(droneAngle)*stats.projectileSpeed*.92,vy:Math.sin(droneAngle)*stats.projectileSpeed*.92,r:4,damage:stats.damage*.42*stats.dronePower,life:1.6,owner:"host",classId:build.classId,...projectileTraits(build.classId,stats)});
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
        if (remoteStats.classId === "blade") {
          fireBlade(remote, remoteStats, "guest");
        } else {
          for(let i=0;i<remoteStats.multi;i++){
            const spread=(i-(remoteStats.multi-1)/2)*.14;
            const shotAngle=a+spread;
            const damage = Math.random() < remoteStats.critChance ? remoteStats.damage * 2 : remoteStats.damage;
            shots.push({x:remote.x,y:remote.y,vx:Math.cos(shotAngle)*remoteStats.projectileSpeed,vy:Math.sin(shotAngle)*remoteStats.projectileSpeed,r:remoteStats.projectileSize,damage,life:1.5,owner:"guest",classId:remoteStats.classId,...projectileTraits(remoteStats.classId,remoteStats)});
          }
        }
        for (let i = 0; i < remoteStats.drones; i++) {
          const droneAngle = a + (i % 2 ? .22 : -.22);
          const origin = dronePosition(remote, i, remoteStats.drones);
          shots.push({x:origin.x+Math.cos(droneAngle)*12,y:origin.y+Math.sin(droneAngle)*12,vx:Math.cos(droneAngle)*remoteStats.projectileSpeed*.92,vy:Math.sin(droneAngle)*remoteStats.projectileSpeed*.92,r:4,damage:remoteStats.damage*.42*remoteStats.dronePower,life:1.6,owner:"guest",classId:remoteStats.classId,...projectileTraits(remoteStats.classId,remoteStats)});
        }
        audio?.play("ally-shot");
      }

      for (const shot of shots) {
        if (shot.hostile && (shot.enemyKind === "commander" || shot.enemyKind === "leech" || shot.enemyKind === "boss") && (shot.homing || 0) > 0) {
          const targets: Actor[] = [player, ...(remote ? [remote] : [])].filter((actor) => actor.hp > 0);
          if (!targets.length) continue;
          const target = targets.reduce((nearest, actor) => dist(shot, actor) < dist(shot, nearest) ? actor : nearest);
          const speed = Math.hypot(shot.vx, shot.vy);
          const desired = Math.atan2(target.y - shot.y, target.x - shot.x);
          const current = Math.atan2(shot.vy, shot.vx);
          const turn = Math.atan2(Math.sin(desired - current), Math.cos(desired - current)) * .035;
          shot.vx = Math.cos(current + turn) * speed;
          shot.vy = Math.sin(current + turn) * speed;
          shot.homing = Math.max(0, (shot.homing || 0) - dt);
        }
        shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt;
      }
      shots = shots.filter((shot) => shot.life > 0);
      const now = performance.now();
      const livingActors: Actor[] = [player, ...(remote ? [remote] : [])].filter((actor) => actor.hp > 0);
      for (const enemy of enemies) {
        if (!livingActors.length) continue;
        if ((enemy.burn || 0) > 0) {
          enemy.burn = Math.max(0, (enemy.burn || 0) - dt);
          applyEnemyDamage(enemy, (enemy.burnDamage || 0) * dt, enemy.burnOwner || enemy.lastHitBy);
        }
        const target = livingActors.reduce((nearest, actor) => dist(enemy, actor) < dist(enemy, nearest) ? actor : nearest);
        const targetDistance = dist(enemy, target);
        const angle = Math.atan2(target.y-enemy.y,target.x-enemy.x);
        enemy.cooldown -= dt;
        const canAct = (enemy.frozen || 0) <= 0 && (enemy.stunned || 0) <= 0;
        const ranged = ENEMY_ATTACK_MODE[enemy.kind] === "ranged";
        if (enemy.kind === "boss") {
          const hpRatio = enemy.hp / Math.max(1, enemy.maxHp);
          const phase = hpRatio > .66 ? 1 : hpRatio > .33 ? 2 : 3;
          if (phase !== enemy.bossPhase) {
            enemy.bossPhase = phase;
            burst(enemy.x, enemy.y, phase === 2 ? "#f4c95d" : "#ff5b7d", 36);
            addEffect({ kind: "boss-phase", bossVariant: enemy.bossVariant || "rift", x: enemy.x, y: enemy.y, color: phase === 2 ? "#f4c95d" : "#ff5b7d", radius: 250 }, .95);
          }
        }
        const preferredRange =
          enemy.kind === "artillery" ? 330
            : enemy.kind === "assassin" ? 230
              : enemy.kind === "commander" ? 280
                : enemy.kind === "sniper" ? 465
                  : enemy.kind === "mortarwasp" ? 360
                    : enemy.kind === "leech" ? 245
                      : enemy.kind === "boss" ? BOSS_VARIANTS[enemy.bossVariant || "rift"].range
                        : 0;
        const speedScale = !canAct ? 0 : enemy.slow > 0 ? .52 : 1;
        const moveDirection = !ranged
          ? 1
          : targetDistance > preferredRange + 24
            ? 1
            : targetDistance < preferredRange * .62
              ? -.72
              : 0;
        if (moveDirection) {
          enemy.x += Math.cos(angle) * enemy.speed * speedScale * moveDirection * dt;
          enemy.y += Math.sin(angle) * enemy.speed * speedScale * moveDirection * dt;
        }
        const applyMeleeStrike = (rawDamage: number, color: string, radius: number) => {
          const targetShield = target === player ? selfShieldUntil : remoteShieldUntil;
          const reduction = target === player ? stats.damageReduction : (remoteBuildRef.current?.damageReduction || 0);
          if (now >= targetShield) target.hp = Math.max(0, target.hp - rawDamage * (1 - reduction));
          impactEffect(target.x, target.y, color, radius);
          burst(target.x, target.y, color, Math.ceil(radius / 4));
          if (target === player) {
            setHp(Math.ceil(player.hp));
            audio?.play("hurt");
          }
        };
        if (canAct && enemy.kind === "rammer" && enemy.cooldown <= 0 && targetDistance < 430 && targetDistance > 90) {
          const chargeStart = { x: enemy.x, y: enemy.y };
          enemy.x += Math.cos(angle) * 145;
          enemy.y += Math.sin(angle) * 145;
          enemy.cooldown = ENEMY_DATA.rammer.cooldown;
          addEffect({ kind: "dash", enemyKind: "rammer", x: chargeStart.x, y: chargeStart.y, x2: enemy.x, y2: enemy.y, color: "#66b8ff", radius: 44 }, .42);
          burst(enemy.x, enemy.y, "#66b8ff", 12);
          if (dist(enemy, target) < enemy.r + target.r + 46) applyMeleeStrike(enemy.hit * .72, "#66b8ff", 46);
        }
        enemy.frozen = Math.max(0, (enemy.frozen || 0) - dt);
        enemy.stunned = Math.max(0, (enemy.stunned || 0) - dt);
        enemy.slow = Math.max(0, enemy.slow - dt);
        if (canAct && (enemy.kind === "shieldmite" || enemy.kind === "splitter") && enemy.cooldown <= 0 && targetDistance < enemy.r + target.r + 78) {
          const reach = enemy.kind === "shieldmite" ? 112 : 132;
          addEffect({
            kind: "slash",
            enemyKind: enemy.kind,
            x: enemy.x,
            y: enemy.y,
            x2: enemy.x + Math.cos(angle) * reach,
            y2: enemy.y + Math.sin(angle) * reach,
            color: enemy.kind === "shieldmite" ? "#70fff1" : "#c8ef45",
            radius: enemy.kind === "shieldmite" ? 34 : 27,
          }, .32);
          applyMeleeStrike(
            enemy.hit * .72,
            enemy.kind === "shieldmite" ? "#70fff1" : "#c8ef45",
            enemy.kind === "shieldmite" ? 34 : 29,
          );
          enemy.cooldown = ENEMY_DATA[enemy.kind].cooldown;
        }
        if (canAct && enemy.kind === "boss" && enemy.cooldown <= 0) {
          const phase = enemy.bossPhase || 1;
          const variant = enemy.bossVariant || "rift";
          if (variant === "rift") {
            const count = phase === 1 ? 10 : phase === 2 ? 14 : 18;
            const offset = elapsed * (.42 + phase * .16);
            for (let index = 0; index < count; index++) {
              const shotAngle = offset + index / count * Math.PI * 2;
              shots.push({ x: enemy.x + Math.cos(shotAngle) * (enemy.r + 8), y: enemy.y + Math.sin(shotAngle) * (enemy.r + 8), vx: Math.cos(shotAngle) * (205 + phase * 32), vy: Math.sin(shotAngle) * (205 + phase * 32), r: 8 + phase, damage: enemy.hit * (phase === 3 ? .58 : .48), life: 3.4, hostile: true, enemyKind: "boss", bossVariant: variant });
            }
            for (let index = 0; index < phase; index++) {
              const shotAngle = angle + (index - (phase - 1) / 2) * .13;
              shots.push({ x: enemy.x, y: enemy.y, vx: Math.cos(shotAngle) * (290 + phase * 24), vy: Math.sin(shotAngle) * (290 + phase * 24), r: 9, damage: enemy.hit * .72, life: 2.7, hostile: true, enemyKind: "boss", bossVariant: variant, homing: phase === 3 ? .5 : .22 });
            }
            enemy.cooldown = phase === 1 ? 2.25 : phase === 2 ? 1.72 : 1.28;
          } else if (variant === "storm") {
            const count = 3 + phase * 2;
            for (let index = 0; index < count; index++) {
              const shotAngle = angle + (index - (count - 1) / 2) * .105;
              shots.push({ x: enemy.x, y: enemy.y, vx: Math.cos(shotAngle) * (390 + phase * 35), vy: Math.sin(shotAngle) * (390 + phase * 35), r: 7, damage: enemy.hit * .58, life: 2.2, hostile: true, enemyKind: "boss", bossVariant: variant, homing: .16 });
            }
            beams.push({ x1: enemy.x - Math.sin(angle) * 120, y1: enemy.y + Math.cos(angle) * 120, x2: enemy.x + Math.sin(angle) * 120, y2: enemy.y - Math.cos(angle) * 120, life: .34, width: 9, color: "#61d7ff" });
            enemy.cooldown = phase === 1 ? 1.9 : phase === 2 ? 1.44 : 1.08;
          } else if (variant === "weaver") {
            const count = 7 + phase * 3;
            const offset = elapsed * .85;
            for (let index = 0; index < count; index++) {
              const shotAngle = offset + index / count * Math.PI * 2;
              shots.push({ x: enemy.x, y: enemy.y, vx: Math.cos(shotAngle) * (165 + phase * 20), vy: Math.sin(shotAngle) * (165 + phase * 20), r: 9, damage: enemy.hit * .5, life: 4, hostile: true, enemyKind: "boss", bossVariant: variant, homing: .7 + phase * .16 });
            }
            enemy.cooldown = phase === 1 ? 2.4 : phase === 2 ? 1.84 : 1.38;
          } else if (variant === "forge") {
            const count = 1 + phase;
            for (let index = 0; index < count; index++) {
              const shotAngle = angle + (index - (count - 1) / 2) * .24;
              shots.push({ x: enemy.x, y: enemy.y, vx: Math.cos(shotAngle) * (225 + phase * 18), vy: Math.sin(shotAngle) * (225 + phase * 18), r: 13, damage: enemy.hit * .84, life: 3.2, hostile: true, enemyKind: "boss", bossVariant: variant, splash: 100 + phase * 12 });
            }
            if (phase === 3) {
              for (let index = 0; index < 6; index++) {
                const shotAngle = index / 6 * Math.PI * 2;
                shots.push({ x: enemy.x, y: enemy.y, vx: Math.cos(shotAngle) * 190, vy: Math.sin(shotAngle) * 190, r: 10, damage: enemy.hit * .46, life: 2.8, hostile: true, enemyKind: "boss", bossVariant: variant, splash: 72 });
              }
            }
            enemy.cooldown = phase === 1 ? 2.8 : phase === 2 ? 2.15 : 1.65;
          } else if (variant === "leviathan") {
            const chargeStart = { x: enemy.x, y: enemy.y };
            const chargeDistance = 95 + phase * 32;
            enemy.x = clamp(enemy.x + Math.cos(angle) * chargeDistance, -70, W + 70);
            enemy.y = clamp(enemy.y + Math.sin(angle) * chargeDistance, -70, H + 70);
            addEffect({ kind: "dash", bossVariant: variant, x: chargeStart.x, y: chargeStart.y, x2: enemy.x, y2: enemy.y, color: BOSS_VARIANTS[variant].color, radius: 72 }, .55);
            if (dist(enemy, target) < enemy.r + target.r + 52) applyMeleeStrike(enemy.hit * .68, "#4d98ff", 58);
            const torpedoes = 2 + phase;
            for (let index = 0; index < torpedoes; index++) {
              const shotAngle = angle + (index - (torpedoes - 1) / 2) * .22;
              shots.push({ x: enemy.x, y: enemy.y, vx: Math.cos(shotAngle) * (275 + phase * 18), vy: Math.sin(shotAngle) * (275 + phase * 18), r: 10, damage: enemy.hit * .54, life: 3, hostile: true, enemyKind: "boss", bossVariant: variant, homing: .34 + phase * .08 });
            }
            enemy.cooldown = phase === 1 ? 2.75 : phase === 2 ? 2.18 : 1.72;
          } else if (variant === "mirror") {
            const pairs = 2 + phase;
            for (let pair = 0; pair < pairs; pair++) {
              const offset = .16 + pair * .15;
              for (const direction of [-1, 1]) {
                const shotAngle = angle + offset * direction;
                shots.push({ x: enemy.x, y: enemy.y, vx: Math.cos(shotAngle) * (325 + phase * 24), vy: Math.sin(shotAngle) * (325 + phase * 24), r: 8, damage: enemy.hit * .48, life: 2.7, hostile: true, enemyKind: "boss", bossVariant: variant });
              }
            }
            if (phase >= 2) {
              const reflectedAngle = angle + Math.PI;
              shots.push({ x: enemy.x, y: enemy.y, vx: Math.cos(reflectedAngle) * 360, vy: Math.sin(reflectedAngle) * 360, r: 9, damage: enemy.hit * .56, life: 2.5, hostile: true, enemyKind: "boss", bossVariant: variant });
            }
            beams.push({ x1: enemy.x - Math.sin(angle) * 150, y1: enemy.y + Math.cos(angle) * 150, x2: enemy.x + Math.sin(angle) * 150, y2: enemy.y - Math.cos(angle) * 150, life: .4, width: 5, color: "#ff68d7" });
            enemy.cooldown = phase === 1 ? 2.15 : phase === 2 ? 1.62 : 1.25;
          } else {
            const rings = phase === 1 ? 1 : phase === 2 ? 2 : 3;
            for (let ring = 0; ring < rings; ring++) {
              const count = 6 + ring * 4 + phase * 2;
              const offset = elapsed * .28 + ring * .3;
              for (let index = 0; index < count; index++) {
                const shotAngle = offset + index / count * Math.PI * 2;
                const speed = 118 + ring * 48 + phase * 14;
                shots.push({ x: enemy.x, y: enemy.y, vx: Math.cos(shotAngle) * speed, vy: Math.sin(shotAngle) * speed, r: 11, damage: enemy.hit * .43, life: 5.2 - ring * .45, hostile: true, enemyKind: "boss", bossVariant: variant, homing: ring === 0 ? .28 : undefined });
              }
            }
            addEffect({ kind: "boss-phase", bossVariant: variant, x: enemy.x, y: enemy.y, color: "#66eadf", radius: 210 }, .72);
            enemy.cooldown = phase === 1 ? 3.15 : phase === 2 ? 2.48 : 1.92;
          }
          burst(enemy.x, enemy.y, BOSS_VARIANTS[variant].color, 16);
        } else if (canAct && ranged && enemy.cooldown <= 0) {
          const spreadCount = enemy.kind === "commander" ? 3 : enemy.kind === "assassin" || enemy.kind === "leech" ? 2 : 1;
          for (let index = 0; index < spreadCount; index++) {
            const spread = (index - (spreadCount - 1) / 2) * (enemy.kind === "assassin" ? .075 : .18);
            const shotAngle = angle + spread;
            const projectileSpeed =
              enemy.kind === "sniper" ? 680
                : enemy.kind === "assassin" ? 490
                  : enemy.kind === "commander" ? 290
                    : enemy.kind === "mortarwasp" ? 235
                      : enemy.kind === "leech" ? 250
                        : 280;
            const lateRangedDamage = 1 + Math.min(.55, elapsed / 900);
            const damageScale = enemy.kind === "assassin" ? .58 : enemy.kind === "leech" ? .68 : enemy.kind === "mortarwasp" ? .82 : 1;
            shots.push({
              x: enemy.x + Math.cos(angle) * (enemy.r + 8),
              y: enemy.y + Math.sin(angle) * (enemy.r + 8),
              vx: Math.cos(shotAngle) * projectileSpeed,
              vy: Math.sin(shotAngle) * projectileSpeed,
              r: enemy.kind === "commander" ? 7 : enemy.kind === "assassin" || enemy.kind === "sniper" ? 4 : enemy.kind === "mortarwasp" ? 9 : 6,
              damage: enemy.hit * damageScale * lateRangedDamage,
              life: enemy.kind === "assassin" ? 1.7 : enemy.kind === "sniper" ? 1.45 : enemy.kind === "mortarwasp" ? 3.1 : 2.4,
              hostile: true,
              enemyKind: enemy.kind,
              homing: enemy.kind === "commander" ? .75 : enemy.kind === "leech" ? .66 : undefined,
              splash: enemy.kind === "artillery" ? 68 : enemy.kind === "mortarwasp" ? 92 : undefined,
            });
          }
          if (enemy.kind === "leech") enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * .025);
          burst(
            enemy.x + Math.cos(angle) * (enemy.r + 5),
            enemy.y + Math.sin(angle) * (enemy.r + 5),
            enemy.kind === "artillery" || enemy.kind === "mortarwasp" ? "#ff9a4d" : enemy.kind === "assassin" || enemy.kind === "leech" ? "#a36cff" : enemy.kind === "sniper" ? "#ff625e" : "#e2b8ff",
            enemy.kind === "commander" ? 7 : 4,
          );
          enemy.cooldown = ENEMY_DATA[enemy.kind].cooldown * (enemy.elite ? .78 : 1);
        }
        if (canAct && targetDistance < enemy.r + target.r) {
          const targetShield = target === player ? selfShieldUntil : remoteShieldUntil;
          const reduction = target === player ? stats.damageReduction : (remoteBuildRef.current?.damageReduction || 0);
          if (now >= targetShield) target.hp = Math.max(0, target.hp - enemy.hit * (1 - reduction) * dt);
          if (target === player) {
            setHp(Math.ceil(player.hp));
            audio?.play("hurt");
          }
        }
      }
      const gridSize = 112;
      const enemyGrid = new Map<string, Enemy[]>();
      for (const enemy of enemies) {
        const key = `${Math.floor(enemy.x / gridSize)},${Math.floor(enemy.y / gridSize)}`;
        const bucket = enemyGrid.get(key);
        if (bucket) bucket.push(enemy);
        else enemyGrid.set(key, [enemy]);
      }
      const nearbyEnemies = (x: number, y: number, radius: number) => {
        const result: Enemy[] = [];
        const minX = Math.floor((x - radius) / gridSize), maxX = Math.floor((x + radius) / gridSize);
        const minY = Math.floor((y - radius) / gridSize), maxY = Math.floor((y + radius) / gridSize);
        for (let gridX = minX; gridX <= maxX; gridX++) {
          for (let gridY = minY; gridY <= maxY; gridY++) {
            const bucket = enemyGrid.get(`${gridX},${gridY}`);
            if (bucket) result.push(...bucket);
          }
        }
        return result;
      };
      for (const shot of shots) {
        if (shot.hostile) {
          const possibleTargets: Actor[] = [player, ...(remote ? [remote] : [])].filter((actor) => actor.hp > 0);
          for (const target of possibleTargets) {
            if (shot.life <= 0 || dist(shot, target) >= shot.r + target.r) continue;
            const targetShield = target === player ? selfShieldUntil : remoteShieldUntil;
            const reduction = target === player ? stats.damageReduction : (remoteBuildRef.current?.damageReduction || 0);
            const hostileImpactColor =
              shot.enemyKind === "boss" ? BOSS_VARIANTS[shot.bossVariant || "rift"].color
                : shot.enemyKind === "shieldmite" ? "#70fff1"
                  : shot.enemyKind === "sniper" ? "#ff625e"
                    : shot.enemyKind === "splitter" ? "#c8ef45"
                      : shot.enemyKind === "mortarwasp" ? "#ff9a4d"
                        : shot.enemyKind === "leech" ? "#b06cff"
                          : shot.enemyKind === "rammer" ? "#66b8ff"
                            : shot.enemyKind === "assassin" ? "#a36cff"
                              : shot.enemyKind === "commander" ? "#d99aff"
                                : "#ff9a4d";
            if (now >= targetShield) target.hp = Math.max(0, target.hp - shot.damage * (1 - reduction));
            if (shot.splash) {
              burst(target.x, target.y, hostileImpactColor, 14);
              for (const nearby of possibleTargets) {
                if (nearby === target || dist(target, nearby) > shot.splash) continue;
                const nearbyShield = nearby === player ? selfShieldUntil : remoteShieldUntil;
                const nearbyReduction = nearby === player ? stats.damageReduction : (remoteBuildRef.current?.damageReduction || 0);
                if (now >= nearbyShield) nearby.hp = Math.max(0, nearby.hp - shot.damage * .55 * (1 - nearbyReduction));
                if (nearby === player) setHp(Math.ceil(player.hp));
              }
            } else {
              burst(
                target.x,
                target.y,
                hostileImpactColor,
                shot.enemyKind === "boss" ? 14
                  : shot.enemyKind === "commander" || shot.enemyKind === "rammer" ? 10
                    : 7,
              );
            }
            impactEffect(
              target.x,
              target.y,
              hostileImpactColor,
              shot.splash ? 58 : shot.enemyKind === "boss" ? 42 : 28,
            );
            if (target === player) {
              setHp(Math.ceil(player.hp));
              audio?.play("hurt");
            }
            shot.life = 0;
            break;
          }
          continue;
        }
        for (const enemy of nearbyEnemies(shot.x, shot.y, shot.r + 46)) {
          if (shot.life <= 0 || enemy.hp <= 0 || shot.hitIds?.includes(enemy.id) || dist(shot,enemy) >= shot.r + enemy.r) continue;
          let resolvedDamage = shot.damage;
          if (enemy.kind === "shieldmite" && (enemy.barrier || 0) > 0) {
            const absorbed = Math.min(enemy.barrier || 0, shot.damage * .78);
            enemy.barrier = Math.max(0, (enemy.barrier || 0) - shot.damage);
            resolvedDamage -= absorbed;
            burst(enemy.x, enemy.y, "#70fff1", 6);
          }
          applyEnemyDamage(enemy, resolvedDamage, shot.owner || "host");
          shot.hitIds = [...(shot.hitIds || []), enemy.id];
          if (shot.slow) enemy.slow = Math.max(enemy.slow, shot.slow);
          if (shot.freeze) enemy.frozen = Math.max(enemy.frozen || 0, shot.freeze);
          if (shot.burn) {
            const burnStats = shot.owner === "guest" ? remoteBuildRef.current : stats;
            const burnPower = burnStats?.burnPower || 1;
            enemy.burn = Math.max(enemy.burn || 0, shot.burn * burnPower);
            enemy.burnDamage = Math.max(enemy.burnDamage || 0, (shot.burnDamage || shot.damage * .16) * burnPower);
            enemy.burnOwner = shot.owner || "host";
          }
          if (shot.splash) {
            for (const nearby of nearbyEnemies(enemy.x, enemy.y, shot.splash)) {
              if (nearby === enemy || nearby.hp <= 0 || dist(enemy, nearby) > shot.splash) continue;
              applyEnemyDamage(nearby, shot.damage * .38, shot.owner || "host");
            }
            burst(enemy.x, enemy.y, "#f4c95d", 12);
          }
          const impactColor = shot.slow ? "#8bdcff" : (CLASSES.find((item) => item.id === shot.classId)?.color || "#fff2ba");
          impactEffect(shot.x, shot.y, impactColor, shot.splash ? 54 : Math.min(38, 18 + shot.damage * .16));
          if (shot.chain) {
            const next = nearbyEnemies(enemy.x, enemy.y, 145)
              .filter((candidate) => candidate !== enemy && candidate.hp > 0 && !shot.hitIds?.includes(candidate.id) && dist(enemy, candidate) < 145)
              .sort((a, b) => dist(enemy, a) - dist(enemy, b))[0];
            if (next) {
              applyEnemyDamage(next, shot.damage * .48, shot.owner || "host");
              const chainColor = shot.classId === "thunder" ? "#48dfff" : "#a9ef84";
              beams.push({ x1: enemy.x, y1: enemy.y, x2: next.x, y2: next.y, life: .16, width: 4, color: chainColor });
              burst(next.x, next.y, chainColor, 5);
            }
            shot.chain = false;
          }
          if ((shot.pierce || 0) > 0) shot.pierce = (shot.pierce || 0) - 1;
          else shot.life = 0;
          audio?.play("hit");
          burst(shot.x,shot.y,shot.slow?"#a8e9ff":"#fff2ba",4);
        }
      }
      for (const enemy of enemies) {
        if (enemy.hp <= 0) {
          if (enemy.kind === "splitter") {
            for (const offset of [-1, 1]) {
              const childConfig = ENEMY_DATA.runner;
              const childHp = childConfig.hp * (1 + elapsed / 260);
              enemies.push({
                id: nextEnemyId++,
                x: enemy.x + offset * 18,
                y: enemy.y + (Math.random() - .5) * 20,
                r: childConfig.radius * .82,
                hp: childHp,
                maxHp: childHp,
                speed: childConfig.speed * 1.18,
                hit: childConfig.hit,
                color: "#b8ee4f",
                kind: "runner",
                elite: false,
                cooldown: 0,
                slow: 0,
              });
            }
          }
          const bossRelic = enemy.kind === "boss" ? shuffled(BOSS_RELICS)[0] : null;
          const value = enemy.kind === "boss"
            ? ENEMY_XP.boss + currentWave * 6
            : Math.round(ENEMY_XP[enemy.kind] * (enemy.elite ? 1.75 : 1));
          gems.push({ x: enemy.x, y: enemy.y, value, life: bossRelic ? 35 : 18, relic: bossRelic?.id });
          if (enemy.elite || HEALTH_PACK_ENEMY_KINDS.includes(enemy.kind)) {
            const heal = enemy.kind === "boss"
              ? .28
              : enemy.kind === "commander" || enemy.kind === "rammer"
                ? .16
                : enemy.elite
                  ? .14
                  : .1;
            gems.push({ x: enemy.x + 18, y: enemy.y - 12, value: 0, life: 14, heal });
          }
          audio?.play("kill");
          burst(enemy.x,enemy.y,enemy.color,enemy.kind === "boss" ? 46 : 10);
          impactEffect(enemy.x, enemy.y, enemy.kind === "boss" ? "#ff5b7d" : enemy.elite ? "#f4c95d" : enemy.color, enemy.kind === "boss" ? 180 : enemy.elite ? 72 : 42);
          if (bossRelic) setBossLootNotice(`Boss 已击破 · ${bossRelic.icon} ${bossRelic.title}等待拾取`);
          currentKills++;
          waveKills++;
          const killer = enemy.lastHitBy || "host";
          const baseEnergyGain = enemy.kind === "boss" ? 30 : enemy.kind === "commander" ? 16 : enemy.elite ? 10 : 6;
          const chargingClass = killer === "guest"
            ? remoteBuildRef.current?.classId || "assault"
            : build.classId;
          const energyGain = baseEnergyGain * ULTIMATE_CHARGE_SCALE[chargingClass];
          if (killer === "guest") {
            guestUltimate = clamp(guestUltimate + energyGain, 0, ULTIMATE_MAX);
          } else {
            hostUltimate = clamp(hostUltimate + energyGain, 0, ULTIMATE_MAX);
            setUltimateEnergy(hostUltimate);
          }
          setKills(currentKills);
        }
      }
      enemies = enemies.filter((enemy) => enemy.hp > 0);
      for (const gem of gems) {
        gem.life -= dt;
        if (gem.life <= 0) continue;
        const collectors = [
          ...(player.hp > 0 ? [{ actor: player, magnet: stats.magnet }] : []),
          ...(remote && remote.hp > 0 ? [{ actor: remote, magnet: remoteBuildRef.current?.magnet || 84 }] : []),
        ].filter((entry) => !gem.heal || entry.actor.hp < entry.actor.maxHp);
        const attractor = collectors
          .map((entry) => ({ ...entry, distance: dist(gem, entry.actor) }))
          .filter((entry) => entry.distance < entry.magnet)
          .sort((a, b) => a.distance / a.magnet - b.distance / b.magnet)[0];
        if (attractor) {
          const angle = Math.atan2(attractor.actor.y-gem.y,attractor.actor.x-gem.x);
          gem.x += Math.cos(angle) * 340 * dt;
          gem.y += Math.sin(angle) * 340 * dt;
        }
        const collector = collectors
          .map((entry) => ({ ...entry, distance: dist(gem, entry.actor) }))
          .filter((entry) => entry.distance < entry.actor.r + 8)
          .sort((a, b) => a.distance - b.distance)[0];
        if (collector) {
          if (gem.heal) {
            const before = collector.actor.hp;
            collector.actor.hp = Math.min(
              collector.actor.maxHp,
              collector.actor.hp + Math.max(1, Math.round(collector.actor.maxHp * gem.heal)),
            );
            const restored = Math.max(0, Math.ceil(collector.actor.hp - before));
            if (collector.actor === player) setHp(Math.ceil(player.hp));
            else setTeammateHp(Math.ceil(collector.actor.hp));
            addEffect({ kind: "revive", x: gem.x, y: gem.y, color: "#76f0ae", radius: 92 }, .68);
            burst(gem.x, gem.y, "#76f0ae", 14);
            setBossLootNotice(`✚ 战地维修包 · 回复 ${restored} 点机体完整度`);
            gem.heal = undefined;
            gem.value = 0;
            audio?.play("upgrade");
            continue;
          }
          const earnedXp = gem.value * xpGainScale() * earlyWaveXpMultiplier(currentWave);
          if (gem.relic) {
            const relic = BOSS_RELICS.find((entry) => entry.id === gem.relic);
            const previousMaxHp = build.maxHp;
            build = applyBossRelicToBuild({ ...build, ...stats, maxHp: player.maxHp }, gem.relic);
            stats = { ...build };
            ownBuildRef.current = { ...build };
            player.maxHp = build.maxHp;
            if (build.maxHp > previousMaxHp && player.hp > 0) player.hp += build.maxHp - previousMaxHp;
            if (remote) {
              const remoteBuild = remoteBuildRef.current || makeBuild(remote.classId || "assault");
              const remotePreviousMax = remoteBuild.maxHp;
              const nextRemoteBuild = applyBossRelicToBuild(remoteBuild, gem.relic);
              remoteBuildRef.current = nextRemoteBuild;
              remote.maxHp = nextRemoteBuild.maxHp;
              if (nextRemoteBuild.maxHp > remotePreviousMax && remote.hp > 0) remote.hp += nextRemoteBuild.maxHp - remotePreviousMax;
            }
            setMaxHp(player.maxHp);
            setHp(Math.ceil(player.hp));
            setBossLootNotice(relic ? `${relic.icon} ${relic.title} · ${relic.desc}` : "获得 Boss 核心");
            if (network?.connected()) void network.send({ t: "boss-loot", relic: gem.relic });
            audio?.play("ultimate");
          }
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
      gems = gems.filter((gem) => gem.life > 0 && (gem.value > 0 || Boolean(gem.heal)));

      worldClock -= dt;
      if (worldClock <= 0) {
        worldClock = .06;
        sendWorld();
      }
      const guestHp = remote?.hp ?? null;
      const teamDefeated = teamRunDefeated(player.hp, guestHp, coOpRunEstablished);
      if (teamDefeated && !gameOverSent) {
        gameOverSent = true;
        sendWorld();
        if (network?.connected()) {
          void network.send({ t: "gameover", hostHp: player.hp, guestHp });
        }
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
      for(const g of gems){
        const dropAlpha=g.life<3?.38+Math.abs(Math.sin(performance.now()/120))*.62:1;
        if(g.heal){
          const pulse=1+Math.sin(performance.now()/170)*.08;
          ctx.save();ctx.globalAlpha=dropAlpha;ctx.translate(g.x,g.y);ctx.scale(pulse,pulse);
          ctx.fillStyle="#b83d39";ctx.shadowColor="#76f0ae";ctx.shadowBlur=18;ctx.fillRect(-14,-14,28,28);
          ctx.strokeStyle="#f0c1b9";ctx.lineWidth=2;ctx.strokeRect(-14,-14,28,28);
          ctx.fillStyle="#f5eee7";ctx.fillRect(-4,-10,8,20);ctx.fillRect(-10,-4,20,8);
          ctx.restore();
          ctx.save();ctx.globalAlpha=dropAlpha;ctx.fillStyle="#bdf7d5";ctx.font="900 10px monospace";ctx.textAlign="center";ctx.fillText(`维修包 ${Math.ceil(g.life)}s`,g.x,g.y-22);ctx.restore();
          continue;
        }
        const gemSize=g.relic?15:6+Math.min(7,Math.sqrt(g.value)*1.5);
        ctx.save();ctx.globalAlpha=dropAlpha;ctx.translate(g.x,g.y);ctx.rotate(performance.now()/600);
        ctx.fillStyle=g.relic?"#ffda6a":g.value>=10?"#f4c95d":g.value>=5?"#c7e08f":"#9ed9cc";
        ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=g.value>=5?12:5;
        ctx.fillRect(-gemSize,-gemSize,gemSize*2,gemSize*2);ctx.restore();
        if(g.relic){ctx.fillStyle="#fff4bd";ctx.font="900 13px monospace";ctx.textAlign="center";ctx.fillText("BOSS CORE",g.x,g.y-24);}
      }
      for(const p of particles){ctx.globalAlpha=Math.max(0,p.life*2);ctx.fillStyle=p.color;ctx.fillRect(p.x-2,p.y-2,4,4);} ctx.globalAlpha=1;
      for(const beam of beams){
        ctx.save();ctx.globalAlpha=clamp(beam.life*4,0,1);ctx.lineCap="round";
        ctx.strokeStyle=beam.color;ctx.shadowColor=beam.color;ctx.shadowBlur=18;ctx.lineWidth=beam.width;
        ctx.beginPath();ctx.moveTo(beam.x1,beam.y1);ctx.lineTo(beam.x2,beam.y2);ctx.stroke();
        ctx.strokeStyle="rgba(255,255,255,.9)";ctx.shadowBlur=4;ctx.lineWidth=Math.max(2,beam.width*.24);
        ctx.beginPath();ctx.moveTo(beam.x1,beam.y1);ctx.lineTo(beam.x2,beam.y2);ctx.stroke();ctx.restore();
      }
      for(const effect of effects){
        const progress=clamp(1-effect.life/effect.duration,0,1);
        const alpha=clamp(effect.life/effect.duration,0,1);
        ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=effect.color;ctx.fillStyle=effect.color;ctx.shadowColor=effect.color;ctx.shadowBlur=16;ctx.lineCap="round";
        if(effect.kind==="impact"){
          const radius=6+effect.radius*progress;
          ctx.lineWidth=Math.max(2,7*(1-progress));
          ctx.beginPath();ctx.arc(effect.x,effect.y,radius,0,Math.PI*2);ctx.stroke();
          ctx.globalAlpha=alpha*.7;ctx.beginPath();ctx.arc(effect.x,effect.y,Math.max(2,radius*.2),0,Math.PI*2);ctx.fill();
        }
        if(effect.kind==="dash"){
          ctx.lineWidth=18*(1-progress)+3;
          ctx.beginPath();ctx.moveTo(effect.x,effect.y);ctx.lineTo(effect.x2??effect.x,effect.y2??effect.y);ctx.stroke();
          ctx.globalAlpha=alpha*.85;ctx.strokeStyle="#ffffff";ctx.lineWidth=3;
          ctx.beginPath();ctx.moveTo(effect.x,effect.y);ctx.lineTo(effect.x2??effect.x,effect.y2??effect.y);ctx.stroke();
          if(effect.enemyKind==="rammer"&&enemyReinforcementProjectiles.complete&&enemyReinforcementProjectiles.naturalWidth){
            const endX=effect.x2??effect.x,endY=effect.y2??effect.y,angle=Math.atan2(endY-effect.y,endX-effect.x);
            const cellW=enemyReinforcementProjectiles.naturalWidth/3,cellH=enemyReinforcementProjectiles.naturalHeight/2;
            ctx.save();ctx.translate((effect.x+endX)/2,(effect.y+endY)/2);ctx.rotate(angle);ctx.globalAlpha=alpha*.9;
            ctx.drawImage(enemyReinforcementProjectiles,2*cellW,cellH,cellW,cellH,-92,-34,184,68);ctx.restore();
          }
        }
        if(effect.kind==="revive"){
          const radius=24+effect.radius*progress;
          ctx.lineWidth=7*(1-progress)+2;
          ctx.beginPath();ctx.arc(effect.x,effect.y,radius,0,Math.PI*2);ctx.stroke();
          for(let index=0;index<6;index++){
            const angle=index/6*Math.PI*2+progress;
            ctx.beginPath();ctx.moveTo(effect.x+Math.cos(angle)*18,effect.y+Math.sin(angle)*18);ctx.lineTo(effect.x+Math.cos(angle)*radius,effect.y+Math.sin(angle)*radius);ctx.stroke();
          }
        }
        if(effect.kind==="ultimate"){
          const radius=36+effect.radius*Math.sin(progress*Math.PI/2);
          if(effect.classId==="assault"){
            ctx.lineWidth=3;ctx.setLineDash([10,7]);ctx.beginPath();ctx.arc(effect.x,effect.y,radius*.72,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
            ctx.beginPath();ctx.moveTo(effect.x-radius,effect.y);ctx.lineTo(effect.x+radius,effect.y);ctx.moveTo(effect.x,effect.y-radius);ctx.lineTo(effect.x,effect.y+radius);ctx.stroke();
            const missileY=(effect.y2??effect.y-220)+(effect.y-(effect.y2??effect.y-220))*progress;
            ctx.fillStyle="#fff2a8";ctx.beginPath();ctx.moveTo(effect.x,missileY+22);ctx.lineTo(effect.x-9,missileY-12);ctx.lineTo(effect.x+9,missileY-12);ctx.closePath();ctx.fill();
          }else if(effect.classId==="guardian"){
            ctx.translate(effect.x,effect.y);ctx.rotate(progress*.45);
            ctx.fillStyle="rgba(95,224,214,.12)";ctx.lineWidth=6;
            ctx.beginPath();
            for(let index=0;index<6;index++){const angle=index/6*Math.PI*2;const px=Math.cos(angle)*radius,py=Math.sin(angle)*radius;if(index)ctx.lineTo(px,py);else ctx.moveTo(px,py);}
            ctx.closePath();ctx.fill();ctx.stroke();
            for(let index=0;index<6;index++){const angle=index/6*Math.PI*2;ctx.save();ctx.rotate(angle);ctx.strokeRect(radius*.56,-28,radius*.34,56);ctx.restore();}
          }else if(effect.classId==="engineer"){
            ctx.translate(effect.x,effect.y);
            for(let index=0;index<10;index++){
              const angle=index/10*Math.PI*2+progress*5;
              const orbit=radius*(.48+.08*(index%2));
              const x=Math.cos(angle)*orbit,y=Math.sin(angle)*orbit;
              ctx.save();ctx.translate(x,y);ctx.rotate(angle+Math.PI/2);ctx.fillStyle=index%2?"#d9ffb8":"#92ff78";ctx.fillRect(-8,-5,16,10);ctx.fillRect(-14,-2,28,4);ctx.restore();
              ctx.globalAlpha=alpha*.42;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(x,y);ctx.stroke();ctx.globalAlpha=alpha;
            }
            ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,radius*.62,0,Math.PI*2);ctx.stroke();
          }else if(effect.classId==="phantom"){
            const endX=effect.x2??effect.x,endY=effect.y2??effect.y;
            ctx.lineWidth=7;ctx.setLineDash([24,14]);ctx.beginPath();ctx.moveTo(effect.x,effect.y);ctx.lineTo(endX,endY);ctx.stroke();ctx.setLineDash([]);
            for(let index=0;index<7;index++){
              const t=(index+progress)/7,x=effect.x+(endX-effect.x)*t,y=effect.y+(endY-effect.y)*t;
              ctx.save();ctx.translate(x,y);ctx.rotate(progress*Math.PI*2+index);ctx.strokeRect(-11,-11,22,22);ctx.restore();
            }
          }else if(effect.classId==="laser"){
            const endX=effect.x2??effect.x,endY=effect.y2??effect.y;
            const angle=Math.atan2(endY-effect.y,endX-effect.x),length=Math.hypot(endX-effect.x,endY-effect.y);
            ctx.lineWidth=5;
            const beamCount=clamp(effect.count??8,8,16);
            for(let index=0;index<beamCount;index++){const beamAngle=angle+index/beamCount*Math.PI*2;ctx.beginPath();ctx.moveTo(effect.x,effect.y);ctx.lineTo(effect.x+Math.cos(beamAngle)*length,effect.y+Math.sin(beamAngle)*length);ctx.stroke();}
            ctx.translate(effect.x,effect.y);ctx.rotate(progress*Math.PI);ctx.fillStyle="rgba(255,255,255,.75)";
            for(let index=0;index<4;index++){ctx.rotate(Math.PI/2);ctx.beginPath();ctx.moveTo(36,0);ctx.lineTo(-18,-14);ctx.lineTo(-18,14);ctx.closePath();ctx.fill();}
          }else if(effect.classId==="frost"){
            const endX=effect.x2??effect.x,endY=effect.y2??effect.y;
            const angle=Math.atan2(endY-effect.y,endX-effect.x),length=Math.hypot(endX-effect.x,endY-effect.y);
            ctx.translate(effect.x,effect.y);ctx.rotate(angle);ctx.fillStyle="rgba(139,220,255,.12)";
            const laneCount=clamp(effect.count??1,1,4);
            for(let lane=0;lane<laneCount;lane++){
              const offset=(lane-(laneCount-1)/2)*104;
              ctx.beginPath();ctx.moveTo(0,offset);ctx.lineTo(length,offset-radius*.45);ctx.lineTo(length,offset+radius*.45);ctx.closePath();ctx.fill();ctx.stroke();
              for(let index=1;index<=9;index++){const x=length*index/10,y=offset+Math.sin(index*2.3+progress*4)*radius*.18;ctx.beginPath();ctx.moveTo(x,y-22);ctx.lineTo(x-10,y+15);ctx.lineTo(x+10,y+15);ctx.closePath();ctx.stroke();}
            }
          }else if(effect.classId==="blade"){
            const endX=effect.x2??effect.x,endY=effect.y2??effect.y;
            const angle=Math.atan2(endY-effect.y,endX-effect.x),length=Math.hypot(endX-effect.x,endY-effect.y);
            ctx.translate(effect.x,effect.y);ctx.rotate(angle);ctx.lineWidth=12*(1-progress)+4;
            ctx.beginPath();ctx.moveTo(0,-32);ctx.lineTo(length,32);ctx.stroke();ctx.strokeStyle="#fff4d6";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-22);ctx.lineTo(length,22);ctx.stroke();
            for(let index=1;index<7;index++){ctx.strokeStyle=effect.color;ctx.lineWidth=5;ctx.beginPath();ctx.arc(length*index/7,0,70+index*8,-1.05,1.05);ctx.stroke();}
          }else if(effect.classId==="gravity"){
            ctx.translate(effect.x,effect.y);ctx.fillStyle="rgba(3,1,10,.92)";ctx.beginPath();ctx.arc(0,0,26+radius*.18,0,Math.PI*2);ctx.fill();
            ctx.lineWidth=6;for(let ring=1;ring<=4;ring++){ctx.beginPath();ctx.ellipse(0,0,radius*(.2*ring),radius*(.08+.045*ring),progress*3+ring*.4,0,Math.PI*2);ctx.stroke();}
            for(let index=0;index<10;index++){const angle=index/10*Math.PI*2-progress*4;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(Math.cos(angle)*radius,Math.sin(angle)*radius);ctx.quadraticCurveTo(Math.cos(angle+1.2)*radius*.48,Math.sin(angle+1.2)*radius*.48,0,0);ctx.stroke();}
          }else if(effect.classId==="thunder"){
            const topY=effect.y2??effect.y-520;ctx.lineWidth=9*(1-progress)+3;ctx.beginPath();ctx.moveTo(effect.x,topY);
            for(let step=1;step<=8;step++){const y=topY+(effect.y-topY)*step/8;const x=effect.x+(step===8?0:(step%2?1:-1)*(14+step*2));ctx.lineTo(x,y);}ctx.stroke();
            ctx.lineWidth=3;for(let index=0;index<8;index++){const angle=index/8*Math.PI*2+progress;ctx.beginPath();ctx.moveTo(effect.x+Math.cos(angle)*radius*.28,effect.y+Math.sin(angle)*radius*.28);ctx.lineTo(effect.x+Math.cos(angle+.16)*radius,effect.y+Math.sin(angle+.16)*radius);ctx.stroke();}
          }else if(effect.classId==="sky"){
            ctx.lineWidth=4;ctx.setLineDash([14,8]);ctx.beginPath();ctx.arc(effect.x,effect.y,radius*.62,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
            ctx.beginPath();ctx.moveTo(effect.x-radius,effect.y);ctx.lineTo(effect.x+radius,effect.y);ctx.moveTo(effect.x,effect.y-radius);ctx.lineTo(effect.x,effect.y+radius);ctx.stroke();
            const topY=effect.y2??-120;ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(effect.x,topY);ctx.lineTo(effect.x,effect.y);ctx.stroke();
          }else if(effect.classId==="cinder"){
            const endX=effect.x2??effect.x,endY=effect.y2??effect.y;const angle=Math.atan2(endY-effect.y,endX-effect.x),length=Math.hypot(endX-effect.x,endY-effect.y);
            ctx.translate(effect.x,effect.y);ctx.rotate(angle);const laneCount=clamp(effect.count??3,3,5);ctx.fillStyle="rgba(255,103,47,.18)";
            for(let lane=0;lane<laneCount;lane++){const offset=(lane-(laneCount-1)/2)*118;ctx.beginPath();ctx.moveTo(0,offset-38);for(let step=1;step<=8;step++){ctx.lineTo(length*step/8,offset-30-Math.sin(step*2+progress*7)*26);}for(let step=8;step>=0;step--){ctx.lineTo(length*step/8,offset+30+Math.sin(step*2.2+progress*7)*26);}ctx.closePath();ctx.fill();ctx.stroke();}
          }else{
            ctx.lineWidth=8*(1-progress)+3;ctx.beginPath();ctx.arc(effect.x,effect.y,radius,0,Math.PI*2);ctx.stroke();
          }
        }
        if(effect.kind==="boss-phase"){
          const radius=30+effect.radius*progress;
          ctx.lineWidth=7*(1-progress)+2;
          if(effect.bossVariant==="storm"){
            for(let index=0;index<8;index++){const angle=index/8*Math.PI*2;ctx.beginPath();ctx.moveTo(effect.x,effect.y);ctx.lineTo(effect.x+Math.cos(angle)*radius*.55,effect.y+Math.sin(angle)*radius);ctx.lineTo(effect.x+Math.cos(angle+.18)*radius,effect.y+Math.sin(angle+.18)*radius*.72);ctx.stroke();}
          }else if(effect.bossVariant==="weaver"){
            for(let index=0;index<6;index++){const angle=index/6*Math.PI*2+progress*2;ctx.beginPath();ctx.arc(effect.x+Math.cos(angle)*radius*.35,effect.y+Math.sin(angle)*radius*.35,radius*.42,angle,angle+Math.PI);ctx.stroke();}
          }else if(effect.bossVariant==="forge"){
            ctx.fillStyle="rgba(255,113,38,.18)";ctx.fillRect(effect.x-radius,effect.y-radius*.32,radius*2,radius*.64);
            for(let index=0;index<5;index++){const x=effect.x-radius+index*radius*.5;ctx.beginPath();ctx.moveTo(x,effect.y+radius*.35);ctx.lineTo(x+radius*.2,effect.y-radius*.35);ctx.stroke();}
          }else if(effect.bossVariant==="leviathan"){
            for(let index=0;index<4;index++){ctx.beginPath();ctx.ellipse(effect.x,effect.y,radius*(.4+index*.18),radius*(.12+index*.045),progress*.35,0,Math.PI*2);ctx.stroke();}
          }else if(effect.bossVariant==="mirror"){
            ctx.translate(effect.x,effect.y);ctx.rotate(progress*Math.PI*.5);for(let index=0;index<3;index++){const size=radius*(.35+index*.22);ctx.strokeRect(-size,-size,size*2,size*2);}
          }else if(effect.bossVariant==="warden"){
            ctx.beginPath();ctx.arc(effect.x,effect.y,radius,0,Math.PI*2);ctx.stroke();
            for(let index=0;index<12;index++){const angle=index/12*Math.PI*2;ctx.beginPath();ctx.moveTo(effect.x+Math.cos(angle)*radius*.58,effect.y+Math.sin(angle)*radius*.58);ctx.lineTo(effect.x+Math.cos(angle)*radius,effect.y+Math.sin(angle)*radius);ctx.stroke();}
            ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(effect.x,effect.y);ctx.lineTo(effect.x+Math.cos(progress*5.2)*radius*.72,effect.y+Math.sin(progress*5.2)*radius*.72);ctx.stroke();
          }else{
            for(let index=0;index<6;index++){const angle=index/6*Math.PI*2+progress;ctx.beginPath();ctx.moveTo(effect.x+Math.cos(angle)*radius*.25,effect.y+Math.sin(angle)*radius*.25);ctx.lineTo(effect.x+Math.cos(angle)*radius,effect.y+Math.sin(angle)*radius);ctx.stroke();}
          }
        }
        if(effect.kind==="slash"){
          const angle=Math.atan2((effect.y2??effect.y)-effect.y,(effect.x2??effect.x)-effect.x);
          const radius=effect.radius*(.72+.28*progress);
          if((effect.enemyKind==="shieldmite"||effect.enemyKind==="splitter")&&enemyReinforcementProjectiles.complete&&enemyReinforcementProjectiles.naturalWidth){
            const cellW=enemyReinforcementProjectiles.naturalWidth/3,cellH=enemyReinforcementProjectiles.naturalHeight/2;
            const sprite=effect.enemyKind==="shieldmite"?0:2;
            const endX=effect.x2??effect.x,endY=effect.y2??effect.y;
            ctx.translate((effect.x+endX)/2,(effect.y+endY)/2);ctx.rotate(angle);ctx.globalAlpha=alpha*.92;
            ctx.drawImage(enemyReinforcementProjectiles,(sprite%3)*cellW,Math.floor(sprite/3)*cellH,cellW,cellH,-66,-38,132,76);
          }else{
            ctx.translate(effect.x,effect.y);ctx.rotate(angle);
            ctx.lineWidth=18*(1-progress)+4;
            ctx.beginPath();ctx.arc(0,0,radius,-.76,.76);ctx.stroke();
            ctx.strokeStyle="rgba(255,255,255,.9)";ctx.lineWidth=3;
            ctx.beginPath();ctx.arc(0,0,radius,-.7,.7);ctx.stroke();
          }
        }
        if(effect.kind==="skill"){
          const radius=18+effect.radius*progress;
          ctx.lineWidth=5*(1-progress)+2;
          ctx.beginPath();ctx.arc(effect.x,effect.y,radius,0,Math.PI*2);ctx.stroke();
          if(effect.variant==="secondary"){
            const targetX=effect.x2??effect.x,targetY=effect.y2??effect.y;
            const sides=effect.classId==="guardian"?6:effect.classId==="frost"?8:effect.classId==="blade"?3:4;
            ctx.save();ctx.translate(effect.x,effect.y);ctx.rotate(progress*Math.PI*2);ctx.setLineDash([10,7]);ctx.lineWidth=3;
            ctx.beginPath();
            for(let index=0;index<sides;index++){
              const angle=index/sides*Math.PI*2-Math.PI/2;
              const px=Math.cos(angle)*radius*.72,py=Math.sin(angle)*radius*.72;
              if(index)ctx.lineTo(px,py);else ctx.moveTo(px,py);
            }
            ctx.closePath();ctx.stroke();ctx.setLineDash([]);
            for(let index=0;index<sides;index++){
              const angle=index/sides*Math.PI*2+progress*2.4;
              ctx.fillRect(Math.cos(angle)*radius*.42-4,Math.sin(angle)*radius*.42-4,8,8);
            }
            ctx.restore();
            if(effect.x2!==undefined&&effect.y2!==undefined){
              ctx.globalAlpha=alpha*.65;ctx.setLineDash([9,8]);ctx.lineWidth=2;
              ctx.beginPath();ctx.moveTo(effect.x,effect.y);ctx.lineTo(targetX,targetY);ctx.stroke();ctx.setLineDash([]);
            }
          }
          if(effect.classId==="assault"){
            for(let index=0;index<12;index++){
              const angle=index/12*Math.PI*2;
              ctx.beginPath();ctx.moveTo(effect.x+Math.cos(angle)*radius*.58,effect.y+Math.sin(angle)*radius*.58);ctx.lineTo(effect.x+Math.cos(angle)*radius,effect.y+Math.sin(angle)*radius);ctx.stroke();
            }
          }
          if(effect.classId==="guardian"){
            ctx.translate(effect.x,effect.y);ctx.rotate(progress*Math.PI);
            ctx.beginPath();
            for(let index=0;index<6;index++){const angle=index/6*Math.PI*2;const px=Math.cos(angle)*radius,py=Math.sin(angle)*radius;if(index)ctx.lineTo(px,py);else ctx.moveTo(px,py);}
            ctx.closePath();ctx.stroke();
          }
          if(effect.classId==="engineer"){
            ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(effect.x-radius*.35,effect.y);ctx.lineTo(effect.x+radius*.35,effect.y);ctx.moveTo(effect.x,effect.y-radius*.35);ctx.lineTo(effect.x,effect.y+radius*.35);ctx.stroke();
            ctx.globalAlpha=alpha*.55;ctx.beginPath();ctx.arc(effect.x,effect.y,radius*.72,0,Math.PI*2);ctx.stroke();
          }
          if(effect.classId==="phantom"){
            ctx.translate(effect.x,effect.y);ctx.rotate(progress*Math.PI*2);
            for(let index=0;index<4;index++){ctx.rotate(Math.PI/2);ctx.strokeRect(radius*.35,-5,radius*.35,10);}
          }
          if(effect.classId==="laser"){
            ctx.globalAlpha=alpha*.72;ctx.beginPath();ctx.arc(effect.x,effect.y,Math.max(8,radius*.55),0,Math.PI*2);ctx.stroke();
            ctx.fillStyle="rgba(255,255,255,.85)";ctx.beginPath();ctx.arc(effect.x,effect.y,5+10*(1-progress),0,Math.PI*2);ctx.fill();
          }
          if(effect.classId==="frost"){
            ctx.fillStyle="rgba(137,228,255,.16)";
            ctx.beginPath();for(let index=0;index<8;index++){const angle=index/8*Math.PI*2-Math.PI/8,crystalRadius=radius*(index%2?.84:1),x=effect.x+Math.cos(angle)*crystalRadius,y=effect.y+Math.sin(angle)*crystalRadius;if(index)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.closePath();ctx.fill();ctx.stroke();
            for(let index=0;index<8;index++){
              const angle=index/8*Math.PI*2;
              ctx.beginPath();ctx.moveTo(effect.x,effect.y);ctx.lineTo(effect.x+Math.cos(angle)*radius,effect.y+Math.sin(angle)*radius);ctx.stroke();
              const tipX=effect.x+Math.cos(angle)*radius,tipY=effect.y+Math.sin(angle)*radius;
              ctx.beginPath();ctx.moveTo(tipX,tipY);ctx.lineTo(effect.x+Math.cos(angle-.2)*radius*.72,effect.y+Math.sin(angle-.2)*radius*.72);ctx.lineTo(effect.x+Math.cos(angle+.2)*radius*.72,effect.y+Math.sin(angle+.2)*radius*.72);ctx.closePath();ctx.fill();
            }
          }
          if(effect.classId==="blade"){
            ctx.translate(effect.x,effect.y);ctx.rotate(progress*Math.PI*.8);
            ctx.beginPath();ctx.arc(0,0,radius,-.9,.9);ctx.stroke();
            ctx.rotate(Math.PI);ctx.beginPath();ctx.arc(0,0,radius*.72,-.8,.8);ctx.stroke();
          }
          if(effect.classId==="gravity"){
            ctx.globalAlpha=alpha*.75;
            for(let ring=1;ring<=3;ring++){
              ctx.beginPath();ctx.arc(effect.x,effect.y,radius*(.24*ring),0,Math.PI*2);ctx.stroke();
            }
            for(let index=0;index<8;index++){
              const angle=index/8*Math.PI*2-progress*1.8;
              ctx.beginPath();ctx.moveTo(effect.x+Math.cos(angle)*radius,effect.y+Math.sin(angle)*radius);ctx.lineTo(effect.x+Math.cos(angle)*radius*.25,effect.y+Math.sin(angle)*radius*.25);ctx.stroke();
            }
          }
          if(effect.classId==="thunder"){
            ctx.globalAlpha=alpha*.85;ctx.lineWidth=3;
            for(let index=0;index<7;index++){const angle=index/7*Math.PI*2+progress;ctx.beginPath();ctx.moveTo(effect.x+Math.cos(angle)*radius*.18,effect.y+Math.sin(angle)*radius*.18);ctx.lineTo(effect.x+Math.cos(angle+.15)*radius*.48,effect.y+Math.sin(angle+.15)*radius*.48);ctx.lineTo(effect.x+Math.cos(angle-.08)*radius,effect.y+Math.sin(angle-.08)*radius);ctx.stroke();}
          }
          if(effect.classId==="sky"){
            const endX=effect.x2??effect.x,endY=effect.y2??effect.y;ctx.setLineDash([18,10]);ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(effect.x,effect.y);ctx.lineTo(endX,endY);ctx.stroke();ctx.setLineDash([]);
            ctx.beginPath();ctx.arc(effect.x,effect.y,radius*.34,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(effect.x-radius*.55,effect.y);ctx.lineTo(effect.x+radius*.55,effect.y);ctx.moveTo(effect.x,effect.y-radius*.55);ctx.lineTo(effect.x,effect.y+radius*.55);ctx.stroke();
          }
          if(effect.classId==="cinder"){
            const endX=effect.x2??effect.x,endY=effect.y2??effect.y;const angle=Math.atan2(endY-effect.y,endX-effect.x),length=Math.hypot(endX-effect.x,endY-effect.y);ctx.translate(effect.x,effect.y);ctx.rotate(angle);ctx.fillStyle="rgba(255,111,42,.2)";
            ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(length,-length*.48);for(let step=7;step>=0;step--){const x=length*step/7;ctx.lineTo(x,Math.sin(step*2+progress*8)*22);}ctx.lineTo(length,length*.48);ctx.closePath();ctx.fill();ctx.stroke();
          }
        }
        ctx.restore();
      }
      const projectileSpriteIndex: Record<ClassId, number> = { assault: 0, guardian: 1, engineer: 2, phantom: 3, laser: 0, frost: 1, blade: 0, gravity: 1, thunder: 0, sky: 1, cinder: 2 };
      const projectileDimensions: Record<ClassId, [number, number]> = {
        assault: [34, 18],
        guardian: [38, 22],
        engineer: [31, 18],
        phantom: [38, 16],
        laser: [36, 17],
        frost: [40, 23],
        blade: [40, 21],
        gravity: [42, 24],
        thunder: [44, 20],
        sky: [58, 17],
        cinder: [42, 24],
      };
      for(const s of shots){
        if(s.hostile){
          if(s.enemyKind==="boss"){
            const variant=s.bossVariant||"rift",bossInfo=BOSS_VARIANTS[variant],sprite=bossInfo.sprite;
            const bossProjectileImage=bossInfo.sheet==="v2"?bossProjectileSpritesV2:bossProjectileSprites;
            if(bossProjectileImage.complete&&bossProjectileImage.naturalWidth){
              const columns=bossInfo.sheet==="v2"?3:2,rows=bossInfo.sheet==="v2"?1:2;
              const cellW=bossProjectileImage.naturalWidth/columns,cellH=bossProjectileImage.naturalHeight/rows;
              const drawW=variant==="warden"?62:variant==="mirror"?66:variant==="leviathan"?82:variant==="forge"?72:variant==="weaver"?64:74;
              const drawH=variant==="warden"?62:variant==="mirror"?42:variant==="leviathan"?34:variant==="weaver"?52:38;
              ctx.save();ctx.translate(s.x,s.y);ctx.rotate(Math.atan2(s.vy,s.vx));ctx.shadowColor=BOSS_VARIANTS[variant].color;ctx.shadowBlur=18;
              ctx.drawImage(bossProjectileImage,(sprite%columns)*cellW+4,Math.floor(sprite/columns)*cellH+4,cellW-8,cellH-8,-drawW/2,-drawH/2,drawW,drawH);ctx.restore();
            }else{
              ctx.save();ctx.translate(s.x,s.y);ctx.fillStyle=BOSS_VARIANTS[variant].color;ctx.beginPath();ctx.arc(0,0,s.r+3,0,Math.PI*2);ctx.fill();ctx.restore();
            }
            continue;
          }
          const reinforcementProjectileIndex: Partial<Record<EnemyKind,number>>={sniper:1,mortarwasp:3,leech:4};
          const reinforcementProjectile=reinforcementProjectileIndex[s.enemyKind||"runner"];
          if(reinforcementProjectile!==undefined&&enemyReinforcementProjectiles.complete&&enemyReinforcementProjectiles.naturalWidth){
            const cellW=enemyReinforcementProjectiles.naturalWidth/3,cellH=enemyReinforcementProjectiles.naturalHeight/2;
            const drawSizes:Record<number,[number,number]>={1:[60,18],3:[48,30],4:[45,40]};
            const [drawW,drawH]=drawSizes[reinforcementProjectile];
            ctx.save();ctx.translate(s.x,s.y);ctx.rotate(Math.atan2(s.vy,s.vx));ctx.shadowColor=s.enemyKind==="leech"?"#b76cff":s.enemyKind==="mortarwasp"?"#ff9a4d":s.enemyKind==="sniper"?"#ff645f":"#72d9ff";ctx.shadowBlur=12;
            ctx.drawImage(enemyReinforcementProjectiles,(reinforcementProjectile%3)*cellW,Math.floor(reinforcementProjectile/3)*cellH,cellW,cellH,-drawW/2,-drawH/2,drawW,drawH);ctx.restore();
            continue;
          }
          if(s.enemyKind==="assassin"&&assassinProjectile.complete&&assassinProjectile.naturalWidth){
            ctx.save();ctx.translate(s.x,s.y);ctx.rotate(Math.atan2(s.vy,s.vx));ctx.shadowColor="#a36cff";ctx.shadowBlur=11;
            ctx.drawImage(assassinProjectile,-21,-9,42,18);ctx.restore();
            continue;
          }
          const hostileSprite=s.enemyKind==="commander"?1:s.enemyKind==="artillery"?0:-1;
          if(hostileSprite>=0&&enemyProjectiles.complete&&enemyProjectiles.naturalWidth){
            const cellW=enemyProjectiles.naturalWidth/2,cellH=enemyProjectiles.naturalHeight;
            const drawW=s.enemyKind==="commander"?42:46,drawH=s.enemyKind==="commander"?18:25;
            ctx.save();ctx.translate(s.x,s.y);ctx.rotate(Math.atan2(s.vy,s.vx));ctx.shadowColor=s.enemyKind==="commander"?"#b65cff":"#ff8b3e";ctx.shadowBlur=10;
            ctx.drawImage(enemyProjectiles,hostileSprite*cellW,0,cellW,cellH,-drawW/2,-drawH/2,drawW,drawH);ctx.restore();
          }else{
            ctx.fillStyle="#ff7657";ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();
          }
          continue;
        }
        if(!s.classId){
          ctx.fillStyle="#fff2ba";ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();
          continue;
        }
        const sprite=projectileSpriteIndex[s.classId];
        const classInfo=CLASSES.find((item)=>item.id===s.classId)||CLASSES[0];
        const projectileImage=classInfo.sheet==="specialist"?specialistProjectiles:classInfo.sheet==="vanguard"?vanguardProjectiles:classInfo.sheet==="expedition"?v2SupportAssets:projectileSprites;
        if(!projectileImage.complete||!projectileImage.naturalWidth){
          ctx.fillStyle="#fff2ba";ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();continue;
        }
        const projectileColumns=classInfo.sheet==="expedition"?3:2;
        const cellW=projectileImage.naturalWidth/projectileColumns,cellH=classInfo.sheet==="core"||classInfo.sheet==="expedition"?projectileImage.naturalHeight/2:projectileImage.naturalHeight;
        const [baseDrawW,baseDrawH]=projectileDimensions[s.classId];
        const drawW=baseDrawW*(s.skill2?1.38:1),drawH=baseDrawH*(s.skill2?1.38:1);
        ctx.save();ctx.translate(s.x,s.y);ctx.rotate(Math.atan2(s.vy,s.vx));
        ctx.shadowColor=classInfo.color;ctx.shadowBlur=s.skill2?20:8;
        if(s.skill2){
          ctx.strokeStyle=classInfo.color;ctx.fillStyle="rgba(255,255,255,.16)";ctx.lineWidth=2.5;
          ctx.beginPath();ctx.moveTo(drawW*.55,0);ctx.lineTo(0,-drawH*.82);ctx.lineTo(-drawW*.55,0);ctx.lineTo(0,drawH*.82);ctx.closePath();ctx.fill();ctx.stroke();
          ctx.globalAlpha=.8;ctx.beginPath();ctx.arc(0,0,Math.max(drawH,drawW)*.63,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
        }
        ctx.drawImage(projectileImage,(sprite%projectileColumns)*cellW,classInfo.sheet==="core"?Math.floor(sprite/2)*cellH:classInfo.sheet==="expedition"?cellH:0,cellW,cellH,-drawW/2,-drawH/2,drawW,drawH);
        ctx.restore();
      }
      const enemySpriteIndex: Partial<Record<EnemyKind, number>> = { runner: 0, crawler: 1, artillery: 2, assassin: 3, brute: 4, commander: 5 };
      const reinforcementEnemyIndex: Partial<Record<EnemyKind, number>> = { shieldmite: 0, sniper: 1, splitter: 2, mortarwasp: 3, leech: 4, rammer: 5 };
      for(const e of enemies){
        const sprite = enemySpriteIndex[e.kind]??0;
        const reinforcementSprite = reinforcementEnemyIndex[e.kind];
        const size = e.r * (e.kind==="boss"?5.35:reinforcementSprite!==undefined?4.55:4.25);
        const visualTargets = [player, ...(remote ? [remote] : [])].filter((actor) => actor.hp > 0);
        const visualTarget = visualTargets.length ? visualTargets.reduce((nearest, actor) => dist(e, actor) < dist(e, nearest) ? actor : nearest) : player;
        ctx.save();
        ctx.translate(e.x,e.y);
        ctx.rotate(Math.atan2(visualTarget.y-e.y,visualTarget.x-e.x)-Math.PI/2);
        if(e.kind==="boss"){ctx.shadowColor=BOSS_VARIANTS[e.bossVariant||"rift"].color;ctx.shadowBlur=34;}
        else if(e.elite){ctx.shadowColor="#f4c95d";ctx.shadowBlur=18;}
        if(e.kind==="boss"){
          const bossInfo=BOSS_VARIANTS[e.bossVariant||"rift"];
          const bossImage=bossInfo.sheet==="v2"?bossVariantSpritesV2:bossVariantSprites;
          if(bossImage.complete&&bossImage.naturalWidth){
            const columns=bossInfo.sheet==="v2"?3:2,rows=bossInfo.sheet==="v2"?1:2;
            const cellW=bossImage.naturalWidth/columns,cellH=bossImage.naturalHeight/rows;
            const inset=bossInfo.sheet==="v2"?9:0;
            ctx.drawImage(bossImage,(bossInfo.sprite%columns)*cellW+inset,Math.floor(bossInfo.sprite/columns)*cellH+inset,cellW-inset*2,cellH-inset*2,-size/2,-size/2,size,size);
          }else{
            ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(0,0,e.r,0,Math.PI*2);ctx.fill();
          }
        }else if(reinforcementSprite!==undefined&&enemyReinforcementSprites.complete&&enemyReinforcementSprites.naturalWidth){
          const cellW=enemyReinforcementSprites.naturalWidth/3,cellH=enemyReinforcementSprites.naturalHeight/2;
          ctx.drawImage(enemyReinforcementSprites,(reinforcementSprite%3)*cellW,Math.floor(reinforcementSprite/3)*cellH,cellW,cellH,-size/2,-size/2,size,size);
        }else if(enemySprites.complete&&enemySprites.naturalWidth){
          const cellW=enemySprites.naturalWidth/3,cellH=enemySprites.naturalHeight/2;
          ctx.drawImage(enemySprites,(sprite%3)*cellW,Math.floor(sprite/3)*cellH,cellW,cellH,-size/2,-size/2,size,size);
        }else{
          ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(0,0,e.r,0,Math.PI*2);ctx.fill();
        }
        ctx.restore();
        if(e.kind==="boss"){
          const variant=e.bossVariant||"rift",variantColor=BOSS_VARIANTS[variant].color;
          ctx.save();ctx.translate(e.x,e.y);ctx.rotate(performance.now()/(variant==="storm"?520:900));ctx.strokeStyle=variantColor;ctx.lineWidth=4;ctx.shadowColor=variantColor;ctx.shadowBlur=14;
          if(variant==="weaver"){for(let index=0;index<3;index++){ctx.beginPath();ctx.ellipse(0,0,e.r+18+index*8,e.r*.48+index*5,index*.7,0,Math.PI*2);ctx.stroke();}}
          else if(variant==="leviathan"){for(let index=0;index<3;index++){ctx.beginPath();ctx.ellipse(0,0,e.r+22+index*12,e.r*.34+index*4,0,0,Math.PI*2);ctx.stroke();}}
          else if(variant==="mirror"){for(let index=0;index<2;index++){ctx.rotate(Math.PI/4);ctx.strokeRect(-e.r-18-index*11,-e.r-18-index*11,(e.r+18+index*11)*2,(e.r+18+index*11)*2);}}
          else if(variant==="warden"){for(let index=0;index<12;index++){const angle=index/12*Math.PI*2;ctx.beginPath();ctx.moveTo(Math.cos(angle)*(e.r+12),Math.sin(angle)*(e.r+12));ctx.lineTo(Math.cos(angle)*(e.r+29),Math.sin(angle)*(e.r+29));ctx.stroke();}ctx.beginPath();ctx.arc(0,0,e.r+22,0,Math.PI*2);ctx.stroke();}
          else{ctx.beginPath();const sides=variant==="forge"?4:variant==="storm"?8:6;for(let index=0;index<sides;index++){const angle=index/sides*Math.PI*2;const radius=e.r+18;const px=Math.cos(angle)*radius,py=Math.sin(angle)*radius;if(index)ctx.lineTo(px,py);else ctx.moveTo(px,py);}ctx.closePath();ctx.stroke();}
          ctx.restore();
        }else if(e.kind==="shieldmite"&&(e.barrier||0)>0){
          ctx.save();ctx.strokeStyle="#72fff2";ctx.fillStyle="rgba(83,214,206,.12)";ctx.lineWidth=3;ctx.shadowColor="#53d6ce";ctx.shadowBlur=12;ctx.beginPath();ctx.arc(e.x,e.y,e.r+13,-Math.PI*.85,-Math.PI*.15);ctx.stroke();ctx.fill();ctx.restore();
        }else if(e.elite){ctx.strokeStyle="rgba(244,201,93,.85)";ctx.lineWidth=2;ctx.strokeRect(e.x-e.r-6,e.y-e.r-6,(e.r+6)*2,(e.r+6)*2);}
        if((e.burn||0)>0){
          ctx.save();ctx.translate(e.x,e.y);ctx.fillStyle="rgba(255,116,38,.78)";ctx.shadowColor="#ff7a2f";ctx.shadowBlur=13;
          for(let index=0;index<5;index++){const flameAngle=index/5*Math.PI*2+performance.now()/650;const flameRadius=e.r+7+(index%2)*5;const fx=Math.cos(flameAngle)*flameRadius,fy=Math.sin(flameAngle)*flameRadius;ctx.beginPath();ctx.moveTo(fx,fy-10);ctx.lineTo(fx-5,fy+7);ctx.lineTo(fx+5,fy+7);ctx.closePath();ctx.fill();}
          ctx.restore();
        }
        if((e.stunned||0)>0){
          ctx.save();ctx.translate(e.x,e.y);ctx.strokeStyle="#8bf5ff";ctx.lineWidth=2.6;ctx.shadowColor="#48dfff";ctx.shadowBlur=14;
          for(let index=0;index<4;index++){const angle=index/4*Math.PI*2+performance.now()/420;ctx.beginPath();ctx.moveTo(Math.cos(angle)*e.r*.45,Math.sin(angle)*e.r*.45);ctx.lineTo(Math.cos(angle+.18)*(e.r+8),Math.sin(angle+.18)*(e.r+8));ctx.lineTo(Math.cos(angle-.08)*(e.r+18),Math.sin(angle-.08)*(e.r+18));ctx.stroke();}
          ctx.restore();
        }
        if((e.frozen||0)>0){
          const iceRadius=e.r+10,icePulse=1+Math.sin(performance.now()/110)*.035;
          ctx.save();ctx.translate(e.x,e.y);ctx.scale(icePulse,icePulse);ctx.fillStyle="rgba(120,222,255,.28)";ctx.strokeStyle="#b9f4ff";ctx.lineWidth=2.4;ctx.shadowColor="#75dcff";ctx.shadowBlur=18;
          ctx.beginPath();for(let index=0;index<8;index++){const iceAngle=index/8*Math.PI*2-Math.PI/8,iceR=iceRadius*(index%2?1:.88),iceX=Math.cos(iceAngle)*iceR,iceY=Math.sin(iceAngle)*iceR;if(index)ctx.lineTo(iceX,iceY);else ctx.moveTo(iceX,iceY);}ctx.closePath();ctx.fill();ctx.stroke();
          ctx.fillStyle="rgba(210,250,255,.92)";for(let index=0;index<6;index++){const crystalAngle=index/6*Math.PI*2+performance.now()/1800,inner=iceRadius*.72,outer=iceRadius+10+(index%2)*4;ctx.beginPath();ctx.moveTo(Math.cos(crystalAngle-.14)*inner,Math.sin(crystalAngle-.14)*inner);ctx.lineTo(Math.cos(crystalAngle)*outer,Math.sin(crystalAngle)*outer);ctx.lineTo(Math.cos(crystalAngle+.14)*inner,Math.sin(crystalAngle+.14)*inner);ctx.closePath();ctx.fill();}ctx.restore();
          ctx.fillStyle="#e4fbff";ctx.font="900 15px monospace";ctx.textAlign="center";ctx.fillText("❄",e.x,e.y-e.r-17);
        }else if(e.slow>0){ctx.fillStyle="#9eeaff";ctx.font="800 14px monospace";ctx.textAlign="center";ctx.fillText("✦",e.x,e.y-e.r-10);}
      }
      const activeBoss = enemies.find((enemy)=>enemy.kind==="boss"&&enemy.hp>0);
      if(activeBoss){
        const bossRatio=clamp(activeBoss.hp/Math.max(1,activeBoss.maxHp),0,1);
        const bossInfo=BOSS_VARIANTS[activeBoss.bossVariant||"rift"];
        ctx.save();ctx.fillStyle="rgba(11,12,18,.88)";ctx.fillRect(W/2-270,20,540,44);
        ctx.strokeStyle=bossInfo.color;ctx.lineWidth=2;ctx.strokeRect(W/2-270,20,540,44);
        ctx.fillStyle="#35213e";ctx.fillRect(W/2-250,47,500,7);
        ctx.fillStyle=bossInfo.color;ctx.fillRect(W/2-250,47,500*bossRatio,7);
        ctx.fillStyle="#f2e9ff";ctx.font="900 13px monospace";ctx.textAlign="left";ctx.fillText(`BOSS · ${bossInfo.name} · PHASE ${activeBoss.bossPhase||1}`,W/2-250,39);
        ctx.textAlign="right";ctx.fillText(`${Math.ceil(activeBoss.hp)} / ${Math.ceil(activeBoss.maxHp)}`,W/2+250,39);ctx.restore();
      }
      const drawMech = (actor: Actor, ally: boolean) => {
        const classInfo = CLASSES.find((item) => item.id === actor.classId) || CLASSES[0];
        const bladeSwing = classInfo.id === "blade"
          ? effects.find((effect) => effect.kind === "slash" && effect.classId === "blade" && dist(effect, actor) < 90)
          : undefined;
        const sprite = classInfo.sprite;
        const mechImage = classInfo.id === "laser"
          ? laserSprite
          : classInfo.id === "frost"
            ? frostSprite
            : classInfo.id === "blade"
            ? bladeSprite
            : classInfo.id === "gravity"
              ? gravitySprite
              : classInfo.id === "thunder"
                ? thunderSprite
                : classInfo.id === "sky"
                  ? skySprite
                  : classInfo.id === "cinder"
                    ? cinderSprite
                    : playerSprites;
        const independentSprite = classInfo.sheet !== "core";
        const cellW = independentSprite ? mechImage.naturalWidth : mechImage.naturalWidth / 2;
        const cellH = independentSprite ? mechImage.naturalHeight : mechImage.naturalHeight / 2;
        const size = classInfo.renderSize;
        ctx.save();
        if(actor.hp<=0){ctx.globalAlpha=.34;ctx.filter="grayscale(1) brightness(.72)";}
        ctx.shadowColor=ally?"#78a99d":actor.color;
        ctx.shadowBlur=20;
        if(mechImage.complete&&mechImage.naturalWidth){
          ctx.drawImage(mechImage,independentSprite?0:(sprite%2)*cellW,independentSprite?0:Math.floor(sprite/2)*cellH,cellW,cellH,actor.x-size/2,actor.y-size/2,size,size);
        }else{
          ctx.fillStyle=actor.color;ctx.beginPath();ctx.arc(actor.x,actor.y,actor.r,0,Math.PI*2);ctx.fill();
        }
        if(bladeSwing&&actor.hp>0){
          const swingProgress=clamp(1-bladeSwing.life/bladeSwing.duration,0,1);
          const targetAngle=Math.atan2((bladeSwing.y2??actor.y)-bladeSwing.y,(bladeSwing.x2??actor.x)-bladeSwing.x);
          const swingAngle=targetAngle-1.28+swingProgress*2.56;
          const bladeLength=classInfo.renderSize*.78;
          ctx.save();ctx.translate(actor.x,actor.y);ctx.rotate(swingAngle);
          ctx.strokeStyle="#5b3824";ctx.lineWidth=8;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(actor.r*.45,0);ctx.lineTo(actor.r*.95,0);ctx.stroke();
          const bladeGradient=ctx.createLinearGradient(actor.r*.9,0,bladeLength,0);
          bladeGradient.addColorStop(0,"#fff8dd");bladeGradient.addColorStop(.35,"#ffc26b");bladeGradient.addColorStop(1,"rgba(255,104,35,.15)");
          ctx.strokeStyle=bladeGradient;ctx.shadowColor="#ff8a32";ctx.shadowBlur=24;ctx.lineWidth=9;
          ctx.beginPath();ctx.moveTo(actor.r*.88,0);ctx.lineTo(bladeLength,0);ctx.stroke();
          ctx.strokeStyle="#ffffff";ctx.shadowBlur=8;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(actor.r,0);ctx.lineTo(bladeLength*.94,0);ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      };
      const drawDowned = (actor: Actor, progressSeconds: number) => {
        const progress=clamp(progressSeconds/REVIVE_SECONDS,0,1);
        const radius=actor.r+22;
        ctx.save();ctx.translate(actor.x,actor.y);ctx.lineWidth=5;ctx.strokeStyle="rgba(207,105,78,.35)";
        ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.stroke();
        ctx.strokeStyle="#76f0ae";ctx.shadowColor="#76f0ae";ctx.shadowBlur=12;
        ctx.beginPath();ctx.arc(0,0,radius,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);ctx.stroke();
        ctx.fillStyle="#f1d8cf";ctx.shadowBlur=0;ctx.font="800 11px monospace";ctx.textAlign="center";
        ctx.fillText(progress>0?`施救 ${Math.ceil((1-progress)*REVIVE_SECONDS)}s`:"倒地 · 靠近施救",0,-radius-12);
        ctx.restore();
      };
      const drawDrones = (actor: Actor, count: number) => {
        if(count<=0)return;
        const classInfo=CLASSES.find((item)=>item.id===actor.classId)||CLASSES[0];
        const droneImage=classInfo.sheet==="specialist"?specialistDrones:classInfo.sheet==="vanguard"?vanguardDrones:classInfo.sheet==="expedition"?v2SupportAssets:droneSprites;
        if(!droneImage.complete||!droneImage.naturalWidth)return;
        const droneColumns=classInfo.sheet==="expedition"?3:2;
        const cellW=droneImage.naturalWidth/droneColumns,cellH=classInfo.sheet==="core"||classInfo.sheet==="expedition"?droneImage.naturalHeight/2:droneImage.naturalHeight;
        for(let index=0;index<count;index++){
          const position=dronePosition(actor,index,count);
          const sprite=classInfo.sprite;
          const target=enemies.length?enemies.reduce((nearest,enemy)=>dist(position,enemy)<dist(position,nearest)?enemy:nearest):null;
          const angle=target?Math.atan2(target.y-position.y,target.x-position.x):position.angle+Math.PI/2;
          const size=classInfo.id==="cinder"?42:classInfo.id==="frost"||classInfo.id==="gravity"?38:classInfo.id==="blade"||classInfo.id==="thunder"||classInfo.id==="sky"?36:32;
          ctx.save();ctx.translate(position.x,position.y);ctx.rotate(angle);ctx.shadowColor=classInfo.color;ctx.shadowBlur=10;
          ctx.drawImage(droneImage,(sprite%droneColumns)*cellW,classInfo.sheet==="core"?Math.floor(sprite/2)*cellH:0,cellW,cellH,-size/2,-size/2,size,size);
          ctx.restore();
        }
      };
      const drawShieldCorners = (actor: Actor) => {
        const edge=32,corner=10;
        ctx.save();ctx.translate(actor.x,actor.y);ctx.strokeStyle="#75e6da";ctx.lineWidth=3;ctx.shadowColor="#75e6da";ctx.shadowBlur=8;
        ctx.beginPath();
        ctx.moveTo(-edge+corner,-edge);ctx.lineTo(-edge,-edge);ctx.lineTo(-edge,-edge+corner);
        ctx.moveTo(edge-corner,-edge);ctx.lineTo(edge,-edge);ctx.lineTo(edge,-edge+corner);
        ctx.moveTo(-edge+corner,edge);ctx.lineTo(-edge,edge);ctx.lineTo(-edge,edge-corner);
        ctx.moveTo(edge-corner,edge);ctx.lineTo(edge,edge);ctx.lineTo(edge,edge-corner);
        ctx.stroke();ctx.restore();
      };
      if(player.hp>0)drawDrones(player,stats.drones);
      drawMech(player,false);
      if(player.hp<=0)drawDowned(player,network?.role==="join"?guestReviveProgress:hostReviveProgress);
      if(performance.now()<selfShieldUntil)drawShieldCorners(player);
      if(remote){
        if(remote.hp>0)drawDrones(remote,(remoteBuildRef.current||makeBuild(remote.classId||"assault")).drones);
        drawMech(remote,true);
        if(remote.hp<=0)drawDowned(remote,network?.role==="join"?hostReviveProgress:guestReviveProgress);
        if(performance.now()<remoteShieldUntil)drawShieldCorners(remote);
        ctx.fillStyle="#c7d8d0";ctx.font="700 11px monospace";ctx.textAlign="center";ctx.fillText("队友",remote.x,remote.y-27);
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
  const currentUpgradeRerollCost = upgradeRerollPrice(wave, upgradeRerolls);
  const currentShopRerollCost = shopRerollPrice(wave, shopRerolls, coins);
  const classSelector = <div className="classGrid">
    {CLASSES.map((item) => <button key={item.id} className={selectedClass===item.id?"selected":""} onClick={()=>selectClass(item.id)}>
      <span className={mechPreviewClass(item)} style={mechPreviewStyle(item)} aria-hidden="true"/>
      <small>{item.role}</small>
      <b>{item.name}</b>
      <span><em>主技 Q</em>{item.active}</span>
      <span><em>副技 E</em>{item.secondary}</span>
      <span><em>被动</em>{item.passive}</span>
      <span><em>终极</em>{item.ultimate}</span>
    </button>)}
  </div>;

  return (
    <main className="shell" onPointerDownCapture={()=>wakeAudio()} onKeyDownCapture={()=>wakeAudio()}>
      <header className="topbar">
        <button className="brand" onClick={()=>void returnToMenu()} aria-label="返回主菜单"><span>余烬</span><b>协议</b></button>
        <div className="status"><i /> 版本 0.14.2 · 稀有强化概率调优</div>
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
        <div className="controls"><span><kbd>WASD</kbd> 移动</span><span><kbd>Q / 空格</kbd> 主技能</span><span><kbd>E</kbd> 副技能</span><span><kbd>R</kbd> 终极大招</span><span><kbd>ESC</kbd> 暂停</span></div>
      </section>}

      {view==="loadout" && <section className="loadout">
        <button className="back" onClick={()=>setView("menu")}>← 返回营地</button>
        <div className="eyebrow">FRAME SELECT · 机体整备</div>
        <h2>选择你的作战职业</h2>
        <p>每种机体至少拥有两项独立小技能和一项被动特性，进入远征后仍可通过遗物继续塑造个人流派。</p>
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
          <div className="levelBadge"><small>WAVE {wave} · ◈ {coins}</small><b>LV.{level}</b></div>
          <div className="stat right"><span>已净化</span><b>{kills}<small> 只</small></b></div>
        </div>
        <div className="canvasFrame">
          <canvas ref={canvasRef} aria-label="余烬协议游戏画面"/>
          {signalMode && <div className="syncBadge"><i /> 共享战场 · {signalMode==="host"?"队长同步":"伙伴同步"}</div>}
          {bossLootNotice && <div key={bossLootNotice} className="bossNotice">{bossLootNotice}</div>}
          {signalMode && teammateHp!==null && <div className={`teammateHealth ${teammateHp<=0?"down":""}`}>
            <span><b>队友机体</b><small>{teammateHp<=0?"已倒地":`${teammateHp}/${teammateMaxHp}`}</small></span>
            <i><em style={{width:`${clamp(teammateHp/Math.max(1,teammateMaxHp)*100,0,100)}%`}}/></i>
          </div>}
          <div className="skillDock">
            <span className={mechPreviewClass(selectedClassSpec)} style={mechPreviewStyle(selectedClassSpec)} aria-hidden="true"/>
            <div><small>{selectedClassSpec.role}</small><b>{selectedClassSpec.active}</b></div>
            <button onClick={()=>activeSkillRef.current()} disabled={skillCooldown>0||hp<=0}>{hp<=0?"倒地":skillCooldown>0?`${skillCooldown}s`:"Q · 释放"}</button>
          </div>
          <div className="skillDock secondarySkillDock">
            <span className="secondarySkillIcon" aria-hidden="true">Ⅱ</span>
            <div><small>第二战术技能</small><b>{selectedClassSpec.secondary}</b></div>
            <button onClick={()=>secondarySkillRef.current()} disabled={secondarySkillCooldown>0||hp<=0}>{hp<=0?"倒地":secondarySkillCooldown>0?`${secondarySkillCooldown}s`:"E · 释放"}</button>
          </div>
          <div className={`ultimateDock ${ultimateEnergy>=100?"ready":""}`}>
            <span className="ultimateCopy"><small>终极大招</small><b>{ULTIMATE_NAMES[selectedClass]}</b><em>{selectedClassSpec.ultimate.split("：")[1]}</em></span>
            <i><em style={{width:`${clamp(ultimateEnergy,0,100)}%`}}/></i>
            <button onClick={()=>activeUltimateRef.current()} disabled={ultimateEnergy<100||hp<=0}>{ultimateEnergy>=100?"R · 释放":`${Math.floor(ultimateEnergy)}%`}</button>
          </div>
          {hp<=0&&!paused&&<div className="downedSpectator"><b>机体倒地 · 正在观战</b><span>{rescueProgress>0?`累计施救进度 ${Math.round(rescueProgress*100)}%`:"队友靠近累计施救 2 秒即可复活你"}</span></div>}
          <div className="health"><span>{selectedClassSpec.name} · 机体完整度</span><div><i style={{width:`${clamp(hp / Math.max(1, maxHp) * 100, 0, 100)}%`}}/></div><b>{hp}/{maxHp}</b></div>
          <div className="xp"><i style={{width:`${xp}%`}}/></div>
          <div className="mobileHint">按住并拖动来移动</div>
        </div>
        <button className="quit" onClick={()=>void returnToMenu()}>结束远征</button>
        {choices && <div className="overlay">
          <div className="upgradePanel"><div className="eyebrow">个人机体强化 · 独立选择</div><h2>选择你的专属遗物</h2><p>通用、本职业、第二技能与终极强化全部参与动态稀有度抽取，仍不提供固定保底。稀有、史诗与传说强化的基础出现率已经提高，并会随波数继续增长，第 12 波达到概率上限。达到机制上限的强化会移出奖池，第二技能与终极伤害仍可无限叠加。装配完成后恢复 18% 最大生命值。</p>
            <div className="shopWallet upgradeWallet"><span>当前个人金币</span><b>◈ {coins}</b></div>
            <div className="panelVitals"><span>当前机体完整度 <b>{hp}/{maxHp}</b></span><i><em style={{width:`${clamp(hp/Math.max(1,maxHp)*100,0,100)}%`}}/></i></div>
            <div className="upgradeGrid">{choices.map((u)=><button key={u.id} className={`${u.ultimate?"ultimateUpgrade ":u.secondary?"secondaryUpgrade ":""}rarity-${u.rarity||"common"}`} onClick={()=>chooseUpgrade(u)}><small>{u.ultimate?`终极 · ${RARITY_LABELS[u.rarity||"common"]}`:u.secondary?`副技能 · ${RARITY_LABELS[u.rarity||"common"]}`:u.classId?`本职业 · ${RARITY_LABELS[u.rarity||"common"]}`:RARITY_LABELS[u.rarity||"common"]}</small><i>{u.icon}</i><b>{u.title}</b><span>{u.desc}</span></button>)}</div>
            <button className="rerollBtn" onClick={()=>rerollUpgradeRef.current()} disabled={upgradeRerolls>=MAX_UPGRADE_REROLLS||coins<currentUpgradeRerollCost}>
              {upgradeRerolls>=MAX_UPGRADE_REROLLS?"刷新次数已用尽":`◈ ${currentUpgradeRerollCost} 刷新升级 · 剩余 ${MAX_UPGRADE_REROLLS-upgradeRerolls} 次`}
            </button>
          </div>
        </div>}
        {shopItems && !choices && <div className="overlay">
          <div className="shopPanel">
            <div className="eyebrow">SUPPLY DROP · 第 {wave-1} 波后补给</div>
            <h2>战场补给站</h2>
            <p>本次补给周期共享结算 <b>◈ {supplyReward}</b>。补给站每两波出现一次；本轮再次降低全部商品、稀有度溢价和刷新费，并保证每次至少有一件当前金币买得起。</p>
            <div className="shopWallet"><span>当前个人金币</span><b>◈ {coins}</b></div>
            <div className="panelVitals"><span>当前机体完整度 <b>{hp}/{maxHp}</b></span><i><em style={{width:`${clamp(hp/Math.max(1,maxHp)*100,0,100)}%`}}/></i></div>
            <div className="shopGrid">{shopItems.map((item)=><button key={item.id} className={`shop-rarity-${item.rarity}`} onClick={()=>buyShopItemRef.current(item.id)} disabled={coins<item.cost}>
              <em>{item.category} · {RARITY_LABELS[item.rarity]}</em><i>{item.icon}</i><b>{item.title}</b><span>{item.desc}</span><small>◈ {item.cost}</small>
            </button>)}</div>
            <div className="shopActions">
              <button className="rerollBtn" onClick={()=>rerollShopRef.current()} disabled={shopRerolls>=MAX_SHOP_REROLLS||coins<currentShopRerollCost}>
                {shopRerolls>=MAX_SHOP_REROLLS?"刷新次数已用尽":`◈ ${currentShopRerollCost} 刷新商品 · 剩余 ${MAX_SHOP_REROLLS-shopRerolls} 次`}
              </button>
              <button className="primary compact" onClick={()=>finishShopRef.current()}><span>整备完成 · 继续战斗</span></button>
            </div>
          </div>
        </div>}
        {waitingSupply && !shopItems && <div className="overlay">
          <div className="pausePanel waitingUpgrade"><div className="eyebrow">补给同步</div><h2>等待伙伴完成采购</h2><p>金币只会扣除各自的钱包。双方确认后，共享战场自动继续。</p><i className="waitingPulse"/></div>
        </div>}
        {waitingPeerUpgrade && !choices && <div className="overlay">
          <div className="pausePanel waitingUpgrade"><div className="eyebrow">同步升级阶段</div><h2>等待伙伴完成选择</h2><p>你的遗物已经装配完成。伙伴选好自己的强化后，共享战场会自动继续。</p><i className="waitingPulse"/></div>
        </div>}
        {paused && !choices && !shopItems && !waitingSupply && <div className="overlay"><div className="pausePanel"><div className="eyebrow">{hp<=0?"远征终止":"火焰暂歇"}</div><h2>{hp<=0?"火种熄灭了":"游戏已暂停"}</h2><p>{hp<=0?`队伍坚持了 ${formatTime(seconds)}，共同净化了 ${kills} 只荒兽。`:signalMode==="join"?"等待队长继续远征。":"休息一下，荒原会等你。"}</p>
          {hp>0&&signalMode!=="join"&&<button className="primary compact" onClick={resumeRun}><span>全队继续</span></button>}
          {hp<=0&&signalMode!=="join"&&<button className="primary compact" onClick={restartRun}><span>全队再次点火</span></button>}
          <button className="textBtn" onClick={()=>void returnToMenu()}>返回主菜单</button></div></div>}
      </section>}
      <footer><span>EMBER PROTOCOL</span><span>失败不是终点，是配方。</span></footer>
    </main>
  );
}
