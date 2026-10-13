// Zombie Siege 3D - online server (Express + Socket.io). Server is authoritative.
const express=require('express'),http=require('http'),fs=require('fs'),path=require('path');
const app=express(),srv=http.createServer(app),io=require('socket.io')(srv,{cors:{origin:'*'}});
app.use(express.static(path.join(__dirname,'public')));
app.get('/health',(q,r)=>r.send('ok'));   // lets the game wake the free server before the player taps Play
// ---------- storage: Supabase (permanent) or local file (lost on restart) ----------
const SB=(process.env.SUPABASE_URL||'').replace(/\/$/,''),KEY=process.env.SUPABASE_KEY||'';
const HD={apikey:KEY,'Content-Type':'application/json'};if(KEY.startsWith('eyJ'))HD.Authorization='Bearer '+KEY;
const DBF=path.join(__dirname,'data.json'),dn=new Set(),dq=new Set();let db={};
const mark=n=>dn.add(n);
async function load(){
  if(!SB){try{db=JSON.parse(fs.readFileSync(DBF))}catch(e){}return console.log('No SUPABASE_URL: using local file (data is lost on restart!)')}
  try{const r=await fetch(SB+'/rest/v1/players?select=*&order=coins.desc&limit=1000',{headers:HD});
    if(!r.ok)throw new Error(r.status+' '+await r.text());
    for(const x of await r.json())db[x.nick]={t:x.tok,c:x.coins,own:x.own||[],eq:x.eq||{}};
    console.log('Loaded',Object.keys(db).length,'players from Supabase')}
  catch(e){console.log('Supabase load failed:',e.message);process.exit(1)}
}
async function flush(){
  if(!dn.size)return;const rows=[...dn].filter(n=>db[n]).map(n=>({nick:n,tok:db[n].t,coins:db[n].c,own:db[n].own||[],eq:db[n].eq||{}}));dn.clear();
  if(!SB)return fs.writeFileSync(DBF,JSON.stringify(db));
  try{const r=await fetch(SB+'/rest/v1/players?on_conflict=nick',{method:'POST',headers:{...HD,Prefer:'resolution=merge-duplicates'},body:JSON.stringify(rows)});
    if(!r.ok)throw new Error(r.status+' '+await r.text());for(const n of [...dq]){dq.delete(n);const d=await fetch(SB+'/rest/v1/players?nick=eq.'+encodeURIComponent(n),{method:'DELETE',headers:HD});if(!d.ok)dq.add(n)}}
  catch(e){console.log('Save failed:',e.message);rows.forEach(x=>dn.add(x.nick))}
}
setInterval(flush,3000);
process.on('SIGTERM',async()=>{await flush();process.exit(0)});
const W=800,H=500,rnd=(a,b)=>a+Math.random()*(b-a),cl=(v,a,b)=>Math.max(a,Math.min(b,v));
const q={qd:[],fg:[],cz:[],cs1:[],cs2:[]};
// ---------- shop catalog (prices in online coins) ----------
const TP={common:1000,epic:3000,rare:5000,super:20000};   // prices by rarity
const ITEMS={
 skin_red:{t:'skin',r:'common',n:'Red Soldier',p:TP.common,sh:'#c0392b',pn:'#3a2a2a'},
 skin_olive:{t:'skin',r:'common',n:'Olive Drab',p:TP.common,sh:'#5f7a3a',pn:'#3a4a2a'},
 skin_sand:{t:'skin',r:'common',n:'Desert Tan',p:TP.common,sh:'#c9a86a',pn:'#7a6440'},
 skin_night:{t:'skin',r:'epic',n:'Night Ops',p:TP.epic,sh:'#1c1c24',pn:'#0c0c10'},
 skin_neon:{t:'skin',r:'epic',n:'Neon',p:TP.epic,sh:'#20e0a0',pn:'#1b4a6b'},
 skin_arctic:{t:'skin',r:'epic',n:'Arctic',p:TP.epic,sh:'#cfe8ff',pn:'#6a8aa8'},
 skin_gold:{t:'skin',r:'rare',n:'Golden King',p:TP.rare,sh:'#d4af37',pn:'#6b5a1e'},
 skin_crimson:{t:'skin',r:'rare',n:'Crimson Guard',p:TP.rare,sh:'#8b0f2a',pn:'#2a0a14'},
 skin_violet:{t:'skin',r:'rare',n:'Violet Storm',p:TP.rare,sh:'#7a3ad4',pn:'#2a1450'},
 skin_void:{t:'skin',r:'super',n:'Void Walker',p:TP.super,sh:'#14001f',pn:'#6a00ff'},
 skin_solar:{t:'skin',r:'super',n:'Solar Flare',p:TP.super,sh:'#ffb000',pn:'#ff3b00'},
 skin_diamond:{t:'skin',r:'super',w:1,n:'Diamond',p:TP.super,sh:'#7ae8ff',pn:'#e8ffff'},
 tr_gold:{t:'tracer',r:'epic',n:'Gold Weapon',p:TP.epic,col:1,sh:'#ffd24a'},
 tr_cyan:{t:'tracer',r:'epic',n:'Cyan Weapon',p:TP.epic,col:2,sh:'#4af0ff'},
 tr_pink:{t:'tracer',r:'epic',n:'Pink Weapon',p:TP.epic,col:3,sh:'#ff4ab8'},
 tr_green:{t:'tracer',r:'rare',n:'Plasma Green',p:TP.rare,col:4,sh:'#8aff4a'},
 tr_purple:{t:'tracer',r:'rare',n:'Royal Purple',p:TP.rare,col:5,sh:'#b04aff'},
 tr_fire:{t:'tracer',r:'super',w:1,n:'Inferno',p:TP.super,col:6,sh:'#ff5a1a'}};
