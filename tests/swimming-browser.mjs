// Complete the lesson through real keyboard/CDP touch input. No browser /src imports or forced lesson state.
// BASE=http://127.0.0.1:5851 node tests/swimming-browser.mjs --quality=low,medium --out=.tools/swimming-prod
// Without BASE/GAME_URL, starts an isolated Vite dev server on 5856. --only=desktop|phone|story; --shots=0; --story=0.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stateAt } from './e2e/fastforward.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const BASE=process.env.BASE||process.env.GAME_URL||'http://127.0.0.1:5856/';
const OUT=path.resolve(ROOT,args.out||'.tools/swimming-dev');mkdirSync(OUT,{recursive:true});
const only=args.only?.split('-');
const shots=args.shots!=='0',qualities=only?.[1]?[only[1]]:(args.quality||'low,medium').split(','),devices=only?.[0]==='story'?[]:only?[only[0]]:['desktop','phone'];
const results=[],failures=[],t0=Date.now();
const log=(...s)=>console.log(`[${Math.round((Date.now()-t0)/1000)}s]`,...s);
const check=(ok,message)=>{if(!ok){failures.push(message);log('FAIL',message);}};
let server=null,browser=null;

if(!(await fetch(BASE).then(r=>r.ok,()=>false))) {
  assert(!process.env.BASE&&!process.env.GAME_URL,'The supplied preview server must already be running');
  server=spawn(process.execPath,[path.join(ROOT,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5856','--strictPort'],{cwd:ROOT,windowsHide:true,stdio:'pipe',env:{...process.env,NO_HMR:'1'}});
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Dev server did not start')),30000);
    const seen=b=>{if(/ready|Local/.test(String(b))){clearTimeout(timer);resolve();}};
    server.stdout.on('data',seen);server.stderr.on('data',seen);server.on('exit',code=>{clearTimeout(timer);reject(new Error(`Dev server exited ${code}`));});
  });
}

const STATE=()=>{
  const g=window.__STARLINE__,d=g?.director,r=d?.tricks?.round,dbg=r?.ctx?.debug,L=dbg?.lesson,p=g?.player;
  const snap=dbg?.snapshot;
  // Where the swimmer is heading on this leg: the red ring going out, the gold-edged exit steps (the rules' exit) coming back.
  const pool=g?.scene.getObjectByName('swimming-practice'),marker=L?.stage==='glide'?pool?.getObjectByName('swim-target'):pool?.getObjectByName('swim-exit');
  let destination=null;
  if(marker){const at=marker.getWorldPosition(g.camera.position.clone());if(L?.stage!=='glide')at.set(dbg.pool.x+L.exit.x,dbg.pool.waterY,dbg.pool.z+L.exit.z);
    const v=at.project(g.camera),panel=document.querySelector('#swimLesson .lesson')?.getBoundingClientRect();
    destination={x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2,z:v.z,panelBottom:panel?.bottom,width:innerWidth,height:innerHeight};}
  return {ready:!!window.__STARLINE_READY__,playing:!!window.__STARLINE_PLAYING__,busy:d?.busy||0,dialogue:!!g?.ui.dialogueOpen,
    round:r?.id,phase:dbg?.phase,exitCheck:dbg?.exitCheck,entered:dbg?.entered,climbed:dbg?.climbed,local:dbg?.local,pool:dbg?.pool,
    stage:L?.stage,stageIndex:L?.stageIndex,time:L?.time,roundT:r?.ctx?.t,held:L?.held,needsRelease:L?.needsRelease,holdTime:L?.holdTime,airTime:L?.airTime,
    floatMode:L?.floatMode,floatBack:L?.floatBack,floatFront:L?.floatFront,lastStroke:L?.lastStroke,rules:L?.rules,cycles:L?.cycles,
    position:L?.position,exit:L?.exit,speed:L?.speed,skills:L?.skills,retries:L?.retries,complete:L?.complete,sculls:L?.sculls,
    snap,clip:p?.anim?.currentName,pose:p?.pose,pitch:p?.pitch,playerY:p?.pos.y,paused:!!g?.paused,pointerHeld:dbg?.pointerHeld,
    inputMove:g?.input.move,touchMove:g?.input.touch?.move,inputAct:g?.input.held('act'),
    resultVisible:!!document.querySelector('#trickCard:not(.hidden)'),record:d?.q?.state?.tricks?.swimming||null,destination,
    menuRunning:!!d?.minigameMenu?.running,look:{season:g?.shownSeason,hour:g?.shownHour(),timeOverride:g?.timeOverride??null},
    left:!!g?.scene.getObjectByName('swimming-practice'),ownUpdate:!!p&&Object.hasOwn(p,'update'),
    instructions:document.querySelector('#swimLesson .instruction')?.textContent,cue:document.querySelector('#swimLesson .cue')?.textContent};
};
const RESTORE=()=>{
  const g=window.__STARLINE__,d=g.director,p=g.player;
  return {player:[p.pos.x,p.pos.y,p.pos.z,p.facing].map(v=>+v.toFixed(3)),ownUpdate:Object.hasOwn(p,'update'),pose:p.pose??null,
    fov:g.follow.fovBase,season:g.seasonOverride??null,hour:g.timeOverride??null,cycle:g.cycleHour??null,
    swimming:!!p.swimming,locked:!!p.locked,round:d.tricks.round?.id??null,left:!!g.scene.getObjectByName('swimming-practice'),
    ui:!!document.getElementById('swimLesson'),sign:d.tricks.signs.find(s=>s.t.id==='swimming')?.hidden??false,
    save:JSON.parse(localStorage.getItem('starline-save-explore')||'null')?.quest?.tricks?.swimming??null};
};

class Session {
  constructor(device,quality,name){Object.assign(this,{device,quality,name});this.heldKeys=new Set();this.touchPoints=false;this.lastAct=false;this.lastMove=false;this.errors=[];this.samples=[];this.lastPhase='';}
  async boot(query='',save=null){
    const phone=this.device==='phone';this.context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1280,height:720},hasTouch:phone,isMobile:phone,deviceScaleFactor:phone?2:1});
    if(save)await this.context.addInitScript(s=>{if(!localStorage.getItem('starline-save-1')){localStorage.setItem('starline-save-1',s);localStorage.setItem('starline-last-slot','1');}},save);
    this.page=await this.context.newPage();this.page.on('pageerror',e=>this.errors.push(e.message));
    this.page.on('console',m=>{if(m.type()==='error'&&!/favicon|404|Failed to load resource/.test(m.text()))this.errors.push(m.text());});
    await this.page.goto(`${BASE}${BASE.includes('?')?'&':'?'}qa=1&mute=1&live=1&lang=${args.lang||'en'}&quality=${this.quality}&${query}`);
    await this.page.waitForFunction(()=>window.__STARLINE_READY__,null,{timeout:180000});return this;
  }
  hit(sel){return this.device==='phone'?this.page.tap(sel):this.page.click(sel);}
  read(){return this.page.evaluate(STATE);}
  async shot(name){if(shots)await this.page.screenshot({path:path.join(OUT,`${this.name}-${name}.png`)});}
  async choose(door){
    await this.hit(door);await this.page.waitForSelector('#mgPicker:not(.hidden)');
    for(const c of await this.page.evaluate(()=>[...document.querySelectorAll('.mg-tab')].map(e=>e.dataset.cat))){await this.hit(`.mg-tab[data-cat="${c}"]`);if(await this.page.$('.mg-card[data-id="trick:swimming"]'))break;}
    await this.page.locator('.mg-card[data-id="trick:swimming"]').scrollIntoViewIfNeeded();await this.hit('.mg-card[data-id="trick:swimming"]');
    for(let i=0;i<140;i++){const s=await this.read();if(s.phase==='check')return;if(s.dialogue)await this.page.keyboard.press('KeyE');await this.page.waitForTimeout(200);}
    throw new Error(`Lesson failed to open ${JSON.stringify(await this.read())}`);
  }
  async input({act=false,mx=0,mv=0}={}){
    if(this.device==='desktop'){
      const keys=new Set([...(act?['KeyE']:[]),...(mx>.08?['KeyD']:mx<-.08?['KeyA']:[]),...(mv>.08?['KeyS']:mv<-.08?['KeyW']:[])]);
      for(const k of this.heldKeys)if(!keys.has(k))await this.page.keyboard.up(k);
      for(const k of keys)if(!this.heldKeys.has(k))await this.page.keyboard.down(k);
      this.heldKeys=keys;return;
    }
    this.cdp??=await this.context.newCDPSession(this.page);
    const moving=Math.hypot(mx,mv)>.08,changed=act!==this.lastAct||moving!==this.lastMove;
    if(changed&&this.touchPoints){await this.cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});this.touchPoints=false;}
    let button=null;
    if(act){const b=await this.page.locator('#swimLesson .act').boundingBox();assert(b,'Action button is visible');button={id:2,x:b.x+b.width/2,y:b.y+b.height/2};}
    const origin={id:1,x:72,y:690},stick={...origin,x:origin.x+mx*56,y:origin.y+mv*56},points=[...(moving?[stick]:[]),...(button?[button]:[])];
    if(points.length&&!this.touchPoints){
      // A person establishes the joystick finger before touching Action. A simultaneous initial CDP batch can route
      // both changed touches to the button and never deliver the canvas's joystick start.
      if(moving){await this.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});await this.cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[stick]});
        if(button)await this.page.waitForFunction(()=>Math.hypot(window.__STARLINE__.input.move.x,window.__STARLINE__.input.move.y)>.5,null,{timeout:2000,polling:'raf'});}
      if(button)await this.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});
      this.touchPoints=true;
    }
    if(points.length)await this.cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points});
    this.lastAct=act;this.lastMove=moving;
  }
  async release(){await this.input();}
  async pauseCheck(){
    await this.release();if(this.device==='phone')await this.hit('#btnMenu');else await this.page.keyboard.press('Escape');
    await this.page.waitForFunction(()=>window.__STARLINE__.paused,null,{timeout:5000});
    const before=await this.read();await this.page.waitForTimeout(1100);const after=await this.read();
    check(before.time===after.time,`${this.name}: pause freezes lesson time`);check(before.phase===after.phase,`${this.name}: pause preserves stage`);
    await this.shot('paused');await this.hit('#btnResume');await this.page.waitForFunction(()=>!window.__STARLINE__.paused);
  }
  async leave(){await this.release();if(this.device==='phone')await this.hit('#swimLesson .leave');else await this.page.keyboard.press('Backspace');
    await this.page.waitForFunction(()=>!window.__STARLINE__.director.tricks.round&&!window.__STARLINE__.director.minigameMenu.running,null,{timeout:30000});await this.page.waitForTimeout(500);}
  async complete(){
    const seen=new Set(),captured=new Set(),start=Date.now();let bubblesTested=false,paused=false,stageLog='',exitReleased=false;
    while(Date.now()-start<300000){
      const s=await this.read();
      if(s.resultVisible){await this.release();await this.shot('result');return {seen:[...seen],result:s,elapsed:Date.now()-start};}
      assert(s.round==='swimming',`Round still owns the lesson ${JSON.stringify(s)}`);
      const current=s.phase==='lesson'?s.stage:s.phase;seen.add(current);
      if(current!==stageLog){stageLog=current;log(this.name,current,`skills=${s.skills||0}`);}
      if(s.stage==='glide'&&s.snap.phaseTime>15&&s.lastStroke===null)throw new Error(`No travel stroke after real movement/action input ${JSON.stringify({move:s.inputMove,touch:s.touchMove,act:s.pointerHeld,feedback:s.snap.feedback,position:s.position})}`);
      let action={};
      if(s.phase==='check')action={mx:s.local.x<-.15?1:0,act:Math.abs(s.local.x)<.2};
      else if(s.phase==='entry')action={mv:s.local.z>s.pool.entryZ+.15?-1:0,act:s.local.z<=s.pool.entryZ+.2};
      else if(s.phase==='out'){
        if(!exitReleased){
          await this.release();
          // An actual released frame must precede the ordinary second press; never force the runtime's edge state.
          await this.page.waitForFunction(t=>{const g=window.__STARLINE__,r=g.director.tricks.round;return r?.ctx?.t>t+.03&&!g.input.held('act')&&!r.ctx.debug.pointerHeld;},s.roundT,{timeout:5000,polling:25});
          this.samples.push({name:'exit-action-release',state:await this.read()});exitReleased=true;continue;
        }
        action={act:true};
      }
      else if(s.phase==='lesson'){
        if(s.needsRelease)action={};
        else if(s.stage==='bubbles'){
          if(!paused){await this.pauseCheck();paused=true;continue;}
          if(!bubblesTested){
            await this.input({act:true});await this.page.waitForFunction(()=>window.__STARLINE__.director.tricks.round.ctx.debug.lesson.holdTime>3.25,null,{timeout:12000});
            const held=await this.read();check(held.cycles===0&&!held.snap.bubbles,`${this.name}: continuous hold cannot earn bubbles and Mika comes upright`);
            await this.shot('overlong-hold-recovery');await this.release();await this.page.waitForTimeout(1000);bubblesTested=true;continue;
          }
          action={act:s.held?s.holdTime<1.6:s.airTime>=s.rules.air};
        }else if(s.stage==='float'){
          action={act:s.floatMode==='back'?s.floatBack<s.pool.floatSeconds-1e-6:s.floatMode==='front'?s.held?s.holdTime<2:s.airTime>=s.rules.air:!s.held};
        }else if(s.stage==='turn'){
          const dx=s.exit.x-s.position.x,dz=s.exit.z-s.position.z,d=Math.hypot(dx,dz);action={mx:dx/d,mv:dz/d};
        }else{
          const act=!s.held&&(s.lastStroke===null||s.time-s.lastStroke>=s.rules.beat-.05);
          if(s.stage==='tread')action={act};
          else{const target=s.stage==='glide'?s.pool.glide:s.exit,dx=target.x-s.position.x,dz=target.z-s.position.z,d=Math.hypot(dx,dz);action={act,mx:dx/d,mv:dz/d};}
        }
      }
      await this.input(action);
      const capture=s.phase==='lesson'&&s.stage==='bubbles'&&s.snap.bubbles&&s.holdTime>.45?'bubbles'
        :s.phase==='lesson'&&s.stage==='float'&&s.snap.floatSide==='back'&&s.floatBack>1?'back-float'
        :s.phase==='lesson'&&s.stage==='float'&&s.snap.floatSide==='front'&&s.holdTime>.45?'front-float'
        :s.phase==='lesson'&&s.stage==='tread'&&s.sculls>=2?'tread'
        :s.phase==='lesson'&&s.stage==='glide'&&s.snap.progress>.35?'glide'
        :s.phase==='lesson'&&s.stage==='turn'&&s.snap.progress>.35?'turn'
        :s.phase==='lesson'&&s.stage==='swim'&&s.snap.progress>.3?'return'
        :s.phase==='climbing'?'climbing'
        :s.phase==='done'?'dry-exit':null;
      if(capture&&!captured.has(capture)){
        await this.shot(capture);captured.add(capture);this.samples.push({name:capture,state:s});
        if(['glide','return'].includes(capture)){const m=s.destination;check(m&&m.z>-1&&m.z<1&&m.x>0&&m.x<m.width&&m.y>m.panelBottom+5&&m.y<m.height-65,`${this.name}: the ${capture} destination (red ring / gold exit steps) is on screen below the instructions`);}
      }
      if(s.phase==='done')check(s.climbed&&s.playerY>=s.pool.deckY-.02,`${this.name}: final exit is on the dry deck`);
      await this.page.waitForTimeout(85);
    }
    throw new Error(`Complete lesson timed out ${JSON.stringify(await this.read())}`);
  }
  async close(){await this.release().catch(()=>{});await this.context.close();}
}

