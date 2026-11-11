(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const ui = {
    battle: document.getElementById('battleUI'), battleTitle: document.getElementById('battleTitle'),
    enemyName: document.getElementById('enemyName'), enemyHp: document.getElementById('enemyHpBar'),
    battleLog: document.getElementById('battleLog'), hpBar: document.getElementById('hpBar'), hpTrail: document.getElementById('hpTrail'), hpText: document.getElementById('hpText'),
    toast: document.getElementById('toast'), win: document.getElementById('winCard'), winMessage: document.getElementById('winMessage'),
    defeated: document.getElementById('defeatedCount'), progress: document.getElementById('progressBar'), quest: document.getElementById('questText'),
    location: document.getElementById('locationName'), snack: document.getElementById('snackCount'), hint: document.getElementById('controlsHint')
  };
  const COLS = 22, ROWS = 16, TILE = 48;
  const map = Array.from({length: ROWS}, (_, y) => Array.from({length: COLS}, (_, x) => (x === 0 || y === 0 || x === COLS-1 || y === ROWS-1) ? 1 : 0));
  // Old stone ribs and pillars make landmarks without blocking the main walking paths.
  [[5,2],[5,3],[5,4],[5,5],[5,6],[9,8],[9,9],[9,10],[14,2],[14,3],[14,4],[18,8],[18,9],[18,10],[3,12],[4,12],[5,12],[12,12],[13,12]].forEach(([x,y]) => map[y][x]=1);
  const hero = {x:2,y:2,hp:32,maxHp:32,shownHp:32,trailHp:32,level:3,xp:0};
  const foes = [
    {x:8,y:4,name:'Moss Mumbler',hp:21,maxHp:21,damage:5,kind:0,defeated:false,flavor:'A mossy little thing hums a song you almost remember.'},
    {x:12,y:9,name:'Puddle Specter',hp:27,maxHp:27,damage:6,kind:1,defeated:false,flavor:'A puddle stands up and gives you a shy wave.'},
    {x:18,y:5,name:'Moonlit Moth',hp:34,maxHp:34,damage:7,kind:2,defeated:false,flavor:'A moonlit moth flutters in place, guarding the deeper dark.'}
  ];
  const props = [{x:3,y:10,type:'flower'},{x:19,y:12,type:'exit'}];
  let activeFoe=null, mode='explore', busy=false, guarding=false, snacks=1, defeated=0, stepCooldown=0, anim=0, encounterFlash=0, soundOn=false, audio=null, toastTimer=0, lastTime=0, moveInterval=null;
  let W=800,H=500,DPR=1;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function resize(){const r=canvas.getBoundingClientRect();DPR=Math.min(devicePixelRatio||1,2);W=r.width;H=r.height;canvas.width=Math.round(W*DPR);canvas.height=Math.round(H*DPR);ctx.setTransform(DPR,0,0,DPR,0,0)}
  new ResizeObserver(resize).observe(canvas); resize();
  function ping(freq=440,duration=.08,type='sine'){if(!soundOn)return;try{audio ||= new (window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.055,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration)}catch(_){}}
  function showToast(text){ui.toast.textContent=text;ui.toast.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>ui.toast.classList.add('hidden'),1800)}
  function addText(text){ui.battleLog.textContent=text}
  function updateHud(){ui.hpBar.style.width=`${Math.max(0,hero.hp/hero.maxHp*100)}%`;ui.hpTrail.style.width=`${Math.max(0,hero.trailHp/hero.maxHp*100)}%`;ui.hpText.textContent=`${Math.max(0,Math.ceil(hero.hp))} / ${hero.maxHp}`;ui.snack.textContent=`${snacks} mooncake${snacks===1?'':'s'}`;ui.defeated.textContent=defeated;ui.progress.style.width=`${defeated/3*100}%`;}
  function startBattle(foe){activeFoe=foe;mode='enter';busy=true;encounterFlash=1;ui.battleTitle.textContent=`${foe.name} draws near!`;ui.enemyName.textContent=foe.name;ui.enemyHp.style.width='100%';ui.battle.classList.remove('hidden');ui.hint.classList.add('hidden');addText(foe.flavor);ping(180,.18,'triangle');setTimeout(()=>{if(mode==='enter'){mode='battle';busy=false;addText(`${foe.name} is watching you carefully.`)}},720)}
  function fleeBattle(){mode='explore';activeFoe=null;busy=false;guarding=false;ui.battle.classList.add('hidden');ui.hint.classList.remove('hidden')}
  function updateEnemyBar(){if(activeFoe)ui.enemyHp.style.width=`${Math.max(0,activeFoe.hp/activeFoe.maxHp*100)}%`}
  function handleAction(action){if(mode!=='battle'||busy)return;busy=true;let foe=activeFoe;const say=(t)=>addText(t);
    if(action==='fight'){
      const damage=9+Math.floor(Math.random()*7);say('June takes a steady breath...');ping(520,.09);setTimeout(()=>{if(mode!=='battle')return;foe.hp=Math.max(0,foe.hp-damage);updateEnemyBar();say(`A bright little bonk! ${foe.name} takes ${damage} damage.`);ping(760,.12,'triangle');if(foe.hp<=0)setTimeout(winBattle,600);else setTimeout(enemyTurn,700)},430);return;
    }
    if(action==='act'){
      const choices=[`June tells ${foe.name} about the very small cloud she saw.`,`June offers ${foe.name} a shy, wobbly wave.`,`June hums back. The tune fits perfectly.`];
      say(choices[Math.floor(Math.random()*choices.length)]);foe.hp=Math.max(0,foe.hp-7);updateEnemyBar();ping(620,.16,'sine');if(foe.hp<=0){setTimeout(winBattle,650);return}setTimeout(enemyTurn,700);return;
    }
    if(action==='guard'){
      guarding=true;const healed=Math.min(4,hero.maxHp-hero.hp);hero.hp+=healed;hero.trailHp=Math.max(hero.trailHp,hero.hp);updateHud();say(`June holds still and listens. ${healed?`She finds ${healed} HP in the quiet.`:'June feels a little steadier.'}`);ping(380,.2,'sine');setTimeout(enemyTurn,750);return;
    }
    if(action==='item'){
      if(snacks<=0){say('The little bag is empty. The mooncake wrapper smells nice, though.');busy=false;return}
      snacks--;const healed=Math.min(13,hero.maxHp-hero.hp);hero.hp+=healed;hero.trailHp=Math.max(hero.trailHp,hero.hp);updateHud();say(`Mooncake! It tastes like cinnamon and ${healed} HP.`);ping(660,.25,'sine');setTimeout(enemyTurn,700);return;
    }
  }
  function enemyTurn(){if(mode!=='battle')return;const damage=Math.max(1,activeFoe.damage-(guarding?4:0));guarding=false;hero.hp=Math.max(0,hero.hp-damage);updateHud();addText(`${activeFoe.name} bumps June for ${damage} damage!`);ping(145,.13,'square');busy=false;if(hero.hp<=0){busy=true;setTimeout(()=>{hero.hp=18;hero.trailHp=18;updateHud();addText('June catches her breath. Some kind light brings her back.');busy=false;ping(320,.3,'sine')},850)}}
  function winBattle(){if(mode!=='battle')return;activeFoe.hp=0;updateEnemyBar();activeFoe.defeated=true;defeated++;hero.xp+=12;hero.hp=Math.min(hero.maxHp,hero.hp+5);hero.trailHp=Math.max(hero.trailHp,hero.hp);updateHud();mode='victory';busy=true;addText(`${activeFoe.name} dissolves into a happy little glow.`);ping(880,.3,'triangle');setTimeout(()=>{ui.winMessage.textContent=defeated===3?'The humming has become a song. Something bright is waiting by the far door.':'You found 5 HP and a little more courage.';ui.win.classList.remove('hidden')},750)}
  document.getElementById('continueBtn').addEventListener('click',()=>{ui.win.classList.add('hidden');fleeBattle();if(defeated===3){ui.quest.textContent='Follow the humming to the little door';showToast('The exit is glowing at the far end!');}else if(defeated===1){ui.quest.textContent='Find two more catacomb friends';snacks=Math.min(2,snacks+1);updateHud()}});
  document.getElementById('actionGrid').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)handleAction(b.dataset.action)});
  function canWalk(x,y){return x>0&&x<COLS-1&&y>0&&y<ROWS-1&&!map[y][x]}
  function move(dx,dy){if(mode!=='explore'||stepCooldown>0)return;const x=hero.x+dx,y=hero.y+dy;if(!canWalk(x,y)){ping(95,.04,'triangle');return}hero.x=x;hero.y=y;stepCooldown=.13;ping(210+Math.random()*90,.035,'sine');const foe=foes.find(f=>!f.defeated&&f.x===x&&f.y===y);if(foe){startBattle(foe);return}const prop=props.find(p=>p.x===x&&p.y===y);if(prop?.type==='flower'){showToast('A lantern flower! It leaves a mooncake in your pocket.');props.splice(props.indexOf(prop),1);snacks++;updateHud()}if(prop?.type==='exit'){if(defeated===3){mode='ending';ui.winMessage.textContent='You followed the song all the way home.';ui.win.querySelector('small').textContent='THE HUMMING WAS YOU ALL ALONG';ui.win.querySelector('h2').textContent='The end (for now).';ui.win.classList.remove('hidden');ui.battle.classList.add('hidden')}else showToast('The little door is sealed. The humming has three voices.')}}
  function interact(){if(mode!=='explore')return;const flower=props.find(p=>p.type==='flower'&&Math.abs(p.x-hero.x)+Math.abs(p.y-hero.y)<=1);const exit=props.find(p=>p.type==='exit'&&Math.abs(p.x-hero.x)+Math.abs(p.y-hero.y)<=1);if(flower){showToast('A lantern flower glows softly. Step onto it for a mooncake.');return}if(exit){if(defeated===3){showToast('The door opens to a sky full of stars.');move(hero.x<exit.x?1:-1,0)}else showToast('The door hums: “Three little voices first.”');return}showToast('The stones hum under your feet. Keep wandering.');}
  const dirs={ArrowUp:[0,-1],w:[0,-1],W:[0,-1],ArrowDown:[0,1],s:[0,1],S:[0,1],ArrowLeft:[-1,0],a:[-1,0],A:[-1,0],ArrowRight:[1,0],d:[1,0],D:[1,0]};
  window.addEventListener('keydown',e=>{if(dirs[e.key]){e.preventDefault();move(...dirs[e.key])}else if(e.key==='e'||e.key===' '){e.preventDefault();interact()}else if(['1','2','3','4'].includes(e.key))handleAction(['fight','act','guard','item'][Number(e.key)-1])});
  document.querySelectorAll('.pad[data-dir]').forEach(btn=>{const mapDir={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};const begin=e=>{e.preventDefault();btn.setPointerCapture?.(e.pointerId);move(...mapDir[btn.dataset.dir]);clearInterval(moveInterval);moveInterval=setInterval(()=>move(...mapDir[btn.dataset.dir]),190)};const end=()=>clearInterval(moveInterval);btn.addEventListener('pointerdown',begin);btn.addEventListener('pointerup',end);btn.addEventListener('pointercancel',end);btn.addEventListener('lostpointercapture',end)});
  document.getElementById('interactBtn').addEventListener('click',interact);
  document.getElementById('soundToggle').addEventListener('click',()=>{soundOn=!soundOn;document.getElementById('soundState').textContent=soundOn?'ON':'OFF';if(soundOn){ping(540,.1);if(audio?.state==='suspended')audio.resume()}});
  function roundRect(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.stroke()}}
  function drawWorld(t){ctx.clearRect(0,0,W,H);const tile=Math.min(W/11,H/8.2);
    const cx=clamp(W/2-(hero.x+.5)*tile,W-COLS*tile,0);const cy=clamp(H/2-(hero.y+.5)*tile,H-ROWS*tile,0);
    // draw the whole dungeon through a camera transform; use scale to fit a generous visible region
    const scale=tile/TILE;ctx.save();ctx.translate(cx,cy);ctx.scale(scale,scale);
    const left=clamp(Math.floor(-cx/tile)-1,0,COLS-1),right=clamp(Math.ceil((W-cx)/tile)+1,0,COLS-1),top=clamp(Math.floor(-cy/tile)-1,0,ROWS-1),bottom=clamp(Math.ceil((H-cy)/tile)+1,0,ROWS-1);
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){const px=x*TILE,py=y*TILE;if(map[y][x]){drawWall(px,py,x,y,t)}else drawFloor(px,py,x,y,t)}
    // glowing cracks in the old floor
    for(let i=0;i<14;i++){const x=((i*137+34)%COLS)*TILE,y=((i*79+22)%ROWS)*TILE;ctx.strokeStyle=`rgba(118,210,177,${.06+.04*Math.sin(t*.001+i)})`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+8,y+30);ctx.lineTo(x+15,y+25);ctx.lineTo(x+20,y+34);ctx.stroke()}
    props.forEach(p=>{if(p.type==='flower')drawFlower(p.x*TILE+24,p.y*TILE+24,t);else drawDoor(p.x*TILE+24,p.y*TILE+24,t)});
    foes.filter(f=>!f.defeated).forEach(f=>drawFoe(f.x*TILE+24,f.y*TILE+25,f.kind,t,0.82));
    drawHero(hero.x*TILE+24,hero.y*TILE+24,t,0.82);
    // tiny floating motes
    for(let i=0;i<19;i++){const x=((i*179+t*.012*(i%3+1))%(COLS*TILE)),y=((i*103+Math.sin(t*.0008+i)*25)%(ROWS*TILE));ctx.fillStyle=`rgba(205,247,205,${.18+.15*Math.sin(t*.002+i)})`;ctx.beginPath();ctx.arc(x,y,1.3+(i%3)*.4,0,Math.PI*2);ctx.fill()}
    ctx.restore();
    const shade=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.18,W/2,H/2,Math.max(W,H)*.78);shade.addColorStop(0,'#09091900');shade.addColorStop(1,'#08071999');ctx.fillStyle=shade;ctx.fillRect(0,0,W,H);
  }
  function drawFloor(x,y,gx,gy,t){ctx.fillStyle=(gx+gy)%2?'#34334b':'#303047';ctx.fillRect(x,y,TILE,TILE);ctx.fillStyle='#414058';ctx.fillRect(x+1,y+1,TILE-2,TILE-2);ctx.strokeStyle='#25243a';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,TILE-1,TILE-1);ctx.fillStyle='#5b596b';ctx.globalAlpha=.35;ctx.fillRect(x+8+(gx*7%25),y+9+(gy*11%24),2,2);ctx.fillRect(x+33-(gy*3%13),y+34-(gx*5%14),2,2);ctx.globalAlpha=1;if((gx*3+gy*5)%9===0){ctx.strokeStyle='#807c8a';ctx.globalAlpha=.18;ctx.beginPath();ctx.moveTo(x+9,y+33);ctx.lineTo(x+18,y+28);ctx.lineTo(x+21,y+35);ctx.stroke();ctx.globalAlpha=1}}
  function drawWall(x,y,gx,gy,t){ctx.fillStyle='#211f37';ctx.fillRect(x,y,TILE,TILE);ctx.fillStyle='#4b465f';ctx.fillRect(x+1,y+2,TILE-2,TILE-4);ctx.fillStyle='#69617a';ctx.fillRect(x+3,y+1,TILE-6,5);ctx.fillStyle='#37334d';ctx.fillRect(x+4,y+11,TILE-8,TILE-14);ctx.fillStyle='#817587';ctx.globalAlpha=.3;ctx.fillRect(x+7,y+8+(gy%3)*3,2,2);ctx.globalAlpha=1;ctx.strokeStyle='#17162a';ctx.strokeRect(x+.5,y+.5,TILE-1,TILE-1);if((gx+gy)%3===0){ctx.fillStyle='#729078';ctx.globalAlpha=.7;ctx.fillRect(x+8,y+3,8,2);ctx.fillRect(x+31,y+4,6,2);ctx.globalAlpha=1}}
  function drawHero(x,y,t,s=1){ctx.save();ctx.translate(x,y+Math.sin(t*.006)*1.5);ctx.scale(s,s);ctx.fillStyle='#151226';ctx.beginPath();ctx.ellipse(0,16,14,5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#bf986f';ctx.fillRect(-10,-2,20,19);ctx.fillStyle='#e7bc8d';ctx.fillRect(-9,-7,18,14);ctx.fillStyle='#43335e';ctx.fillRect(-11,-9,22,6);ctx.fillStyle='#f3cf96';ctx.fillRect(-8,-16,16,13);ctx.fillStyle='#754c4c';ctx.fillRect(-7,-17,14,5);ctx.fillStyle='#24203a';ctx.fillRect(-5,-10,2,3);ctx.fillRect(3,-10,2,3);ctx.fillStyle='#e99086';ctx.fillRect(-2,-5,4,1);ctx.fillStyle='#789c83';ctx.fillRect(-12,1,24,10);ctx.fillStyle='#f0c98e';ctx.fillRect(-13,10,6,5);ctx.fillRect(7,10,6,5);ctx.fillStyle='#ebcc9d';ctx.fillRect(-9,16,7,3);ctx.fillRect(3,16,7,3);ctx.restore()}
  function drawFoe(x,y,kind,t,s=1){ctx.save();ctx.translate(x,y+Math.sin(t*.004+x)*3);ctx.scale(s,s);ctx.fillStyle='#18142d70';ctx.beginPath();ctx.ellipse(0,18,21,6,0,0,Math.PI*2);ctx.fill();if(kind===0){ctx.fillStyle='#80b993';ctx.beginPath();ctx.ellipse(0,1,18,17,.15,0,Math.PI*2);ctx.fill();ctx.fillStyle='#add9a2';ctx.beginPath();ctx.ellipse(-3,-8,13,9,-.3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f4d991';ctx.beginPath();ctx.arc(-5,-1,2,0,7);ctx.arc(5,-1,2,0,7);ctx.fill();ctx.fillStyle='#537b70';ctx.fillRect(-3,6,6,2);ctx.fillStyle='#adc68f';ctx.fillRect(-15,-18,8,7);ctx.fillRect(5,-19,8,8)}else if(kind===1){ctx.fillStyle='#8c8ed1';ctx.beginPath();ctx.moveTo(-17,9);ctx.quadraticCurveTo(-24,-12,0,-18);ctx.quadraticCurveTo(23,-11,17,8);ctx.quadraticCurveTo(9,18,0,13);ctx.closePath();ctx.fill();ctx.fillStyle='#c2b9ec';ctx.beginPath();ctx.ellipse(-3,-8,10,6,-.2,0,7);ctx.fill();ctx.fillStyle='#fff0bb';ctx.beginPath();ctx.arc(-6,-1,2.2,0,7);ctx.arc(6,-1,2.2,0,7);ctx.fill();ctx.fillStyle='#8c8ed1';ctx.fillRect(-9,9,5,9);ctx.fillRect(5,9,5,9)}else{ctx.fillStyle='#eca4bc';ctx.beginPath();ctx.ellipse(0,0,8,17,0,0,7);ctx.fill();ctx.fillStyle='#ffdbb0';ctx.beginPath();ctx.ellipse(0,-10,7,8,0,0,7);ctx.fill();ctx.fillStyle='#e88fae';ctx.beginPath();ctx.ellipse(-14,-4,9,14,-.6,0,7);ctx.ellipse(14,-4,9,14,.6,0,7);ctx.fill();ctx.fillStyle='#ffefc2';ctx.fillRect(-3,-12,2,2);ctx.fillRect(2,-12,2,2);ctx.strokeStyle='#ffe1b3';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-3,-17);ctx.quadraticCurveTo(-9,-25,-7,-29);ctx.moveTo(3,-17);ctx.quadraticCurveTo(9,-25,7,-29);ctx.stroke()}ctx.restore()}
  function drawFlower(x,y,t){ctx.save();ctx.translate(x,y);ctx.fillStyle='#d9e8a4';ctx.fillRect(-1,0,2,15);ctx.fillStyle='#b8e3ac';ctx.fillRect(-6,7,5,3);ctx.fillRect(1,10,5,3);for(let i=0;i<6;i++){ctx.save();ctx.rotate(i*Math.PI/3+t*.0005);ctx.fillStyle='#f5cbff';ctx.beginPath();ctx.ellipse(0,-7,4,7,0,0,7);ctx.fill();ctx.restore()}ctx.fillStyle='#fff3ac';ctx.beginPath();ctx.arc(0,0,4+Math.sin(t*.005),0,7);ctx.fill();ctx.restore()}
  function drawDoor(x,y,t){ctx.save();ctx.translate(x,y);ctx.fillStyle='#17152a';ctx.beginPath();ctx.roundRect(-14,-22,28,44,14);ctx.fill();ctx.strokeStyle='#a89be5';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-12,-20,24,39,12);ctx.stroke();ctx.fillStyle=`rgba(197,171,255,${.4+.25*Math.sin(t*.004)})`;ctx.beginPath();ctx.arc(0,-2,6,0,7);ctx.fill();ctx.restore()}
  function drawBattle(t){const time=t*.0003;const grad=ctx.createLinearGradient(0,0,W,H);grad.addColorStop(0,'#321a64');grad.addColorStop(.4,'#8145a0');grad.addColorStop(.72,'#e78296');grad.addColorStop(1,'#392b73');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
    // shifting color fields create a dreamy, ever-changing battle stage
    for(let layer=0;layer<5;layer++){const cx=W*(.18+layer*.17)+Math.sin(time*(1+layer*.16)+layer)*W*.10,cy=H*(.4+Math.cos(time+layer)*.18),r=Math.min(W,H)*(.3+layer*.035);const g=ctx.createRadialGradient(cx,cy,1,cx,cy,r);const hue=(layer*67+Math.floor(t*.018))%360;g.addColorStop(0,`hsla(${hue},90%,72%,.44)`);g.addColorStop(1,`hsla(${(hue+80)%360},80%,47%,0)`);ctx.fillStyle=g;ctx.fillRect(0,0,W,H)}
    // concentric shifting portals
    const mx=W*.52+Math.sin(time*1.3)*W*.05,my=H*.49+Math.cos(time)*H*.04;ctx.save();ctx.translate(mx,my);ctx.rotate(time*.7);for(let i=0;i<13;i++){const r=Math.min(W,H)*(.14+i*.055);ctx.beginPath();ctx.ellipse(0,0,r,r*.49,Math.sin(time+i)*.15,0,Math.PI*2);ctx.strokeStyle=`hsla(${(i*38+t*.035)%360},95%,82%,${.5-i*.025})`;ctx.lineWidth=1+(i%3);ctx.stroke()}ctx.restore();
    // flowing wave ribbons
    for(let row=0;row<8;row++){ctx.beginPath();for(let x=0;x<=W+10;x+=12){const y=H*(.16+row*.085)+Math.sin(x*.012+time*3+row*.7)*H*.045+Math.sin(x*.004-time*2+row)*H*.035;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.strokeStyle=`hsla(${(row*45+t*.03)%360},90%,83%,.29)`;ctx.lineWidth=1.5;ctx.stroke()}
    for(let i=0;i<34;i++){const x=(i*89+t*.025*(i%4+1))%(W+10),y=(i*57+Math.sin(t*.001+i)*19)%H;ctx.fillStyle=`hsla(${(i*47+t*.05)%360},100%,90%,${.4+.4*Math.sin(t*.002+i)})`;ctx.beginPath();ctx.arc(x,y,1+(i%3),0,7);ctx.fill()}
    const foe=activeFoe;if(foe){const enemyX=W*.64,enemyY=H*.49,scale=Math.min(W,H)*.012*(1+.025*Math.sin(t*.005));ctx.save();ctx.translate(enemyX,enemyY);ctx.shadowBlur=30;ctx.shadowColor='#fff4ff77';drawFoe(0,0,foe.kind,t,scale);ctx.restore();drawHero(W*.31,H*.58+Math.sin(t*.004)*2,t,Math.min(W,H)*.0085)}
    if(mode==='enter'){ctx.fillStyle=`rgba(255,255,255,${Math.max(0,encounterFlash)*.58})`;ctx.fillRect(0,0,W,H)}
  }
  function frame(now){const dt=Math.min(.05,(now-lastTime)/1000||0);lastTime=now;anim=now;stepCooldown=Math.max(0,stepCooldown-dt);hero.shownHp+=(hero.hp-hero.shownHp)*Math.min(1,dt*4);if(Math.abs(hero.hp-hero.trailHp)<.12)hero.trailHp+=(hero.hp-hero.trailHp)*Math.min(1,dt*5);else if(hero.trailHp>hero.hp)hero.trailHp=Math.max(hero.hp,hero.trailHp-dt*1.8);ui.hpBar.style.width=`${hero.hp/hero.maxHp*100}%`;ui.hpTrail.style.width=`${Math.max(hero.hp,hero.trailHp)/hero.maxHp*100}%`;ui.hpText.textContent=`${Math.max(0,Math.ceil(hero.shownHp))} / ${hero.maxHp}`;encounterFlash=Math.max(0,encounterFlash-dt*1.8);if(mode==='explore')drawWorld(now);else drawBattle(now);requestAnimationFrame(frame)}
  updateHud();requestAnimationFrame(frame);
})();
