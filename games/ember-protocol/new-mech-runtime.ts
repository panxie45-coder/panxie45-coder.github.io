import type { Actor, Beam, BuildFrame, Enemy, PlayerSide, Shot } from './Game';

type Point = {x:number;y:number};
type Device = Point & {id:number;owner:PlayerSide;kind:'anchor'|'fort'|'blade'|'park'|'mirror'|'lane'|'ghost'|'shell'|'recorder';life:number;hp:number;maxHp:number;angle:number;power:number;vx:number;vy:number;age:number;back?:boolean;ultimate?:boolean;hits:number[];tick:number};
type Sample = Point & {t:number;angle?:number;power?:number;multi?:number};
type Replay = {device:number;frames:Sample[];cursor:number;time:number;duration:number;offset:Point;fixed:boolean;scale:number};
type Personal = {bio:number;shield:number;recording:number;buff:number;record:Sample[];recent:Sample[];sampleClock:number;mode:boolean};
export type NewMechId = 'weaver'|'echo'|'falcon'|'symbiote'|'prism';
export type MechanismSound = {id:number;owner:PlayerSide;mech:NewMechId;event:'primary'|'skill'|'secondary'|'ultimate'|'impact'|'special'};
type VisualKind = 'cast'|'impact'|'recall'|'scan'|'slash'|'siphon'|'heal'|'refract'|'block'|'ultimate';
type Visual = Point & {id:number;owner:PlayerSide;mech:NewMechId;kind:VisualKind;life:number;maxLife:number;size:number;angle:number;x2?:number;y2?:number};
export type MechanismFrame = {devices:Device[];visuals:Visual[];sounds:MechanismSound[];host:{bio:number;shield:number;recording:number;buff:number};guest:{bio:number;shield:number;recording:number;buff:number}};
type Context = {
  actor:(owner:PlayerSide)=>Actor|null;
  stats:(owner:PlayerSide)=>BuildFrame;
  enemies:()=>Enemy[];
  shots:()=>Shot[];
  damage:(enemy:Enemy,amount:number,owner:PlayerSide)=>void;
  beam:(beam:Beam)=>void;
  refund:(owner:PlayerSide,seconds:number)=>void;
  sound?:(sound:MechanismSound)=>void;
  width:number;height:number;
};
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
export const segmentDistance=(p:Point,a:Point,b:Point)=>{
  const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
  const t=den?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/den)):0;
  return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);
};
const fresh=():Personal=>({bio:0,shield:0,recording:0,buff:0,record:[],recent:[],sampleClock:0,mode:false});
const colors={weaver:'#ffb358',echo:'#a7baff',falcon:'#ff697f',symbiote:'#c4e878',prism:'#8dd7ff'};