async function lessonCase(device,quality){
  const name=`${device}-${quality}`,s=new Session(device,quality,name);let row={name};
  try{
    await s.boot();await s.choose('#btnTitleMini');await s.page.waitForTimeout(500);await s.shot('exit-check');
    const idle=await s.read();await s.page.waitForTimeout(1500);const idleAfter=await s.read();
    check(idleAfter.phase==='check'&&!idleAfter.exitCheck&&idleAfter.skills===0,`${name}: idle does not identify exit or complete a skill`);
    check(idleAfter.local.x===idle.local.x&&idleAfter.local.z===idle.local.z,`${name}: pool does not drift with river physics`);
    const layout=await s.page.evaluate(()=>{
      const box=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom};};
      const a=document.querySelector('#swimLesson .act'),l=document.querySelector('#swimLesson .lesson'),f=document.querySelector('#swimLesson .safe');
      return {act:box(a),lesson:box(l),safe:box(f),vw:innerWidth,vh:innerHeight,safety:f.textContent,quality:window.__STARLINE__.renderer.qualityName};
    });
    for(const key of ['act','lesson','safe']){const b=layout[key];check(b.x>=0&&b.right<=layout.vw+.5&&b.y>=0&&b.bottom<=layout.vh+.5,`${name}: ${key} remains on screen`);}
    check(layout.act.w>=48&&layout.act.h>=48,`${name}: Action has a usable touch target`);
    const played=await s.complete();row={...row,layout,played,samples:s.samples};
    for(const stage of ['check','entry','bubbles','float','tread','glide','turn','swim','out','climbing','done'])check(played.seen.includes(stage),`${name}: real inputs visit ${stage}`);
    const rec=played.result.record;check(rec?.plays===1&&rec.best>=60&&rec.stars>=1,`${name}: completed practice awards and records a real play`);
    await s.hit('#trickCard .done');await s.page.waitForFunction(()=>!window.__STARLINE__.director.minigameMenu.running&&!window.__STARLINE__.director.tricks.round,null,{timeout:30000});await s.page.waitForTimeout(600);
    const restored=await s.page.evaluate(RESTORE);row.restored=restored;
    check(!restored.ownUpdate&&!restored.left&&!restored.ui&&!restored.sign&&!restored.swimming&&!restored.locked,`${name}: completion releases controller/pool/UI/sign/pose ownership`);
    check(restored.save?.plays===1&&restored.save?.best===rec.best,`${name}: Explore save persists swimming best and play count`);
    // Reload through the real title picker. The stored best survives; quitting the next lesson never adds a completed play.
    await s.page.reload();await s.page.waitForFunction(()=>window.__STARLINE_READY__,null,{timeout:180000});await s.choose('#btnTitleMini');
    const repeat=await s.read();check(repeat.record?.plays===1&&repeat.record?.best===rec.best,`${name}: reload retains the swimming record`);
    await s.leave();const quit=await s.page.evaluate(RESTORE);row.quit=quit;
    check(!quit.ownUpdate&&!quit.left&&!quit.ui&&!quit.sign&&!quit.locked,`${name}: Leave restores original player controller and removes the pool`);
    check(quit.save?.plays===1&&quit.save?.best===rec.best,`${name}: leaving does not add a completed play`);
    await s.shot('after-quit');check(s.errors.length===0,`${name}: no runtime errors ${s.errors.join('; ')}`);row.errors=s.errors;results.push(row);log(name,'passed');
  }catch(e){failures.push(`${name}: ${e.stack||e}`);await s.shot('failure').catch(()=>{});row.failed=String(e);row.state=await s.read().catch(()=>null);row.errors=s.errors;results.push(row);log(name,'FAILED',String(e));}
  finally{await s.close().catch(()=>{});}
}