// lucky wheel: 2000 coins per spin, cosmetic prizes only (fair in PvP). Pity: a rare+ item is guaranteed within 10 spins.
const SPIN=2000,DUP={epic:900,rare:1500,super:6000},
 WHEEL=[{k:'c100',w:215,c:100},{k:'c300',w:160,c:300},{k:'c500',w:120,c:500},{k:'c1000',w:80,c:1000},{k:'c2000',w:40,c:2000},{k:'c5000',w:10,c:5000},
  {k:'skin_epic',w:120,t:'skin',r:'epic'},{k:'skin_rare',w:70,t:'skin',r:'rare'},{k:'skin_super',w:15,t:'skin',r:'super'},
  {k:'tr_epic',w:100,t:'tracer',r:'epic'},{k:'tr_rare',w:60,t:'tracer',r:'rare'},
  {k:'diamond',w:5,id:'skin_diamond',r:'super'},{k:'inferno',w:5,id:'tr_fire',r:'super'}];   // Diamond + Inferno: 0.5% each, wheel only
const WP0={dmg:20,cd:.35,spd:520,spr:0};

// ---------- levels, launch pass rewards and boxes ----------
const MAXL=100,XPN=l=>50+l*15,CUM=[0];for(let i=0;i<MAXL;i++)CUM.push(CUM[i]+XPN(i));
const lvOf=xp=>{let l=0;while(l<MAXL&&xp>=CUM[l+1])l++;return l};
const prog=r=>{const xp=(r.eq&&r.eq._xp)|0,lv=lvOf(xp);return{lv,lx:xp-CUM[lv],ln:lv>=MAXL?0:XPN(lv),bx:(r.eq&&r.eq._bx)||{}}};
function passReward(L){if(L==10)return{t:'item',id:'skin_olive'};if(L==20)return{t:'item',id:'tr_cyan'};if(L==30)return{t:'item',id:'skin_gold'};
  if(L==5)return{t:'box',k:'bronze'};if(L==25)return{t:'box',k:'gold'};if(L==15||(L>30&&L%10==5))return{t:'box',k:'silver'};
  return{t:'coins',v:L<=30?100+L*40:1500}}
function grant(r,L){const p=passReward(L),o={L,...p};r.eq=r.eq||{};
  if(p.t=='coins')r.c+=p.v;
  else if(p.t=='box'){const b=r.eq._bx=r.eq._bx||{};b[p.k]=(b[p.k]|0)+1}
  else{const it=ITEMS[p.id];o.n=it.n;if(r.own.includes(p.id)){o.dup=Math.round(it.p*.4);r.c+=o.dup}else r.own.push(p.id)}
  return o}
function award(s,coins,xp){const r=db[s.nick];if(!r)return{c:0,xp:0};r.eq=r.eq||{};pay(s,coins);const old=lvOf(r.eq._xp|0);r.eq._xp=(r.eq._xp|0)+xp;
  const nw=lvOf(r.eq._xp),ups=[];for(let l=old+1;l<=nw;l++)ups.push(grant(r,l));mark(s.nick);return{c:r.c,xp,ups,...prog(r)}}
const BOX={bronze:{c:[[200,50],[400,30],[800,15]],i:[5,['epic']]},silver:{c:[[500,35],[1000,35],[2000,20]],i:[10,['epic','rare']]},gold:{c:[[1000,30],[2500,30],[5000,20]],i:[20,['rare','rare','super']]}};
const look=r=>{const a=ITEMS[(r.eq||{}).skin],t=ITEMS[(r.eq||{}).tracer];return{sk:a?{sh:a.sh,pn:a.pn}:null,tr:t?t.col:0,...prog(r)}};
const view=s=>{const r=db[s.nick];return{...look(r),c:r.c,own:r.own,eq:r.eq,items:Object.entries(ITEMS).map(([id,v])=>({id,t:v.t,n:v.n,p:v.p,sh:v.sh,pn:v.pn,r:v.r||'common',w:v.w?1:0}))}};
const WALLS=[[360,200,80,100],[200,100,60,80],[540,320,60,80],[200,320,60,80],[540,100,60,80]]; // [x,y,w,h] buildings
const push=(p,WS)=>{for(const[x,y,w,h]of WS){const cx=cl(p.x,x,x+w),cy=cl(p.y,y,y+h);let dx=p.x-cx,dy=p.y-cy,d=Math.hypot(dx,dy);
  if(d<14){if(d<.001){dx=1;dy=0;d=1}p.x=cx+dx/d*14;p.y=cy+dy/d*14}}};
const inW=(px,py,WS)=>WS.some(([x,y,w,h])=>px>x&&px<x+w&&py>y&&py<y+h);

// random point-symmetric wall layout (same for both teams = fair); clr = free zone near the spawns/castles
function genWalls(aw,ah,n,clr,avoid){const out=[],hit=(a,b)=>a[0]<b[0]+b[2]+36&&b[0]<a[0]+a[2]+36&&a[1]<b[1]+b[3]+36&&b[1]<a[1]+a[3]+36;
  const bad=r=>(avoid||[]).some(([x,y,rad])=>r[0]-rad<x&&x<r[0]+r[2]+rad&&r[1]-rad<y&&y<r[1]+r[3]+rad);
  for(let t=0;t<300&&out.length<n*2;t++){const w=50+Math.random()*70|0,h=50+Math.random()*80|0,x=clr+Math.random()*(aw/2-clr-w)|0,y=30+Math.random()*(ah-60-h)|0,r=[x,y,w,h],m=[aw-x-w,ah-y-h,w,h];
    if(bad(r)||bad(m)||hit(r,m)||out.some(o=>hit(o,r)||hit(o,m)))continue;out.push(r,m)}
  if(Math.random()<.6){const c=[aw/2-40|0,ah/2-50|0,80,100];if(!out.some(o=>hit(o,c))&&!bad(c))out.push(c)}
  return out}