/** All gameplay state here advances only on the authoritative simulation. Guests draw snapshots. */
export function createNewMechRuntime(c:Context){
  let devices:Device[]=[],replays:Replay[]=[],visuals:Visual[]=[],sounds:MechanismSound[]=[],nextId=1,nextEventId=1,lastLoadedSoundId=0,time=0;
  let people:Record<PlayerSide,Personal>={host:fresh(),guest:fresh()};
  const marks=new Map<number,Set<PlayerSide>>();
  const sideDevices=(s:PlayerSide,kind:Device['kind'])=>devices.filter(d=>d.owner===s&&d.kind===kind&&d.life>0&&d.hp>0);
  const mech=(s:PlayerSide)=>c.stats(s).classId as NewMechId;
  const sound=(s:PlayerSide,event:MechanismSound['event'])=>{
    const value={id:nextEventId++,owner:s,mech:mech(s),event};sounds.push(value);sounds=sounds.slice(-24);c.sound?.(value);
  };
  const fx=(s:PlayerSide,kind:VisualKind,p:Point,life=.45,size=64,angle=0,to?:Point)=>{
    visuals.push({id:nextEventId++,owner:s,mech:mech(s),kind,x:p.x,y:p.y,life,maxLife:life,size,angle,...(to?{x2:to.x,y2:to.y}:{})});
    if(visuals.length>120)visuals.splice(0,visuals.length-120);
  };
  const target=(p:Point)=>{
    let best:Enemy|undefined,bestScore=Infinity;
    for(const e of c.enemies())if(e.hp>0){const score=Math.max(0,distance(p,e)-e.r)*(e.kind==='boss'?.8:1);if(score<bestScore){best=e;bestScore=score;}}
    return best;
  };
  const add=(s:PlayerSide,kind:Device['kind'],p:Point,life:number,power=1,angle=0)=>{
    const d:Device={x:p.x,y:p.y,id:nextId++,owner:s,kind,life,power,angle,hp:80,maxHp:80,vx:0,vy:0,age:0,hits:[],tick:0};devices.push(d);return d;
  };
  const ray=(a:Point,b:Point,s:PlayerSide,power:number,width:number,color:string,style?:NewMechId)=>{
    c.beam({x1:a.x,y1:a.y,x2:b.x,y2:b.y,life:.3,width,color});
    for(const e of c.enemies())if(e.hp>0&&segmentDistance(e,a,b)<e.r+width){c.damage(e,power,s);if(style)fx(s,'impact',e,.3,34,Math.atan2(b.y-a.y,b.x-a.x));}
  };
  const shoot=(s:PlayerSide,p:Point,angle:number,power:number,replay=false,multi=1)=>{
    const st=c.stats(s);
    for(let i=0;i<Math.min(16,multi);i++){
      const a=angle+(i-(Math.min(16,multi)-1)/2)*.12;
      c.shots().push({x:p.x,y:p.y,vx:Math.cos(a)*st.projectileSpeed,vy:Math.sin(a)*st.projectileSpeed,r:st.projectileSize,damage:power,life:1.8,classId:st.classId,owner:s,pierce:st.bonusPierce+(st.classId==='weaver'?1:0),replay,evolution:st.weaponEvolution});
    }
  };
  const launchBlade=(s:PlayerSide,p:Point,a:number,power:number,ult=false)=>{
    const owned=sideDevices(s,'blade');if(owned.length>=32)owned[0].life=0;
    const d=add(s,'blade',p,3.8,power,a);d.vx=Math.cos(a)*530;d.vy=Math.sin(a)*530;d.ultimate=ult;return d;
  };
  const replay=(s:PlayerSide,fixed:boolean,scale:number,offset:Point={x:0,y:0},duration?:number)=>{
    const p=people[s],a=c.actor(s);if(!a||a.hp<=0)return;
    const st=c.stats(s),frames=(p.record.length?p.record:p.recent).map(f=>({...f}));
    if(!frames.some(f=>f.angle!==undefined)){
      frames.length=0;
      const e=target(a);if(!e)return;
      for(let t=0;t<3.9;t+=Math.max(.15,st.interval))frames.push({x:a.x,y:a.y,t,angle:Math.atan2(e.y-a.y,e.x-a.x),power:st.damage,multi:st.multi});
    }
    frames.sort((a,b)=>a.t-b.t);
    const start=frames[0]?.t||0;frames.forEach(f=>f.t-=start);
    const span=duration??Math.max(.8,(frames.at(-1)?.t||0)+.1);
    const d=add(s,'ghost',{x:a.x+offset.x,y:a.y+offset.y},span,scale);
    const old=sideDevices(s,'ghost');if(old.length>4)old[0].life=0;
    replays.push({device:d.id,frames,cursor:0,time:0,duration:span,offset:{x:a.x-(frames[0]?.x||a.x)+offset.x,y:a.y-(frames[0]?.y||a.y)+offset.y},fixed,scale});
  };
  const endRecord=(s:PlayerSide,fixed:boolean)=>{
    const p=people[s],st=c.stats(s);p.recording=0;
    for(const d of sideDevices(s,'recorder'))d.life=0;
    const scale=(fixed?(.65*(1+.15*st.secondaryTech)*st.secondaryPower):.65)*(st.corePath===2?(fixed?1.4:.9):(st.corePath===1&&!fixed?1.25:1))*(st.signaturePieces>=3?1.2:1)*st.systemPower;
    replay(s,fixed,scale,st.corePath===1&&!fixed?{x:60,y:0}:undefined);
    p.record=[];
  };
  const cast=(s:PlayerSide,slot:'q'|'e'|'r')=>{
    const a=c.actor(s);if(!a||a.hp<=0)return false;
    const st=c.stats(s),p=people[s],id=st.classId,e=target(a),angle=e?Math.atan2(e.y-a.y,e.x-a.x):-Math.PI/2;
    const front={x:Math.max(35,Math.min(c.width-35,a.x+Math.cos(angle)*125)),y:Math.max(35,Math.min(c.height-35,a.y+Math.sin(angle)*125))};
    const dmg=st.damage*st.systemPower;
    if(id==='weaver'){
      if(slot==='q'){
        const old=sideDevices(s,'anchor');if(old.length>=3)old[0].life=0;
        const d=add(s,'anchor',front,20,dmg);d.hp=d.maxHp=100*(1+.15*st.systemTuning)*(st.corePath===1?1.4:1);
        fx(s,'cast',front,.65,96,angle);sound(s,'skill');
      }else if(slot==='e'){
        const anchors=sideDevices(s,'anchor');
        for(const d of anchors){ray(d,a,s,dmg*3.6*st.secondaryPower*(st.corePath===2?1.6:1),18,'#ffb358','weaver');fx(s,'recall',d,.58,52,Math.atan2(a.y-d.y,a.x-d.x),a);d.life=0;
          if(st.corePath===2)for(const enemy of c.enemies())if(distance(enemy,d)<85+enemy.r)c.damage(enemy,dmg*2,s);
        }
        c.refund(s,Math.min(4,anchors.length*(.6+.5*st.secondaryTech)));sound(s,'secondary');
      }else{
        for(const d of sideDevices(s,'fort'))d.life=0;
        for(let i=0;i<3;i++){const d=add(s,'fort',a,8+st.ultimateTech,dmg*1.8*st.ultimatePower,i*Math.PI*2/3);d.hp=d.maxHp=180;d.ultimate=true;}
        fx(s,'ultimate',a,.95,155,0);sound(s,'ultimate');
      }
    }else if(id==='echo'){
      if(slot==='q'){p.record=[];p.recording=4+.5*st.systemTuning;p.sampleClock=0;for(const d of sideDevices(s,'recorder'))d.life=0;add(s,'recorder',a,p.recording);fx(s,'scan',a,.8,118,angle);sound(s,'skill');}
      else if(slot==='e'){endRecord(s,true);fx(s,'cast',a,.75,105,angle);sound(s,'secondary');}
      else {for(let i=0;i<3;i++)replay(s,false,1.35*st.ultimatePower*st.systemPower*(st.signaturePieces>=3?1.2:1),{x:Math.cos(i*Math.PI*2/3)*85,y:Math.sin(i*Math.PI*2/3)*85},5+st.ultimateTech);fx(s,'ultimate',a,1.05,175,angle);sound(s,'ultimate');}
    }else if(id==='falcon'){
      if(slot==='q'){
        for(const d of sideDevices(s,'park'))d.life=0;
        add(s,'park',front,5+(st.corePath===2?2:0),dmg*1.1*(st.corePath===2?1.4:1));fx(s,'slash',front,.58,112,angle);sound(s,'skill');
      }else if(slot==='e'){
        for(const d of [...sideDevices(s,'blade'),...sideDevices(s,'park')]){d.kind='blade';if(!d.back)d.hits=[];d.back=true;d.power*=1.3*st.secondaryPower*(1+.2*st.secondaryTech);d.life=Math.max(d.life,2);}
        fx(s,'recall',a,.55,122,angle);sound(s,'secondary');
      }else{
        for(let i=0;i<8+2*st.ultimateTech;i++){
          const t=i*Math.PI*2/(8+2*st.ultimateTech),start={x:Math.max(20,Math.min(c.width-20,a.x+Math.cos(t)*580)),y:Math.max(20,Math.min(c.height-20,a.y+Math.sin(t)*580))};
          const d=launchBlade(s,start,t,dmg*4*st.ultimatePower,true);d.back=true;d.age=-i*.1;
        }
        fx(s,'ultimate',a,1.1,220,angle);sound(s,'ultimate');
      }
    }else if(id==='symbiote'){
      if(slot==='q'){
        const cost=st.corePath===2?30:20,boost=p.bio>=cost;
        if(boost)p.bio-=cost;
        else{const hpCost=a.maxHp*.07;if(a.hp<=Math.max(1,a.maxHp*.2)+hpCost)return false;a.hp-=hpCost;}
        const power=dmg*(boost?7:4)*(st.corePath===2?1.45:1);
        shoot(s,a,angle,power,false,st.multi);
        const shot=c.shots().at(-1);if(shot){shot.r*=2;shot.pierce=4;shot.splash=72;}
        fx(s,'cast',a,.55,92,angle);sound(s,'skill');
      }else if(slot==='e'){
        const spend=Math.min(30,p.bio);p.bio-=spend;
        const heal=a.maxHp*(spend/30)*(.2+.05*st.secondaryTech)*st.secondaryPower;
        const missing=a.maxHp-a.hp;a.hp=Math.min(a.maxHp,a.hp+heal);
        p.shield=Math.min(a.maxHp*.35,p.shield+Math.max(0,heal-missing));
        if(heal>0)c.beam({x1:a.x-32,y1:a.y-35,x2:a.x,y2:a.y,life:.7,width:6,color:'#c4e878'});
        const ally=c.actor(s==='host'?'guest':'host');if(st.corePath===1&&ally&&ally.hp>0)ally.hp=Math.min(ally.maxHp,ally.hp+heal*.7);
        fx(s,'heal',a,.9,120,0,ally&&ally.hp>0?ally:undefined);sound(s,'secondary');
      }else{p.buff=9+st.ultimateTech;const d=add(s,'shell',a,p.buff,dmg);d.ultimate=true;fx(s,'ultimate',a,1.15,175,angle);sound(s,'ultimate');}
    }else if(id==='prism'){
      if(slot==='q'){
        const old=sideDevices(s,'mirror');if(old.length>=3)old[0].life=0;
        const d=add(s,'mirror',front,15,1,angle);d.hp=d.maxHp=90*(1+.2*st.systemTuning);fx(s,'cast',front,.72,112,angle);sound(s,'skill');
      }else if(slot==='e'){
        p.mode=!p.mode;for(const d of [...sideDevices(s,'mirror'),...sideDevices(s,'lane')]){d.angle=angle;d.hp=Math.min(d.maxHp,d.hp+25+15*st.secondaryTech);}
        fx(s,'refract',a,.65,135,angle);sound(s,'secondary');
      }else{
        for(const d of sideDevices(s,'lane'))d.life=0;
        for(let i=0;i<3;i++){const d=add(s,'lane',a,8+st.ultimateTech,1.2*st.ultimatePower,angle);d.vx=i;d.hp=d.maxHp=150;d.ultimate=true;}
        fx(s,'ultimate',a,1.1,205,angle);sound(s,'ultimate');
      }
    }else return false;
    return true;
  };
  const primary=(s:PlayerSide)=>{
    const a=c.actor(s);if(!a||a.hp<=0)return;
    const st=c.stats(s),p=people[s],e=target(a);if(!e)return;
    const angle=Math.atan2(e.y-a.y,e.x-a.x),damage=st.damage*(Math.random()<st.critChance?2:1);
    if(st.classId==='falcon'&&!sideDevices(s,'park').length){
      for(let i=0;i<Math.min(8,st.multi);i++)launchBlade(s,a,angle+(i-(Math.min(8,st.multi)-1)/2)*.17,damage*st.systemPower);
    }else if(st.classId==='echo'){
      for(let i=-1;i<=1;i++)shoot(s,a,angle+i*.055,damage,false,st.multi);
      const f={x:a.x,y:a.y,t:time,angle,power:damage*3,multi:st.multi};p.recent.push(f);if(p.recording>0)p.record.push({...f});
    }else shoot(s,a,angle,damage*(st.classId==='falcon'?.65:1)*(st.classId==='symbiote'&&p.buff>0?2.8*st.ultimatePower:1),false,st.multi);
    sound(s,'primary');
  };
  const markHit=(enemy:Enemy,s:PlayerSide)=>{
    if(c.stats(s).classId!=='symbiote')return;
    let owners=marks.get(enemy.id);if(!owners){owners=new Set();marks.set(enemy.id,owners);}owners.add(s);
  };
  const onKill=(enemy:Enemy)=>{
    for(const s of ['host','guest'] as const){const st=c.stats(s),a=c.actor(s);if(st.classId==='symbiote'&&a&&a.hp>0&&(marks.get(enemy.id)?.has(s)||people[s].buff>0)){people[s].bio=Math.min(100,people[s].bio+(enemy.kind==='boss'?20:enemy.elite?6:2)+st.systemTuning);fx(s,'siphon',enemy,.65,enemy.kind==='boss'?96:58,0,a);sound(s,'special');}}
    marks.delete(enemy.id);
  };
  const impactReady:Record<PlayerSide,number>={host:0,guest:0};
  const projectileImpact=(classId:string,s:PlayerSide,p:Point,angle=0,replayShot=false,refracted=false)=>{
    if(!(classId in colors))return false;
    if(time<impactReady[s])return true;
    impactReady[s]=time+.055;
    fx(s,refracted?'refract':'impact',p,replayShot ? .42 : .32,refracted?62:42,angle);
    sound(s,refracted?'special':'impact');
    return true;
  };
  const update=(dt:number)=>{
    time+=dt;
    for(const visual of visuals)visual.life-=dt;
    visuals=visuals.filter(visual=>visual.life>0);
    for(const s of ['host','guest'] as const){
      const a=c.actor(s),p=people[s],st=c.stats(s);
      if(!a||a.hp<=0){for(const d of devices)if(d.owner===s)d.life=0;p.recording=0;p.buff=0;p.shield=0;continue;}
      p.buff=Math.max(0,p.buff-dt);p.shield=Math.max(0,p.shield-dt*1.5);
      if(st.classId==='symbiote'&&st.signaturePieces>=3)p.bio=Math.min(100,p.bio+dt);
      p.recent=p.recent.filter(f=>time-f.t<6).slice(-120);
      if(p.recording>0){p.recording=Math.max(0,p.recording-dt);p.sampleClock-=dt;if(p.sampleClock<=0){p.sampleClock=.1;p.record.push({x:a.x,y:a.y,t:time});}p.record=p.record.slice(-160);if(p.recording===0)endRecord(s,false);}
    }
    for(const r of replays){
      const d=devices.find(d=>d.id===r.device);if(!d||d.life<=0)continue;
      r.time+=dt;
      while(r.cursor<r.frames.length&&r.frames[r.cursor].t<=r.time){
        const f=r.frames[r.cursor++];if(!r.fixed){d.x=Math.max(20,Math.min(c.width-20,f.x+r.offset.x));d.y=Math.max(20,Math.min(c.height-20,f.y+r.offset.y));}
        if(f.angle!==undefined)shoot(d.owner,d,f.angle,(f.power||c.stats(d.owner).damage)*r.scale,true,f.multi);
      }
      const span=Math.max(.3,(r.frames.at(-1)?.t||0)+.15);
      if(r.cursor>=r.frames.length&&r.time>=span&&d.life>span){r.cursor=0;r.time=0;}
    }
    for(const d of devices){
      d.life-=dt;d.age+=dt;d.tick-=dt;
      const a=c.actor(d.owner);if(!a||a.hp<=0||d.hp<=0||d.life<=0)continue;
      const st=c.stats(d.owner),p=people[d.owner];
      if(d.kind==='shell'){d.x=a.x;d.y=a.y;continue;}
      if(d.kind==='fort'){d.x=a.x+Math.cos(d.angle+time*.35)*90;d.y=a.y+Math.sin(d.angle+time*.35)*90;if(d.tick<=0){d.tick=.6;const e=target(d);if(e)shoot(d.owner,d,Math.atan2(e.y-d.y,e.x-d.x),d.power,false,1);}}
      if(d.kind==='lane'){const e=target(a);if(e)d.angle=Math.atan2(e.y-a.y,e.x-a.x);const f=80+d.vx*75;d.x=a.x+Math.cos(d.angle)*f;d.y=a.y+Math.sin(d.angle)*f;
        if(d.tick<=0){d.tick=.8;shoot(d.owner,d,d.angle,st.damage*d.power,false,1);}}
      if(d.kind==='anchor'){
        d.hp=Math.min(d.maxHp,d.hp+dt*(1+Math.min(st.drones,6)*.4+(st.signaturePieces>=3?2:0)));
        if(d.tick<=0){d.tick=.4;const list=sideDevices(d.owner,'anchor'),index=list.indexOf(d),next=list[index+1];
          if(next&&distance(d,next)<420*(1+.15*st.systemTuning)){
            c.beam({x1:d.x,y1:d.y,x2:next.x,y2:next.y,life:.42,width:4,color:'#ffb358'});
            let shown=false;for(const e of c.enemies())if(e.hp>0&&segmentDistance(e,d,next)<e.r+12){e.slow=Math.max(e.slow,.7);c.damage(e,d.power*.75*(st.corePath===1?1.2:1),d.owner);if(!shown){shown=true;fx(d.owner,'impact',e,.28,38,d.angle);sound(d.owner,'impact');}}
          }else if(list.length===1){const e=target(d);if(e&&distance(e,d)<150){ray(d,e,d.owner,d.power*.6,3,'#ffb358','weaver');sound(d.owner,'impact');}}
        }
        for(const e of c.enemies())if(e.hp>0&&distance(e,d)<e.r+24)d.hp-=e.hit*dt*.65;
      }
      if(d.kind==='park'){
        d.angle+=dt*8;if(d.tick<=0){d.tick=.3;let shown=false;for(const e of c.enemies())if(e.hp>0&&distance(e,d)<(68*(1+.12*st.systemTuning))+e.r){c.damage(e,d.power*.45,d.owner);if(!shown){shown=true;fx(d.owner,'slash',e,.28,58,d.angle);sound(d.owner,'impact');}}}
      }
      if(d.kind==='blade'){
        if(d.age<0)continue;
        const before={x:d.x,y:d.y};
        if(!d.back&&(d.age>.65||d.x<15||d.x>c.width-15||d.y<15||d.y>c.height-15)){d.back=true;d.hits=[];}
        if(d.back){const len=distance(a,d)||1;d.vx=(a.x-d.x)/len*650;d.vy=(a.y-d.y)/len*650;}
        d.x+=d.vx*dt;d.y+=d.vy*dt;d.angle+=dt*14;
        for(const e of c.enemies())if(e.hp>0&&!d.hits.includes(e.id)&&segmentDistance(e,before,d)<e.r+(d.ultimate?24:12)*(1+.12*st.systemTuning)){
          d.hits.push(e.id);c.damage(e,d.power*(d.back?(st.corePath===1?1.45:1)*(st.signaturePieces>=3?1.2:1):(st.corePath===1?.9:1)),d.owner);fx(d.owner,'slash',e,.3,d.ultimate?82:52,d.angle);sound(d.owner,'impact');
        }
        if(d.back&&segmentDistance(a,before,d)<a.r+12)d.life=0;
      }
      if(['mirror','lane','fort'].includes(d.kind)){
        const half=d.kind==='fort'?28:57,dx=-Math.sin(d.angle)*half,dy=Math.cos(d.angle)*half,from={x:d.x-dx,y:d.y-dy},to={x:d.x+dx,y:d.y+dy};
        // Segment-vs-segment sampling handles projectiles crossing a plate within a simulation step.
        for(const shot of c.shots()){
          if(shot.life<=0||d.hp<=0)continue;
          const prev={x:shot.x-shot.vx*dt,y:shot.y-shot.vy*dt},near=segmentDistance(shot,from,to)<shot.r+9||segmentDistance(d,prev,shot)<half;
          if(!near)continue;
          if(shot.hostile){if(shot.bossVariant||shot.enemyKind==='boss'||(shot.splash||0)>80)continue;d.hp-=Math.max(8,shot.damage);shot.life=0;fx(d.owner,'block',shot,.35,58,d.angle);sound(d.owner,'special');}
          else if(d.kind!=='fort'&&!shot.refracted){
            shot.refracted=true;const own=shot.owner===d.owner;
            const boost=(st.corePath===1&&!own?.55:st.corePath===2&&own?.5:.3)+(st.signaturePieces>=3?.1:0);
            shot.damage*=1+boost*st.systemPower;fx(d.owner,'refract',shot,.42,74,d.angle);sound(d.owner,'special');const e=target(shot);if(e){const a0=Math.atan2(e.y-shot.y,e.x-shot.x),speed=Math.hypot(shot.vx,shot.vy);shot.vx=Math.cos(a0)*speed;shot.vy=Math.sin(a0)*speed;
              if(p.mode&&c.shots().length<500){shot.damage*=.65;for(const spread of [-.22,.22])c.shots().push({...shot,vx:Math.cos(a0+spread)*speed,vy:Math.sin(a0+spread)*speed,damage:shot.damage*.3,hitIds:shot.hitIds?[...shot.hitIds]:undefined});}
            }
          }
        }
      }
    }
    devices=devices.filter(d=>d.life>0&&d.hp>0);const activeIds=new Set(devices.map(d=>d.id));replays=replays.filter(r=>activeIds.has(r.device));
    if(marks.size>c.enemies().length+32){const alive=new Set(c.enemies().map(e=>e.id));for(const id of marks.keys())if(!alive.has(id))marks.delete(id);}
  };
  const absorb=(s:PlayerSide,damage:number)=>{
    const p=people[s],a=c.actor(s),st=c.stats(s);
    const guard=st.classId==='weaver'&&st.corePath===1&&a&&sideDevices(s,'anchor').some(d=>distance(d,a)<115)?.92:1;
    const hit=Math.max(0,damage)*guard,spent=Math.min(p.shield,hit);p.shield-=spent;return hit-spent;
  };
  const status=(s:PlayerSide)=>{
    const st=c.stats(s),p=people[s];
    if(st.classId==='symbiote')return `生质 ${Math.floor(p.bio)}/100 · 临时护盾 ${Math.ceil(p.shield)}${p.buff>0?` · 蜕变 ${Math.ceil(p.buff)}s`:''}`;
    if(st.classId==='echo')return `${p.recording>0?`记录中 ${p.recording.toFixed(1)}s`:'记录待命'} · 重演体 ${sideDevices(s,'ghost').length}/4`;
    if(st.classId==='weaver')return `地锚 ${sideDevices(s,'anchor').length}/3 · 堡垒炮台 ${sideDevices(s,'fort').length}`;
    if(st.classId==='falcon')return `飞刃 ${sideDevices(s,'blade').length} · ${sideDevices(s,'park').length?'驻刃模式 / 腕炮射击':'回旋模式'}`;
    if(st.classId==='prism')return `折射板 ${sideDevices(s,'mirror').length}/3 · ${p.mode?'散射校准':'集束校准'}`;
    return '';
  };
  const snapshot=():MechanismFrame=>({devices:devices.map(d=>({...d,hits:[]})),visuals:visuals.map(v=>({...v})),sounds:sounds.map(value=>({...value})),host:{bio:people.host.bio,shield:people.host.shield,recording:people.host.recording,buff:people.host.buff},guest:{bio:people.guest.bio,shield:people.guest.shield,recording:people.guest.recording,buff:people.guest.buff}});
  const load=(f?:MechanismFrame)=>{
    if(!f)return;devices=f.devices.map(d=>({...d}));visuals=(f.visuals||[]).map(v=>({...v}));
    const unseen=(f.sounds||[]).filter(value=>value.id>lastLoadedSoundId);for(const value of (lastLoadedSoundId===0?unseen.slice(-2):unseen))c.sound?.(value);
    sounds=(f.sounds||[]).map(value=>({...value}));
    if(f.sounds?.length)lastLoadedSoundId=Math.max(lastLoadedSoundId,...f.sounds.map(value=>value.id));
    Object.assign(people.host,f.host);Object.assign(people.guest,f.guest);
  };
  const draw=(ctx:CanvasRenderingContext2D,image:(src:string)=>HTMLImageElement|null)=>{
    const polygon=(sides:number,radius:number,rotation=0)=>{ctx.beginPath();for(let i=0;i<sides;i++){const a=rotation+i*Math.PI*2/sides,x=Math.cos(a)*radius,y=Math.sin(a)*radius;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();};
    for(const d of devices){
      const st=c.stats(d.owner),id=st.classId as keyof typeof colors,im=image(`/game/${id}-kit-v1.png`);if(!im||!im.complete||!im.naturalWidth)continue;
      const w=im.naturalWidth/2,h=im.naturalHeight/2;
      const isGhost=d.kind==='ghost',isBlade=d.kind==='blade'||d.kind==='park';
      const size=isGhost?86:d.kind==='shell'?116:d.kind==='fort'?72:isBlade?(d.ultimate?72:48):68;
      ctx.save();ctx.translate(d.x,d.y);if(isBlade)ctx.rotate(d.angle);else if(d.kind==='mirror'||d.kind==='lane')ctx.rotate(d.angle);
      ctx.globalAlpha=isGhost?.48:1;
      ctx.drawImage(im,isGhost||d.kind==='blade'?0:w,isGhost?0:h,w,h,-size/2,-size/2,size,size);
      if(isGhost){ctx.strokeStyle=colors.echo;ctx.lineWidth=1;for(let y=-26;y<28;y+=9){ctx.beginPath();ctx.moveTo(-24,y);ctx.lineTo(24,y);ctx.stroke();}}
      ctx.restore();
      ctx.save();ctx.translate(d.x,d.y);ctx.globalCompositeOperation='lighter';ctx.strokeStyle=colors[id]||'#fff';ctx.shadowColor=colors[id]||'#fff';ctx.shadowBlur=12;
      if(d.kind==='anchor'){ctx.setLineDash([8,6]);ctx.lineWidth=2;polygon(6,35+d.age%1*5,d.age*.45);ctx.stroke();ctx.setLineDash([]);for(let i=0;i<3;i++){ctx.rotate(Math.PI*2/3);ctx.fillStyle='#fff2ba';ctx.fillRect(34,-2,9,4);}}
      if(d.kind==='fort'){ctx.lineWidth=3;for(let i=0;i<3;i++){ctx.rotate(Math.PI*2/3);ctx.beginPath();ctx.arc(0,0,42,d.age+i*.2,d.age+.68+i*.2);ctx.stroke();}}
      if(d.kind==='park'){ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,58,d.angle,d.angle+1.35);ctx.stroke();ctx.beginPath();ctx.arc(0,0,72,-d.angle,-d.angle+.8);ctx.stroke();}
      if(d.kind==='recorder'){ctx.lineWidth=2;ctx.setLineDash([4,7]);ctx.beginPath();ctx.arc(0,0,48+Math.sin(d.age*7)*6,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.rotate(d.age*2.4);ctx.fillStyle=colors.echo;ctx.fillRect(0,-1,62,2);}
      if(d.kind==='ghost'){ctx.globalAlpha=.36;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,45+Math.sin(d.age*9)*7,0,Math.PI*2);ctx.stroke();}
      if(d.kind==='shell'){ctx.lineWidth=3;for(let i=0;i<5;i++){const a=d.age*.9+i*Math.PI*2/5;ctx.beginPath();ctx.arc(Math.cos(a)*50,Math.sin(a)*34,12,0,Math.PI*1.5);ctx.stroke();}}
      if(d.kind==='mirror'||d.kind==='lane'){ctx.rotate(d.angle);ctx.globalAlpha=.42;ctx.fillStyle=colors.prism;ctx.fillRect(-4,-58,8,116);ctx.globalAlpha=.9;ctx.lineWidth=2;for(const offset of [-9,9]){ctx.beginPath();ctx.moveTo(offset,-58);ctx.lineTo(offset,58);ctx.stroke();}}
      ctx.restore();
      if(['anchor','mirror','lane','fort'].includes(d.kind)){ctx.fillStyle='#17222a';ctx.fillRect(d.x-21,d.y+30,42,4);ctx.fillStyle=colors[id]||'#fff';ctx.fillRect(d.x-21,d.y+30,42*Math.max(0,d.hp/d.maxHp),4);}
    }
    for(const v of visuals){
      const t=1-v.life/v.maxLife,fade=Math.max(0,1-t),color=colors[v.mech];ctx.save();ctx.translate(v.x,v.y);ctx.rotate(v.angle);ctx.globalAlpha=fade;ctx.globalCompositeOperation='lighter';ctx.strokeStyle=color;ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=18;ctx.lineWidth=3;
      if(v.x2!==undefined&&v.y2!==undefined){const dx=v.x2-v.x,dy=v.y2-v.y;ctx.rotate(-v.angle);ctx.setLineDash(v.mech==='weaver'?[10,6]:[4,7]);ctx.lineDashOffset=-t*35;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(dx,dy);ctx.stroke();ctx.setLineDash([]);ctx.rotate(v.angle);}
      if(v.mech==='weaver'){
        const r=v.size*(.25+t*.7);polygon(6,r,Math.PI/6+t);ctx.stroke();polygon(6,r*.62,-t*1.4);ctx.stroke();
        for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.fillRect(Math.cos(a)*r-5,Math.sin(a)*r-2,10,4);}
      }else if(v.mech==='echo'){
        for(let i=0;i<3;i++){ctx.globalAlpha=fade*(1-i*.22);ctx.setLineDash([12+i*3,7]);ctx.beginPath();ctx.arc((i-1)*8,0,v.size*(.22+t*.42)+i*9,t*4+i,Math.PI*1.55+t*4+i);ctx.stroke();}
        ctx.setLineDash([]);for(let i=0;i<4;i++){ctx.globalAlpha=fade*.45;ctx.fillRect(-v.size*.45+i*11,(i-1.5)*8,v.size*.7,2);}
      }else if(v.mech==='falcon'){
        const r=v.size*(.35+t*.55);for(let i=0;i<(v.kind==='ultimate'?4:2);i++){ctx.rotate(Math.PI/(v.kind==='ultimate'?2:3));ctx.lineWidth=5-i*.6;ctx.beginPath();ctx.arc(0,0,r+i*8,-1.05,.82);ctx.stroke();ctx.beginPath();ctx.moveTo(r*.4,-r*.55);ctx.lineTo(r*1.05,0);ctx.stroke();}
      }else if(v.mech==='symbiote'){
        const r=v.size*(.22+t*.48);for(let i=0;i<7;i++){const a=i*Math.PI*2/7+t*.8;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.25,Math.sin(a)*r*.25);ctx.quadraticCurveTo(Math.cos(a+.55)*r*.8,Math.sin(a+.55)*r*.8,Math.cos(a)*r,Math.sin(a)*r);ctx.stroke();}
        ctx.globalAlpha=fade*.28;ctx.beginPath();ctx.arc(0,0,r*.68,0,Math.PI*2);ctx.fill();if(v.kind==='heal'){ctx.globalAlpha=fade;ctx.fillStyle='#edffd2';ctx.fillRect(-4,-22,8,44);ctx.fillRect(-22,-4,44,8);}
      }else{
        const r=v.size*(.28+t*.55);for(let i=0;i<3;i++){ctx.rotate(Math.PI/6+i*.34);polygon(4,r-i*9,Math.PI/4);ctx.stroke();}
        if(v.kind==='refract'||v.kind==='ultimate'){for(let i=-2;i<=2;i++){ctx.strokeStyle=['#ff6b91','#ffd86b','#8dffcb','#78c8ff','#c39bff'][i+2];ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(i*.2)*r*1.25,Math.sin(i*.2)*r*1.25);ctx.stroke();}}
      }
      ctx.restore();
    }
  };
  return {cast,primary,projectileImpact,update,markHit,onKill,absorb,snapshot,load,draw,status,reset:()=>{devices=[];replays=[];visuals=[];sounds=[];people={host:fresh(),guest:fresh()};marks.clear();time=0;nextId=1;nextEventId=1;lastLoadedSoundId=0;impactReady.host=0;impactReady.guest=0;}};
}