async function storyCase(){
  const s=new Session('desktop',qualities[0],'story-return'),quest=stateAt('c1.cogs','alone','grandma');
  const save=JSON.stringify({v:1,quest,player:{x:-40,y:3,z:20,facing:3.1},at:1760000000000});
  try{
    await s.boot('start=continue',save);await s.page.waitForFunction(()=>window.__STARLINE_PLAYING__,null,{timeout:120000});
    for(let i=0;i<80;i++){const a=await s.read();if(!a.busy&&!a.dialogue)break;if(a.dialogue)await s.page.keyboard.press('KeyE');await s.page.waitForTimeout(150);}
    await s.page.waitForTimeout(600);
    const snapshot=()=>s.page.evaluate(()=>{const g=window.__STARLINE__,d=g.director,p=g.player;return{save:localStorage.getItem('starline-save-1'),step:d.q.state.step,story:d.q.state.story,pos:[p.pos.x,p.pos.y,p.pos.z,p.facing].map(v=>+v.toFixed(3)),season:g.seasonOverride??null,hour:g.timeOverride??null,tourLock:!!d.tourLock,explore:!!d.explore,interior:g.interiors.active,roomVisible:g.interiors.active?g.interiors.rooms.get(g.interiors.active).root.visible:false,zoom:g.follow.zoomTarget,outdoorZoom:g.interiors.savedZoom??null};});
    const cases=[];
    for(const room of [null,'cottage']){
      if(room){await s.page.evaluate(async id=>{const g=window.__STARLINE__;g.follow.zoomTarget=8;await g.interiors.enter(id);g.follow.zoomTarget=3.7;},room);await s.page.waitForTimeout(500);}
      const before=await snapshot();await s.page.keyboard.press('Escape');await s.page.waitForSelector('#btnPauseMini');await s.choose('#btnPauseMini');await s.shot(`borrowed-pool-${room||'outside'}`);await s.leave();const after=await snapshot();
      check(JSON.stringify(before)===JSON.stringify(after),`story-return (${room||'outside'}): pause-menu lesson leaves story save/progress/player/room/camera unchanged`);
      await s.shot(`restored-${room||'outside'}`);cases.push({room,before,after});
    }
    const restored=await s.page.evaluate(RESTORE);check(!restored.left&&!restored.ui&&!restored.ownUpdate,'story-return: no practice resources/controller remain');
    check(!s.errors.length,`story-return: no runtime errors ${s.errors.join('; ')}`);results.push({name:'story-return',cases,restored,errors:s.errors});log('story-return','passed');
  }catch(e){failures.push(`story-return: ${e.stack||e}`);await s.shot('failure').catch(()=>{});results.push({name:'story-return',failed:String(e),state:await s.read().catch(()=>null),errors:s.errors});}
  finally{await s.close().catch(()=>{});}
}

try{
  browser=await chromium.launch({headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--mute-audio']});
  for(const device of devices)for(const quality of qualities)await lessonCase(device,quality);
  if(args.story!=='0')await storyCase();
}finally{
  await browser?.close();server?.kill();writeFileSync(path.join(OUT,'results.json'),JSON.stringify({base:BASE,failures,results},null,2));
}
log(failures.length?failures.join('\n'):'All swimming browser checks passed');process.exitCode=failures.length?1:0;