const top=()=>Object.entries(db).map(([n,v])=>({n,c:v.c})).sort((a,b)=>b.c-a.c).slice(0,10);
const pay=(s,c)=>{if(s.nick&&db[s.nick]){db[s.nick].c+=c;mark(s.nick);return db[s.nick].c}return 0};
const leave=s=>{clearTimeout(s.qt);for(const k in q){q[k]=q[k].filter(x=>x!==s);if(!q[k].length&&QT[k]){clearTimeout(QT[k]);QT[k]=null}}};

io.on('connection',s=>{
  s.rtt=60;
  const pg=setInterval(()=>{const t=Date.now();s.timeout(3000).emit('pg',err=>{if(!err)s.rtt=s.rtt*.7+(Date.now()-t)*.3})},2000);
  s.on('reg',(nick,tok,cb)=>{
    if(typeof cb!='function')return;
    nick=String(nick||'').replace(/[<>&"'\u0000-\u001f]/g,'').trim().slice(0,14);tok=String(tok||'').slice(0,60);
    if(nick.length<2)return cb({e:'Name too short (2+ characters)'});if(tok.length<8)return cb({e:'Account code invalid'});
    if(db[nick]&&db[nick].t!==tok)return cb({e:'Name already taken'});
    if(!db[nick]){db[nick]={t:tok,c:0,own:[],eq:{}};mark(nick)}db[nick].own=db[nick].own||[];db[nick].eq=db[nick].eq||{};
    s.nick=nick;cb(Object.assign({ok:1,c:db[nick].c},look(db[nick])));
  });
  s.on('lb',cb=>typeof cb=='function'&&cb(top()));
  s.on('pi',cb=>typeof cb=='function'&&cb());
  s.on('pass',cb=>{if(typeof cb!='function'||!s.nick||!db[s.nick])return;const r=db[s.nick];
    cb({...prog(r),c:r.c,rewards:Array.from({length:30},(_,i)=>{const p=passReward(i+1);return{L:i+1,t:p.t,v:p.v,k:p.k,n:p.id?ITEMS[p.id].n:undefined}})})});
  s.on('box',(k,cb)=>{if(typeof cb!='function'||!s.nick||!db[s.nick]||!BOX[k])return;const r=db[s.nick],b=(r.eq&&r.eq._bx)||{};if(!(b[k]>0))return cb({e:'No box left'});
    b[k]--;r.eq._bx=b;const B=BOX[k];let x=Math.random()*(B.c.reduce((a,v)=>a+v[1],0)+B.i[0]),pr={};
    for(const[v,w]of B.c){if((x-=w)<0){pr={coins:v};break}}
    if(!pr.coins){const rar=B.i[1][Math.random()*B.i[1].length|0],cand=Object.keys(ITEMS).filter(id=>ITEMS[id].r==rar&&!ITEMS[id].w),id=cand[Math.random()*cand.length|0];
      if(id){const it=ITEMS[id];pr={id,n:it.n,r:rar};if(r.own.includes(id)){pr.dup=Math.round(it.p*.4);r.c+=pr.dup}else r.own.push(id)}else pr={coins:200}}
    if(pr.coins)r.c+=pr.coins;mark(s.nick);cb({ok:1,prize:pr,c:r.c,...prog(r)})});
  s.on('lbl',cb=>typeof cb=='function'&&cb(Object.entries(db).map(([n,v])=>{const x=(v.eq&&v.eq._xp)|0;return{n,lv:lvOf(x),x}}).sort((a,b)=>b.x-a.x).slice(0,10)));
  s.on('ren',(nn,cb)=>{if(typeof cb!='function'||!s.nick||!db[s.nick])return;nn=String(nn||'').replace(/[<>&"'\u0000-\u001f]/g,'').trim().slice(0,14);
    if(nn.length<2)return cb({e:'Name too short (2+ characters)'});if(nn==s.nick)return cb({ok:1,nick:nn});if(db[nn])return cb({e:'Name already taken'});
    db[nn]=db[s.nick];delete db[s.nick];dq.add(s.nick);mark(nn);s.nick=nn;cb({ok:1,nick:nn})});
  s.on('shop',cb=>typeof cb=='function'&&s.nick&&db[s.nick]&&cb(view(s)));
  s.on('buy',(id,cb)=>{if(typeof cb!='function'||!s.nick||!db[s.nick])return;const r=db[s.nick],it=ITEMS[id];
    if(!it||it.w)return cb({e:'Wheel only'});if(r.own.includes(id)||r.c<it.p)return cb({e:'Not enough coins'});
    r.c-=it.p;r.own.push(id);mark(s.nick);cb(view(s))});
  s.on('eq',(id,cb)=>{if(typeof cb!='function'||!s.nick||!db[s.nick])return;const r=db[s.nick],it=ITEMS[id];
    if(id=='skin'||id=='weapon'||id=='tracer'){delete r.eq[id];mark(s.nick);return cb(view(s))}
    if(!it||!r.own.includes(id))return cb({e:'Not owned'});r.eq[it.t]=id;mark(s.nick);cb(view(s))});
  s.on('spin',cb=>{if(typeof cb!='function'||!s.nick||!db[s.nick])return;const r=db[s.nick];if(r.c<SPIN)return cb({e:'Not enough coins'});
    r.c-=SPIN;r.eq=r.eq||{};let pool=WHEEL;if((r.eq._sp|0)>=9)pool=WHEEL.filter(w=>w.r=='rare'||w.r=='super');
    let x=Math.random()*pool.reduce((a,w)=>a+w.w,0),pz=pool[0];for(const w of pool){if((x-=w.w)<0){pz=w;break}}
    const res={k:pz.k};
    if(pz.c){r.c+=pz.c;res.coins=pz.c}
    else{const cand=Object.keys(ITEMS).filter(id=>ITEMS[id].t==pz.t&&ITEMS[id].r==pz.r&&!ITEMS[id].w),id=pz.id||cand[Math.random()*cand.length|0];res.id=id;res.n=ITEMS[id].n;res.r=pz.r;
      if(r.own.includes(id)){res.dup=DUP[pz.r];r.c+=res.dup}else r.own.push(id)}
    r.eq._sp=(pz.r=='rare'||pz.r=='super')?0:(r.eq._sp|0)+1;mark(s.nick);cb(Object.assign(view(s),{prize:res}))});
  s.on('q',(m,cb)=>{leave(s);const n=m=='cs2'?4:2,ack=o=>typeof cb=='function'&&cb(o);
    if(!s.nick||!q[m]||s.g)return ack({e:'Mode not available'});
    q[m]=q[m].filter(x=>x.connected);q[m].push(s);
    if(q[m].length>=n){clearTimeout(QT[m]);QT[m]=null;startQ(m,q[m].splice(0,n));if(q[m].length)QT[m]=setTimeout(()=>fillQ(m),BOT_WAIT)}
    else if(!QT[m])QT[m]=setTimeout(()=>fillQ(m),BOT_WAIT);   // nobody else came: a bot fills the match
    ack({ok:1})});
  s.on('cancel',()=>{leave(s);s.g&&s.g.end&&s.g.end(s)});
  s.on('qd:fire',()=>s.g&&s.g.fire&&s.g.fire(s));
  s.on('fg:in',d=>s.g&&s.g.in&&d&&s.g.in(s,d));
  s.on('cs:b',k=>s.g&&s.g.build&&s.g.build(s,k));
  s.on('disconnect',()=>{clearInterval(pg);leave(s);s.g&&s.g.end&&s.g.end(s)});
});

// ---------- bots: fill empty matches after a short wait (hard difficulty, random player-like names) ----------
const BOT_WAIT=+process.env.BOT_WAIT_MS||10000,QT={};
const BN1=['Slim','Mehdi','Yassine','Rami','Aymen','Sofien','Wassim','Bilel','Oussama','Hamza','Nader','Amine','Karim','Fares','Skander','Houssem','Zied','Anis','Marwen','Tarek','Walid','Ghazi','Khalil','Iheb'],
  BN2=['Shadow','Ghost','Raven','Storm','Viper','Nova','Titan','Rogue','Blaze','Falcon','Zero','Hunter','Wolf','Phoenix','Sniper','Reaper','Ninja','Dragon','Hawk','Cobra'],usedBN=new Set();
function botName(){for(let t=0;t<30;t++){const r=Math.random();let n;
  if(r<.4)n='Player'+(1000+Math.random()*9000|0);
  else if(r<.7)n=BN1[Math.random()*BN1.length|0]+(Math.random()<.5?'_':'')+(Math.random()*99|0);
  else n=BN2[Math.random()*BN2.length|0]+(Math.random()<.5?'x':'_')+(10+Math.random()*990|0);
  n=n.slice(0,14);if(!db[n]&&!usedBN.has(n)){if(usedBN.size>300)usedBN.clear();usedBN.add(n);return n}}
  return 'Player'+(Date.now()%100000)}
const mkBot=()=>({nick:botName(),isBot:true,connected:true,rtt:0,g:null,emit(){},volatile:{emit(){}}});
const los=(ax,ay,bx,by,WS)=>{for(let k=1;k<10;k++)if(inW(ax+(bx-ax)*k/10,ay+(by-ay)*k/10,WS))return false;return true};
function steer(p,mx,my,WS,AW,AH){const m=Math.hypot(mx,my);if(m<.01)return[0,0];mx/=m;my/=m;
  const ok=(x,y)=>x>20&&x<AW-20&&y>20&&y<AH-20&&!inW(x,y,WS)&&!inW(p.x+(x-p.x)*.5,p.y+(y-p.y)*.5,WS);
  for(const ang of[0,.6,-.6,1.2,-1.2,1.9,-1.9]){const c=Math.cos(ang),s=Math.sin(ang),dx=mx*c-my*s,dy=mx*s+my*c;if(ok(p.x+dx*38,p.y+dy*38))return[dx,dy]}
  return[mx,my]}
function startQ(m,g){if(m=='cs1'||m=='cs2')CS(g);else({qd:QD,fg:FG,cz:CZ})[m](g[0],g[1])}
function fillQ(m){QT[m]=null;q[m]=q[m].filter(x=>x.connected&&!x.g);if(!q[m].length)return;
  const n=m=='cs2'?4:2,g=q[m].splice(0,n);while(g.length<n)g.push(mkBot());
  if(m!='cz')g.sort(()=>Math.random()-.5);          // random side / team
  startQ(m,g);if(q[m].length)QT[m]=setTimeout(()=>fillQ(m),BOT_WAIT)}

// ---------- Quick Draw: first to 3, server decides with ping compensation ----------
function QD(a,b){
  const P=[a,b],sc=[0,0];let rd=0,st='idle',tGo=0,fires=[null,null],over=0;const tm=[];
  const T=(f,ms)=>tm.push(setTimeout(f,ms)),em=(e,f)=>P.forEach((s,i)=>s.emit(e,f(i)));
  const g={
    end(s){if(over)return;finish(1-P.indexOf(s))},
    fire(s){const i=P.indexOf(s);if(over)return;
      if(st=='count'||st=='hold')return score(1-i,{});
      if(st=='fire'&&fires[i]==null){
        fires[i]=Math.max(0,Date.now()-tGo-s.rtt/2);          // subtract estimated one-way latency
        if(fires.filter(v=>v!=null).length==1)T(()=>{          // wait 200ms for the other player's click
          if(st!='fire')return;
          const w=fires[0]!=null&&(fires[1]==null||fires[0]<=fires[1])?0:1;score(w,{ms:fires[w]})},200);
      }}
  };
  P.forEach(s=>s.g=g);
  em('qd:start',i=>({names:[P[i].nick,P[1-i].nick]}));
  function round(){rd++;st='count';fires=[null,null];em('qd:round',()=>({rd,map:Math.random()*5|0}));
    T(()=>{st='hold';T(()=>{st='fire';tGo=Date.now();P.forEach(s=>{s.emit('qd:go');if(s.isBot)T(()=>g.fire(s),150+Math.random()*90)})},rnd(300,1500))},3000)}
  function score(w,x){st='res';sc[w]++;
    em('qd:res',i=>({win:w==i?0:1,foul:x.ms==null,ms:x.ms|0,sc:[sc[i],sc[1-i]]}));
    T(sc[w]>=3?()=>finish(w):round,2200)}
  function finish(w){if(over)return;over=1;tm.forEach(clearTimeout);
    P.forEach((s,i)=>{s.g=null;const gain=w==i?60:10;s.emit('qd:end',{win:w==i?0:1,sc:[sc[i],sc[1-i]],g:gain,...award(s,gain,w==i?80:30)})})}
  round();
}

// ---------- 1v1 Fight: best of 5 (first to 3), server simulates everything ----------
function FG(a,b){
  const P=[a,b],sc=[0,0],inp=[{dx:0,dy:0,a:0,f:0},{dx:0,dy:0,a:0,f:0}],cd=[0,0];
  let rd=0,st='count',over=0,bl=[],ps;const tm=[];
  const AW=1100,AH=680,MAP=Math.random()*5|0,WL=genWalls(AW,AH,3+(Math.random()*3|0),230,[[140,AH/2,80],[AW-140,AH/2,80]]);
  const eqOf=s=>(db[s.nick]&&db[s.nick].eq)||{},WPN=P.map(wpO),
    sk=s=>{const it=ITEMS[eqOf(s).skin];return it?{sh:it.sh,pn:it.pn}:null};
  const T=(f,ms)=>tm.push(setTimeout(f,ms));
  const g={
    end(s){if(over)return;finish(1-P.indexOf(s))},
    in(s,d){const i=P.indexOf(s);inp[i]={dx:cl(+d.dx||0,-1,1),dy:cl(+d.dy||0,-1,1),a:+d.a||0,f:d.f?1:0}}
  };
  P.forEach(s=>s.g=g);
  function round(){rd++;st='count';bl=[];cd[0]=cd[1]=0;
    ps=[{x:140,y:AH/2,a:0,hp:100,mv:0},{x:AW-140,y:AH/2,a:Math.PI,hp:100,mv:0}];
    P.forEach((s,i)=>s.emit('fg:round',{rd,sc:[sc[i],sc[1-i]],names:[P[i].nick,P[1-i].nick],walls:WL,aw:AW,ah:AH,map:MAP,sk:[sk(P[i]),sk(P[1-i])]}));
    T(()=>{st='fight'},3000)}
  function won(w){st='res';sc[w]++;
    P.forEach((s,i)=>s.emit('fg:res',{win:w==i?0:1,sc:[sc[i],sc[1-i]]}));
    T(sc[w]>=3?()=>finish(w):round,2500)}
  function finish(w){if(over)return;over=1;clearInterval(iv);tm.forEach(clearTimeout);
    P.forEach((s,i)=>{s.g=null;const gain=w==i?120:20;s.emit('fg:end',{win:w==i?0:1,sc:[sc[i],sc[1-i]],g:gain,...award(s,gain,w==i?120:40)})})}
  function botFG(i){const me=ps[i],t=ps[1-i];if(me.hp<=0||t.hp<=0)return{dx:0,dy:0,a:me.a,f:0};
    const dx=t.x-me.x,dy=t.y-me.y,d=Math.hypot(dx,dy)||1,side=Math.sin(Date.now()/700+i*2)>0?1:-1,w=d>250?1:d<140?-1:0;
    const[mx,my]=steer(me,dx/d*w+(-dy/d)*side*.9,dy/d*w+(dx/d)*side*.9,WL,AW,AH);
    return{dx:mx,dy:my,a:Math.atan2(dy,dx)+(Math.random()-.5)*.16,f:los(me.x,me.y,t.x,t.y,WL)&&d<430&&Math.random()>.1?1:0}}
  function snap(){const f=p=>[p.x|0,p.y|0,+p.a.toFixed(2),Math.max(0,p.hp),p.mv],B=bl.map(o=>[o.x|0,o.y|0,o.vx|0,o.vy|0,o.k|0]);
    P.forEach((s,i)=>s.volatile.emit('fg:s',{p:[f(ps[i]),f(ps[1-i])],b:B,st}))}
  function tick(){const dt=.033;
    if(st=='fight'){
      P.forEach((s,i)=>{if(s.isBot)inp[i]=botFG(i)});
      for(let i=0;i<2;i++){const p=ps[i],n=inp[i];let dx=n.dx,dy=n.dy;const m=Math.hypot(dx,dy);if(m>1){dx/=m;dy/=m}
        p.x=cl(p.x+dx*180*dt,14,AW-14);p.y=cl(p.y+dy*180*dt,14,AH-14);push(p,WL);p.a=n.a;p.mv=m>.05?1:0;cd[i]-=dt;
        if(n.f&&cd[i]<=0){const w=WPN[i],a=p.a+(Math.random()-.5)*w.spr;cd[i]=w.cd;bl.push({o:i,x:p.x,y:p.y,vx:Math.cos(a)*w.spd,vy:Math.sin(a)*w.spd,l:.8,d:w.dmg,k:w.col})}}
      for(const o of bl){o.x+=o.vx*dt;o.y+=o.vy*dt;o.l-=dt;if(inW(o.x,o.y,WL))o.l=0;const t=ps[1-o.o];
        if(o.l>0&&Math.hypot(t.x-o.x,t.y-o.y)<20){t.hp-=o.d;o.l=0;if(t.hp<=0){snap();return won(o.o)}}}
      bl=bl.filter(o=>o.l>0);
    }
    snap();
  }
  const iv=setInterval(tick,33);round();
}

// ---------- Co-op Zombies: 2 players vs waves (server-authoritative) ----------
const eqO=s=>(db[s.nick]&&db[s.nick].eq)||{},wpO=s=>Object.assign({},WP0,{col:(ITEMS[eqO(s).tracer]||{}).col||0}),skO=s=>{const it=ITEMS[eqO(s).skin];return it?{sh:it.sh,pn:it.pn}:null};
function CZ(a,b){
  const WL=genWalls(W,H,2,170,[[300,250,70],[500,250,70]]),MAP=Math.random()*5|0;
  const P=[a,b||{nick:'-',connected:false,emit(){},volatile:{emit(){}}}],inp=[{dx:0,dy:0,a:0,f:0},{dx:0,dy:0,a:0,f:0}],cd=[0,0],WPN=P.map(wpO),gone=[0,b?0:1],kl=[0,0];
  const ps=[{x:300,y:250,a:0,hp:100,mv:0},{x:b?500:-900,y:b?250:-900,a:Math.PI,hp:b?100:0,mv:0}];
  let zs=[],bl=[],wave=0,left=0,sp=0,st='break',br=3,zid=0,over=0;
  const alive=i=>!gone[i]&&ps[i].hp>0;
  const g={
    end(s){const i=P.indexOf(s);if(i<0||over)return;gone[i]=1;ps[i].hp=0;s.g=null;if((gone[0]&&gone[1])||!P.some((x,j)=>!x.isBot&&!gone[j]))finish()},
    in(s,d){const i=P.indexOf(s);if(i<0)return;inp[i]={dx:cl(+d.dx||0,-1,1),dy:cl(+d.dy||0,-1,1),a:+d.a||0,f:d.f?1:0}}
  };
  P.forEach(s=>s.g=g);
  P.forEach((s,i)=>s.emit('cz:start',{names:[P[i].nick,P[1-i].nick],walls:WL,aw:W,ah:H,map:MAP,sk:[skO(P[i]),skO(P[1-i])]}));
  function botCZ(){const me=ps[1],hu=ps[0];let nz=null,nd=1e9;for(const z of zs){const d=Math.hypot(z.x-me.x,z.y-me.y);if(d<nd){nd=d;nz=z}}
    let mx=0,my=0;if(nz&&nd<110){mx=me.x-nz.x;my=me.y-nz.y}else if(alive(0)){const dh=Math.hypot(hu.x-me.x,hu.y-me.y);if(dh>170){mx=hu.x-me.x;my=hu.y-me.y}else if(dh<70){mx=me.x-hu.x;my=me.y-hu.y}}
    const[dx,dy]=steer(me,mx,my,WL,W,H);let a=me.a,f=0;if(nz&&nd<330&&los(me.x,me.y,nz.x,nz.y,WL)){a=Math.atan2(nz.y-me.y,nz.x-me.x)+(Math.random()-.5)*.1;f=1}
    inp[1]={dx,dy,a,f}}
  function nextWave(){wave++;left=6+wave*3;sp=0;st='fight';ps.forEach((p,i)=>{if(gone[i])return;p.hp=p.hp<=0?50:Math.min(100,p.hp+25)})}
  function finish(){if(over)return;over=1;clearInterval(iv);
    P.forEach((s,i)=>{if(gone[i])return;s.g=null;const gain=wave*15+kl[i]*2;s.emit('cz:end',{wave,kills:kl[i],g:gain,...award(s,gain,wave*20+kl[i]*2)})})}
  function snap(){const f=p=>[p.x|0,p.y|0,+p.a.toFixed(2),Math.max(0,Math.ceil(p.hp)),p.mv],B=bl.map(o=>[o.x|0,o.y|0,o.vx|0,o.vy|0,o.k|0]),Z=zs.map(z=>[z.id,z.x|0,z.y|0,Math.max(1,Math.round(z.hp/z.mhp*100))]);
    P.forEach((s,i)=>{if(!gone[i])s.volatile.emit('cz:s',{p:[f(ps[i]),f(ps[1-i])],b:B,z:Z,w:wave,l:left+zs.length,st})})}
  function tick(){try{const dt=.033;
    if(st=='break'){br-=dt;if(br<=0)nextWave()}
    else{
      if(P[1].isBot&&alive(1))botCZ();
      for(let i=0;i<2;i++){if(!alive(i))continue;const p=ps[i],n=inp[i];let dx=n.dx,dy=n.dy;const m=Math.hypot(dx,dy);if(m>1){dx/=m;dy/=m}
        p.x=cl(p.x+dx*180*dt,14,W-14);p.y=cl(p.y+dy*180*dt,14,H-14);push(p,WL);p.a=n.a;p.mv=m>.05?1:0;cd[i]-=dt;
        if(n.f&&cd[i]<=0){const w=WPN[i],aa=p.a+(Math.random()-.5)*w.spr;cd[i]=w.cd;bl.push({o:i,x:p.x,y:p.y,vx:Math.cos(aa)*w.spd,vy:Math.sin(aa)*w.spd,l:.8,d:w.dmg,k:w.col})}}
      sp-=dt;
      if(left>0&&sp<=0&&zs.length<40){const e=Math.random()*4|0;let x,y;
        if(e==0){x=Math.random()*W;y=-20}else if(e==1){x=Math.random()*W;y=H+20}else if(e==2){x=-20;y=Math.random()*H}else{x=W+20;y=Math.random()*H}
        zs.push({id:++zid,x,y,hp:30+wave*12,mhp:30+wave*12});left--;sp=Math.max(.25,1-wave*.04)}
      const zsp=Math.min(120,50+wave*2.5),dps=10+wave*1.2;
      for(const z of zs){let t=-1,bd=1e9;for(let i=0;i<2;i++)if(alive(i)){const d=Math.hypot(ps[i].x-z.x,ps[i].y-z.y);if(d<bd){bd=d;t=i}}
        if(t<0)break;const a=Math.atan2(ps[t].y-z.y,ps[t].x-z.x);z.x+=Math.cos(a)*zsp*dt;z.y+=Math.sin(a)*zsp*dt;
        if(bd<24){ps[t].hp-=dps*dt;if(ps[t].hp<0)ps[t].hp=0}}
      for(const o of bl){o.x+=o.vx*dt;o.y+=o.vy*dt;o.l-=dt;if(inW(o.x,o.y,WL)){o.l=0;continue}
        for(const z of zs){if(z.hp>0&&Math.hypot(z.x-o.x,z.y-o.y)<18){z.hp-=o.d;o.l=0;if(z.hp<=0)kl[o.o]++;break}}}
      bl=bl.filter(o=>o.l>0);zs=zs.filter(z=>z.hp>0);
      if(!alive(0)&&!alive(1)){snap();return finish()}
      if(left<=0&&!zs.length){st='break';br=4}
    }
    snap()}catch(e){console.log('CZ tick error:',e.message)}}
  const iv=setInterval(tick,33);
}

// ---------- Castle Siege 1v1 / 2v2: destroy the enemy castle ----------
const CSL={tur:[[80,-65],[80,65],[115,0]],can:[[35,-115],[35,115],[35,0]]},CSC={tur:120,can:200},CH=1500;
function CS(P){
  const AW=1300,AH=760,MAP=Math.random()*5|0,WL=genWalls(AW,AH,3+(Math.random()*3|0),330,[]),CHP=P.length==2?2000:3000;
  const N=P.length,gone=P.map(()=>0),ps=P.map((s,i)=>({t:i%2,x:0,y:0,a:0,hp:100,mv:0,rt:0})),inp=P.map(()=>({dx:0,dy:0,a:0,f:0})),cd=P.map(()=>0),WPN=P.map(wpO),
    cas=[{hp:CHP,x:90,y:AH/2},{hp:CHP,x:AW-90,y:AH/2}],tc=[150,150],sts=[[],[]];
  let bl=[],tl=300,over=0,sid=0;
  const spawn=i=>{const p=ps[i],k=ps.slice(0,i).filter(q=>q.t==p.t).length;p.x=p.t?AW-170:170;p.y=AH/2+(k?40:-40);p.a=p.t?Math.PI:0;p.hp=100;p.rt=0};
  ps.forEach((_,i)=>spawn(i));
  const g={
    end(s){const i=P.indexOf(s);if(i<0||over)return;gone[i]=1;ps[i].hp=0;ps[i].rt=1e9;s.g=null;const t=ps[i].t;if(!P.some((x,j)=>!x.isBot&&!gone[j]))return finish(-1);if(!ps.some((p,j)=>p.t==t&&!gone[j]))finish(1-t)},
    in(s,d){const i=P.indexOf(s);if(i<0)return;inp[i]={dx:cl(+d.dx||0,-1,1),dy:cl(+d.dy||0,-1,1),a:+d.a||0,f:d.f?1:0}},
    build(s,k){const i=P.indexOf(s);if(i<0||over||!CSC[k]||ps[i].hp<=0)return;const t=ps[i].t,n=sts[t].filter(x=>x.k==k).length;
      if(n>=3||tc[t]<CSC[k])return;const sl=CSL[k][n],bx=90+sl[0];tc[t]-=CSC[k];sts[t].push({id:++sid,k,t,x:t?AW-bx:bx,y:AH/2+sl[1],cd:1})}
  };
  P.forEach(s=>s.g=g);
  P.forEach((s,i)=>s.emit('cs:start',{names:P.map(x=>x.nick),teams:ps.map(p=>p.t),me:i,walls:WL,aw:AW,ah:AH,map:MAP,ch:CHP}));
  function botCS(i){const p=ps[i],t=p.t,ec=cas[1-t],oc=cas[t],role=ps.map((q,j)=>j).filter(j=>ps[j].t==t).indexOf(i);
    let tgt=null,bd=340;ps.forEach((q,j)=>{if(q.t!=t&&q.hp>0&&!gone[j]){const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<bd&&los(p.x,p.y,q.x,q.y,WL)){bd=d;tgt=q}}});
    if(Math.random()<.02){const k=tc[t]>=CSC.can&&sts[t].filter(x=>x.k=='can').length<3?'can':tc[t]>=CSC.tur&&sts[t].filter(x=>x.k=='tur').length<3?'tur':null;if(k)g.build(P[i],k)}
    let mx=0,my=0,a=p.a,f=0;
    if(p.hp<35){mx=oc.x-p.x;my=oc.y-p.y;a=Math.atan2(my,mx)}
    else if(tgt){const dx=tgt.x-p.x,dy=tgt.y-p.y,d=Math.hypot(dx,dy)||1,side=Math.sin(Date.now()/600+i)>0?1:-1,w=d>230?1:d<150?-1:0;
      mx=dx/d*w+(-dy/d)*side*.9;my=dy/d*w+(dx/d)*side*.9;a=Math.atan2(dy,dx)+(Math.random()-.5)*.14;f=1}
    else if(role==1&&N==4){mx=oc.x+(t?-150:150)-p.x;my=oc.y+(i%2?70:-70)-p.y;a=t?Math.PI:0}
    else{const dx=ec.x-p.x,dy=ec.y-p.y,d=Math.hypot(dx,dy);mx=dx;my=dy;a=Math.atan2(dy,dx)+(Math.random()-.5)*.06;if(d<380){f=1;if(d<220){mx=0;my=0}}}
    const[dx,dy]=steer(p,mx,my,WL,AW,AH);return{dx,dy,a,f}}
  function finish(w){if(over)return;over=1;clearInterval(iv);
    P.forEach((s,i)=>{if(gone[i])return;s.g=null;const win=w<0?2:ps[i].t==w?0:1,gain=win==0?200:win==2?80:30;s.emit('cs:end',{win,g:gain,...award(s,gain,win==0?160:win==2?80:50)})})}
  function snap(){const A=ps.map(p=>[p.x|0,p.y|0,+p.a.toFixed(2),Math.max(0,Math.ceil(p.hp)),p.mv,p.t]),B=bl.map(o=>[o.x|0,o.y|0,o.vx|0,o.vy|0,o.k|0]),S2=sts.flat().map(s=>[s.id,s.k,s.x,s.y,s.t]);
    P.forEach((s,i)=>{if(!gone[i])s.volatile.emit('cs:s',{p:A,b:B,s:S2,c:[Math.max(0,cas[0].hp|0),Math.max(0,cas[1].hp|0)],tc:tc[ps[i].t]|0,tl:tl|0})})}
  function tick(){try{const dt=.033;tl-=dt;
    for(let t=0;t<2;t++)tc[t]+=dt*3*ps.filter((p,j)=>p.t==t&&!gone[j]).length;
    ps.forEach((p,i)=>{if(gone[i])return;
      if(p.hp<=0){p.rt-=dt;if(p.rt<=0)spawn(i);return}
      if(P[i].isBot)inp[i]=botCS(i);
      const n=inp[i];let dx=n.dx,dy=n.dy;const m=Math.hypot(dx,dy);if(m>1){dx/=m;dy/=m}
      p.x=cl(p.x+dx*180*dt,14,AW-14);p.y=cl(p.y+dy*180*dt,14,AH-14);push(p,WL);
      for(const c of cas){const ex=p.x-c.x,ey=p.y-c.y,d=Math.hypot(ex,ey);if(d>0&&d<50){p.x=c.x+ex/d*50;p.y=c.y+ey/d*50}}
      p.a=n.a;p.mv=m>.05?1:0;cd[i]-=dt;
      if(n.f&&cd[i]<=0){const w=WPN[i],a=p.a+(Math.random()-.5)*w.spr;cd[i]=w.cd;bl.push({t:p.t,x:p.x,y:p.y,vx:Math.cos(a)*w.spd,vy:Math.sin(a)*w.spd,l:.8,d:w.dmg,c:0,k:w.col})}});
    for(const s of sts.flat()){s.cd-=dt;if(s.cd>0)continue;
      if(s.k=='tur'){let tg=null,bd=230;ps.forEach((p,i)=>{if(p.t!=s.t&&p.hp>0&&!gone[i]){const d=Math.hypot(p.x-s.x,p.y-s.y);if(d<bd){bd=d;tg=p}}});
        if(tg){const a=Math.atan2(tg.y-s.y,tg.x-s.x);bl.push({t:s.t,x:s.x,y:s.y,vx:Math.cos(a)*500,vy:Math.sin(a)*500,l:.6,d:9,c:0});s.cd=.7}else s.cd=.2}
      else{const c=cas[1-s.t],a=Math.atan2(c.y-s.y,c.x-s.x);bl.push({t:s.t,x:s.x,y:s.y,vx:Math.cos(a)*260,vy:Math.sin(a)*260,l:5.2,d:45,c:1});s.cd=3}}
    for(const o of bl){o.x+=o.vx*dt;o.y+=o.vy*dt;o.l-=dt;if(!o.c&&inW(o.x,o.y,WL)){o.l=0;continue}
      const ec=cas[1-o.t];if(Math.hypot(ec.x-o.x,ec.y-o.y)<40){ec.hp-=o.c?o.d:o.d*.5;o.l=0;continue}
      if(o.c)continue;
      for(let i=0;i<N;i++){const p=ps[i];if(p.t==o.t||p.hp<=0||gone[i])continue;if(Math.hypot(p.x-o.x,p.y-o.y)<18){p.hp-=o.d;o.l=0;if(p.hp<=0){p.rt=5;tc[o.t]+=15}break}}}
    bl=bl.filter(o=>o.l>0);
    if(cas[0].hp<=0||cas[1].hp<=0){snap();return finish(cas[0].hp<=0?1:0)}
    if(tl<=0){snap();return finish(cas[0].hp==cas[1].hp?-1:cas[0].hp>cas[1].hp?0:1)}
    snap()}catch(e){console.log('CS tick error:',e.message)}}
  const iv=setInterval(tick,33);
}
load().then(()=>srv.listen(process.env.PORT||3000,()=>console.log('Server on port',process.env.PORT||3000)));
