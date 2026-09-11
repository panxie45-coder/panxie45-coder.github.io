import type { ClassSpec, Upgrade, SignatureSet, CombatStats } from './Game';

export const NEW_IDS = ['weaver', 'echo', 'falcon', 'symbiote', 'prism'] as const;
export type NewClassId = typeof NEW_IDS[number];
export const isNewMech = (id?: string): id is NewClassId => NEW_IDS.includes(id as NewClassId);
export const newAsset = (id: string) => `/game/${id}-kit-v1.png`;
export const NEW_CLASSES: ClassSpec[] = [
  {id:'weaver',name:'织垒型',role:'地锚战线工程',active:'部署地锚：连接电网，最多三个锚点',secondary:'战线回收：锚点沿路径切割，返还部分主技能冷却',passive:'铆钉穿甲：被电网拦截的敌人额外受伤；施工蜂维修锚点',ultimate:'移动堡垒：锚点展开为移动炮阵，拦截弹幕并交替射击',cooldown:5,secondaryCooldown:9,color:'#ffb358',sprite:0,sheet:'innovator',radius:23,renderSize:94},
  {id:'echo',name:'回响型',role:'录制攻击与重演',active:'战斗记录：记录四秒移动和主炮，随后残影重放',secondary:'剪辑重放：结束记录，残影定点重放；无记录时重放最近片段',passive:'脉冲点射：三连发；记录蝶发射校准脉冲',ultimate:'三重奏：三个残影从不同位置重演最近的攻击',cooldown:12,secondaryCooldown:10,color:'#9ca4ff',sprite:0,sheet:'innovator',radius:16,renderSize:86},
  {id:'falcon',name:'裂隼型',role:'回旋飞刃操控',active:'驻刃：前方布置旋刃，驻刃期间切换腕炮',secondary:'强制召回：飞刃返回机体，沿途切割；走位改变回程',passive:'回旋刃：主武器往返分别命中；刃翼无人机投掷小飞刀',ultimate:'猎场切割：重刃从战场边缘分批返回机体',cooldown:8,secondaryCooldown:6,color:'#f06c78',sprite:0,sheet:'innovator',radius:18,renderSize:90},
  {id:'symbiote',name:'契生型',role:'生质管理与蜕变',active:'催化射击：消耗20生质强化射击；不足时有限消耗生命',secondary:'紧急回输：消耗生质修复，满血转临时护盾',passive:'培养弹：标记目标死亡获得生质，个人储量上限100',ultimate:'完全蜕变：展开外骨骼强化主炮，持续吸收战场样本',cooldown:8,secondaryCooldown:11,color:'#b7d67b',sprite:0,sheet:'innovator',radius:24,renderSize:98},
  {id:'prism',name:'棱航型',role:'弹道折射与支援',active:'立起折射板：放置可强化友弹并有限拦截敌弹的板',secondary:'翻面校准：切换集束/散射，恢复部分板体耐久',passive:'折射弹：每颗友弹最多被强化一次；棱镜翼发射晶体弹',ultimate:'折射航道：移动板阵引导友弹，并拦截普通弹幕',cooldown:7,secondaryCooldown:9,color:'#70bfff',sprite:0,sheet:'innovator',radius:17,renderSize:88},
];
export const NEW_BUILDS: Record<NewClassId, Partial<CombatStats> & {maxHp:number}> = {
  weaver:{maxHp:138,damage:42,interval:.64,speed:232,damageReduction:.1,projectileSize:7},
  echo:{maxHp:108,damage:22,interval:.72,speed:280,projectileSpeed:740},
  falcon:{maxHp:122,damage:38,interval:.78,speed:292,projectileSize:9},
  symbiote:{maxHp:150,damage:44,interval:.66,speed:238,projectileSize:8},
  prism:{maxHp:112,damage:36,interval:.48,speed:278,projectileSpeed:720},
};
const upgrade=(id:NewClassId,suffix:string,title:string,desc:string,rarity:Upgrade['rarity']='rare'):Upgrade=>({id:`${id}-${suffix}`,classId:id,title,desc,rarity,icon:NEW_CLASSES.find(c=>c.id===id)?.role==='地锚战线工程'?'▣':'✧'});
export const NEW_UPGRADES = Object.fromEntries(NEW_IDS.map(id=>[id,[
  upgrade(id,'system-power', {weaver:'高压锚芯',echo:'清晰采样',falcon:'回刃淬火',symbiote:'催化腺体',prism:'精密镀膜'}[id], '本职业主技能与特殊武器伤害 +24%'),
  upgrade(id,'system-tuning',{weaver:'战线延伸',echo:'记忆缓存',falcon:'宽刃切割',symbiote:'高效采样',prism:'加固镜架'}[id],{weaver:'电网连接距离与地锚耐久 +15%，最多3次',echo:'记录与重演时长 +0.5秒，最多3次',falcon:'回旋刃尺寸与驻刃范围 +12%，最多3次',symbiote:'每次样本吸收额外 +1生质，最多3次',prism:'折射板耐久 +20%，最多3次'}[id]),
  upgrade(id,'system-weapon','专属主炮校准','基础攻击伤害 +20%，弹体尺寸 +1.5'),
]])) as Record<NewClassId,Upgrade[]>;
export const NEW_SECONDARY = Object.fromEntries(NEW_IDS.map(id=>[id,[
  {...upgrade(id,'secondary-power','副技能增幅','副技能伤害/回输强度 +28%'),secondary:true},
  {...upgrade(id,'secondary-tech','副技精修',{weaver:'回收冷却返还额外 +0.5秒，最多2次',echo:'定点重演伤害 +15%，最多2次',falcon:'召回伤害 +20%，最多2次',symbiote:'回输额外治疗 5% 最大生命，最多2次',prism:'翻面额外恢复15点板体耐久，最多2次'}[id],'epic'),secondary:true},
]])) as Record<NewClassId,Upgrade[]>;
export const NEW_ULTIMATES = Object.fromEntries(NEW_IDS.map(id=>[id,[
  {...upgrade(id,'ultimate-power','终极输出增幅','终极技能伤害 +25%，可持续叠加','epic'),ultimate:true},
  {...upgrade(id,'ultimate-tech',{weaver:'堡垒续航',echo:'重演延展',falcon:'猎场增刃',symbiote:'稳定蜕变',prism:'航道延展'}[id],{weaver:'移动堡垒持续 +1秒，最多3次',echo:'三重奏重演时长 +1秒，最多3次',falcon:'大招追加2把重刃，最多3次',symbiote:'完全蜕变持续 +1秒，最多3次',prism:'折射航道持续 +1秒，最多3次'}[id],'legendary'),ultimate:true},
]])) as Record<NewClassId,Upgrade[]>;
const paths:Record<NewClassId,[string,string,string,string]>={
 weaver:['封锁工程','电网伤害+20%、耐久+40%，靠近锚点获得8%减伤','拆迁工程','回收切割伤害+60%，回收落点额外爆破'],
 echo:['游击回声','移动残影伤害+25%，重演轨迹偏移形成交叉射击','定点合奏','定点残影伤害+40%，移动残影伤害降低10%'],
 falcon:['双程猎杀','返回飞刃伤害+45%，去程伤害降低10%','盘踞猎场','驻刃伤害+40%、持续时间+2秒'],
 symbiote:['战地医师','回输同时治疗队友，治疗量为自身的70%','极限催化','催化消耗提高到30生质，强化弹伤害+45%'],
 prism:['协同校准','队友折射弹强化提高至55%，自身为30%','独奏炮阵','自身折射强化提高至50%，队友保持30%'],
};
export const NEW_CORES=Object.fromEntries(NEW_IDS.map(id=>[id,[0,1].map(i=>({...upgrade(id,`core-${i+1}`,paths[id][i*2],paths[id][i*2+1],'legendary'),id:`core-${id}-${i+1}`,core:true}))])) as Record<NewClassId,[Upgrade,Upgrade]>;
export const NEW_SETS=Object.fromEntries(NEW_IDS.map(id=>[id,{name:{weaver:'锚定工厂',echo:'永续乐章',falcon:'归巢猎翼',symbiote:'共生契约',prism:'万向光谱'}[id],icon:'◈',tiers:['专属系统伤害 +12%','主炮伤害 +8%，无人机伤害 +12%',{weaver:'地锚每秒恢复额外2点耐久',echo:'所有残影伤害额外 +20%',falcon:'回程飞刃伤害额外 +20%',symbiote:'生质每秒自然恢复1点',prism:'折射强化额外 +10%'}[id]]}])) as Record<NewClassId,SignatureSet>;
export const NEW_ULT_NAMES={weaver:'移动堡垒',echo:'三重奏',falcon:'猎场切割',symbiote:'完全蜕变',prism:'折射航道'};
export const NEW_CHARGE={weaver:.48,echo:.5,falcon:.58,symbiote:.48,prism:.55};
export const NEW_EVOLUTIONS=Object.fromEntries(NEW_IDS.map(id=>[id,['高频模组','重型模组']])) as Record<NewClassId,[string,string]>;
