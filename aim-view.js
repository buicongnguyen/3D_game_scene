import {magnifierCrop} from './easy-play.js';

export function createAimView({canvas,document,walker,onAim,onClose,onShoot,now=()=>performance.now()}){
  const panel=document.createElement('section');panel.id='aimView';panel.hidden=true;
  panel.setAttribute('aria-label','Magnified aiming view');
  panel.innerHTML='<strong>Drag to aim · 3×</strong><canvas id="aimCanvas" width="360" height="220" aria-label="Drag to adjust aim"></canvas><div id="aimStatus" role="status">Find a rabbit</div><button id="aimShoot">Shoot</button><button id="aimClose">Close · Esc</button>';
  document.body.append(panel);
  const view=panel.querySelector('#aimCanvas'),context=view.getContext('2d'),status=panel.querySelector('#aimStatus');
  const controls=document.createElement('div');controls.id='huntControls';controls.hidden=true;
  controls.innerHTML='<button id="huntFire" aria-label="Fire at aimed target">Fire</button><button id="huntAim" aria-label="Hold and drag to aim with magnifier">Hold Aim · 3×</button>';
  document.body.append(controls);
  const holdButton=controls.querySelector('#huntAim'),fireButton=controls.querySelector('#huntFire');
  let opened=false,u=.5,v=.5,pointer=null,lastX=0,lastY=0,start=null;
  const clearMovement=()=>{walker.vel.set(0,0,0);};
  function close(){start=null;opened=false;panel.hidden=true;walker.aiming=false;pointer=null;clearMovement();document.documentElement.classList.toggle('aiming',false);onClose?.();}
  function open(x,y){
    const rect=canvas.getBoundingClientRect();u=Math.max(0,Math.min(1,(x-rect.left)/rect.width));v=Math.max(0,Math.min(1,(y-rect.top)/rect.height));
    opened=true;panel.hidden=false;walker.aiming=true;clearMovement();document.documentElement.classList.toggle('aiming',true);onAim(u,v);
  }
  const available=()=>walker.easyPlay&&!walker.cinematic&&walker.gameActive;
  function begin(e,button=false){
    if(!available()||start||(!button&&e.button!==2))return;
    // Preserve compatibility mouse events for right-button + left-button chords.
    if(button||e.pointerType==='touch')e.preventDefault();const r=canvas.getBoundingClientRect();
    start={id:e.pointerId,time:now(),x:button?r.left+r.width/2:e.clientX,y:button?r.top+r.height/2:e.clientY,button,lastX:e.clientX,lastY:e.clientY};
    (button?holdButton:canvas).setPointerCapture?.(e.pointerId);
  }
  function move(e){
    if(!start||start.id!==e.pointerId)return;
    if(opened){const r=canvas.getBoundingClientRect();
      u=Math.max(0,Math.min(1,u+(e.clientX-start.lastX)/r.width*.65));
      v=Math.max(0,Math.min(1,v+(e.clientY-start.lastY)/r.height*.65));onAim(u,v);
    }
    start.lastX=e.clientX;start.lastY=e.clientY;
  }
  function end(e){if(start&&start.id===e.pointerId)close();}
  canvas.addEventListener('pointerdown',e=>begin(e));
  holdButton.addEventListener('pointerdown',e=>begin(e,true));
  for(const element of [canvas,holdButton]){
    element.addEventListener('pointermove',move);
    for(const event of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(event,end);
  }
  canvas.addEventListener('contextmenu',e=>{if(available())e.preventDefault();});
  // Mouse button chords do not always dispatch a second pointerdown.
  canvas.addEventListener('mousedown',e=>{if(e.button===0&&opened){e.preventDefault();onShoot();}});
  canvas.addEventListener('mouseup',e=>{if(e.button===2)close();});
  fireButton.onclick=()=>{if(opened)onShoot();};
  view.addEventListener('pointerdown',e=>{if(pointer!==null)return;e.preventDefault();pointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;view.setPointerCapture(pointer);});
  view.addEventListener('pointermove',e=>{
    if(pointer!==e.pointerId)return;
    const rect=view.getBoundingClientRect(),crop=magnifierCrop(canvas.width,canvas.height,u,v,360/220,rect.width,canvas.getBoundingClientRect().width);
    u=Math.max(0,Math.min(1,u+(e.clientX-lastX)/rect.width*crop.w/canvas.width));
    v=Math.max(0,Math.min(1,v+(e.clientY-lastY)/rect.height*crop.h/canvas.height));
    lastX=e.clientX;lastY=e.clientY;onAim(u,v);
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])view.addEventListener(event,e=>{if(e.pointerId===pointer)pointer=null;});
  panel.querySelector('#aimClose').onclick=close;
  panel.querySelector('#aimShoot').onclick=onShoot;
  return {close,get opened(){return opened;},get active(){return opened||!!start;},
    render(ready){
      controls.hidden=!available();
      if(!available()){if(start||opened)close();return;}
      if(start&&!opened&&now()-start.time>=180)open(start.x,start.y);
      fireButton.disabled=!opened||!ready;
      if(!opened)return;
      const c=magnifierCrop(canvas.width,canvas.height,u,v,360/220,view.getBoundingClientRect().width,canvas.getBoundingClientRect().width),w=view.width,h=view.height;
      context.drawImage(canvas,c.x,c.y,c.w,c.h,0,0,w,h);
      const x=(c.cx-c.x)/c.w*w,y=(c.cy-c.y)/c.h*h;
      context.strokeStyle=ready?'#7aff99':'white';context.lineWidth=2;context.beginPath();context.arc(x,y,12,0,Math.PI*2);context.moveTo(x-18,y);context.lineTo(x+18,y);context.moveTo(x,y-18);context.lineTo(x,y+18);context.stroke();
      status.textContent=ready?'Rabbit in range — clear shot':'No clear target · drag to search';
      panel.querySelector('#aimShoot').disabled=!ready;
    }
  };
}
