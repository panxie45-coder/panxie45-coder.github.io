import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewMechRuntime } from '../new-mech-runtime.ts';

function fixture(host='weaver',guest='symbiote'){
  const actors={host:{x:400,y:400,r:18,hp:120,maxHp:120,classId:host},guest:{x:600,y:400,r:18,hp:120,maxHp:120,classId:guest}};
  const build=id=>({classId:id,maxHp:120,damage:40,systemPower:1,systemTuning:0,secondaryTech:0,ultimateTech:0,secondaryPower:1,ultimatePower:1,corePath:0,signaturePieces:0,multi:1,projectileSize:7,projectileSpeed:600,bonusPierce:0,critChance:0,interval:.6,drones:1,weaponEvolution:0});
  const stats={host:build(host),guest:build(guest)},enemies=[],shots=[],hits=[],beams=[],refunds=[];
  const ctx={actor:s=>actors[s],stats:s=>stats[s],enemies:()=>enemies,shots:()=>shots,damage:(e,n,s)=>{hits.push({id:e.id,n,s});e.hp-=n;},beam:b=>beams.push(b),refund:(s,n)=>refunds.push({s,n}),width:1600,height:900};
  const r=createNewMechRuntime(ctx);
  const enemy=(id,x,y,kind='runner')=>{const e={id,x,y,r:22,hp:100000,maxHp:100000,kind,elite:false,hit:20,slow:0};enemies.push(e);return e;};
  return {actors,stats,enemies,shots,hits,beams,refunds,r,enemy,step:(seconds)=>{for(let t=0;t<seconds;t+=.02)r.update(.02);}};
}
test('weaver enforces three anchors, connects and recalls them, reset removes all devices',()=>{
  const f=fixture();f.enemy(1,800,400);
  for(let i=0;i<5;i++){f.actors.host.y=250+i*60;f.r.cast('host','q');}
  f.step(.05);
  assert.equal(f.r.snapshot().devices.filter(d=>d.kind==='anchor').length,3);
  assert.ok(f.beams.length>0);
  f.r.cast('host','e');f.step(.05);assert.equal(f.r.snapshot().devices.length,0);assert.ok(f.refunds[0].n<=4);
  f.r.cast('host','r');assert.equal(f.r.snapshot().devices.length,3);f.r.reset();assert.equal(f.r.snapshot().devices.length,0);
});
test('echo replays are finite, owner-attributed and never recursively recorded',()=>{
  const f=fixture('echo');f.enemy(1,800,400);f.r.cast('host','q');
  for(let i=0;i<8;i++){f.r.primary('host');f.actors.host.x+=10;f.step(.5);}
  f.step(.1);assert.ok(f.r.snapshot().devices.some(d=>d.kind==='ghost'));
  f.step(4);assert.ok(f.shots.some(s=>s.replay&&s.owner==='host'));
  f.r.cast('host','r');assert.ok(f.r.snapshot().devices.filter(d=>d.life>0).length<=4);
  f.step(12);assert.equal(f.r.snapshot().devices.length,0);
});
test('falcon hits a boss once on outbound and once on return, steering follows player',()=>{
  const f=fixture('falcon');f.enemy(1,570,400,'boss');f.r.primary('host');f.step(2);
  assert.equal(f.hits.filter(h=>h.id===1).length,2);
  f.r.cast('host','q');f.step(.05);f.r.cast('host','e');f.actors.host.y=480;f.step(2);
  assert.equal(f.r.snapshot().devices.length,0);
  f.r.cast('host','r');assert.equal(f.r.snapshot().devices.length,8);
});
test('symbiote resources are separate and safe HP cost never kills or revives',()=>{
  const f=fixture('symbiote','symbiote');const e=f.enemy(1,700,400);f.r.markHit(e,'guest');f.r.onKill(e);
  assert.equal(f.r.snapshot().host.bio,0);assert.equal(f.r.snapshot().guest.bio,2);
  f.actors.host.hp=20;assert.equal(f.r.cast('host','q'),false);assert.equal(f.actors.host.hp,20);
  for(let i=0;i<20;i++){const e=f.enemy(i+2,700,400);f.r.markHit(e,'guest');f.r.onKill(e);}
  f.r.cast('guest','e');assert.ok(f.r.snapshot().guest.shield>0);
  assert.ok(f.r.absorb('guest',10)<10);
  f.actors.host.hp=0;assert.equal(f.r.cast('host','e'),false);assert.equal(f.actors.host.hp,0);
});
test('prism buffs each projectile once, absorbs finite ordinary shots, excludes boss shots',()=>{
  const f=fixture('prism');f.enemy(1,900,400);f.r.cast('host','q');const d=f.r.snapshot().devices[0];
  const shot={x:d.x,y:d.y,vx:600,vy:0,r:5,damage:10,life:2,owner:'guest'};f.shots.push(shot);f.step(.05);
  assert.equal(shot.damage,13);f.step(.05);assert.equal(shot.damage,13);
  const boss={...shot,hostile:true,enemyKind:'boss',damage:100,life:2};f.shots.push(boss);f.step(.05);assert.equal(boss.life,2);
  f.shots.push({...shot,hostile:true,damage:100,life:2});f.step(.05);assert.equal(f.r.snapshot().devices.length,0);
});
test('world snapshot roundtrip keeps both owners, dead owner devices are removed',()=>{
  const f=fixture('weaver','prism');f.r.cast('host','r');f.r.cast('guest','q');
  const mirror=fixture('weaver','prism');mirror.r.load(JSON.parse(JSON.stringify(f.r.snapshot())));
  assert.deepEqual(mirror.r.snapshot(),f.r.snapshot());
  f.actors.host.hp=0;f.step(.1);assert.equal(f.r.snapshot().devices.filter(d=>d.owner==='host').length,0);assert.ok(f.r.snapshot().devices.some(d=>d.owner==='guest'));
});
