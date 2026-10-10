// Zombie Siege 3D - online server (Express + Socket.io). Server is authoritative.
const express=require('express'),http=require('http'),fs=require('fs'),path=require('path');
const app=express(),srv=http.createServer(app),io=require('socket.io')(srv,{cors:{origin:'*'}});
app.use(express.static(path.join(__dirname,'public')));
const DBF=path.join(__dirname,'data.json');let db={},dirty=0;
try{db=JSON.parse(fs.readFileSync(DBF))}catch(e){}
setInterval(()=>{if(dirty){dirty=0;fs.writeFile(DBF,JSON.stringify(db),()=>{})}},5000);
const W=800,H=500,rnd=(a,b)=>a+Math.random()*(b-a),cl=(v,a,b)=>Math.max(a,Math.min(b,v));
const q={qd:[],fg:[]};
const WALLS=[[360,200,80,100],[200,100,60,80],[540,320,60,80],[200,320,60,80],[540,100,60,80]]; // [x,y,w,h] buildings
const push=p=>{for(const[x,y,w,h]of WALLS){const cx=cl(p.x,x,x+w),cy=cl(p.y,y,y+h);let dx=p.x-cx,dy=p.y-cy,d=Math.hypot(dx,dy);
  if(d<14){if(d<.001){dx=1;dy=0;d=1}p.x=cx+dx/d*14;p.y=cy+dy/d*14}}};
const inW=(px,py)=>WALLS.some(([x,y,w,h])=>px>x&&px<x+w&&py>y&&py<y+h);
const top=()=>Object.entries(db).map(([n,v])=>({n,c:v.c})).sort((a,b)=>b.c-a.c).slice(0,10);
const pay=(s,c)=>{if(s.nick&&db[s.nick]){db[s.nick].c+=c;dirty=1;return db[s.nick].c}return 0};
const leave=s=>{for(const k in q)q[k]=q[k].filter(x=>x!==s)};

io.on('connection',s=>{
  s.rtt=60;
  const pg=setInterval(()=>{const t=Date.now();s.timeout(3000).emit('pg',err=>{if(!err)s.rtt=s.rtt*.7+(Date.now()-t)*.3})},2000);
  s.on('reg',(nick,tok,cb)=>{
    if(typeof cb!='function')return;
    nick=String(nick||'').replace(/[<>&"']/g,'').trim().slice(0,14);tok=String(tok||'').slice(0,60);
    if(nick.length<2||tok.length<8)return cb({e:'Name too short'});
    if(db[nick]&&db[nick].t!==tok)return cb({e:'Name already taken'});
    if(!db[nick]){db[nick]={t:tok,c:0};dirty=1}
    s.nick=nick;cb({ok:1,c:db[nick].c});
  });
  s.on('lb',cb=>typeof cb=='function'&&cb(top()));
  s.on('q',m=>{leave(s);if(!s.nick||!q[m]||s.g)return;
    const o=q[m].find(x=>x!==s&&x.connected);
    if(o){q[m]=q[m].filter(x=>x!==o);(m=='qd'?QD:FG)(o,s)}else q[m].push(s)});
  s.on('cancel',()=>{leave(s);s.g&&s.g.end&&s.g.end(s)});
  s.on('qd:fire',()=>s.g&&s.g.fire&&s.g.fire(s));
  s.on('fg:in',d=>s.g&&s.g.in&&d&&s.g.in(s,d));
  s.on('disconnect',()=>{clearInterval(pg);leave(s);s.g&&s.g.end&&s.g.end(s)});
});

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
  function round(){rd++;st='count';fires=[null,null];em('qd:round',()=>({rd,map:(rd*2)%5}));
    T(()=>{st='hold';T(()=>{st='fire';tGo=Date.now();P.forEach(s=>s.emit('qd:go'))},rnd(300,1500))},3000)}
  function score(w,x){st='res';sc[w]++;
    em('qd:res',i=>({win:w==i?0:1,foul:x.ms==null,ms:x.ms|0,sc:[sc[i],sc[1-i]]}));
    T(sc[w]>=3?()=>finish(w):round,2200)}
  function finish(w){if(over)return;over=1;tm.forEach(clearTimeout);
    P.forEach((s,i)=>{s.g=null;const gain=w==i?50:10;s.emit('qd:end',{win:w==i?0:1,sc:[sc[i],sc[1-i]],g:gain,c:pay(s,gain)})})}
  round();
}

// ---------- 1v1 Fight: best of 5 (first to 3), server simulates everything ----------
function FG(a,b){
  const P=[a,b],sc=[0,0],inp=[{dx:0,dy:0,a:0,f:0},{dx:0,dy:0,a:0,f:0}],cd=[0,0];
  let rd=0,st='count',over=0,bl=[],ps;const tm=[];
  const T=(f,ms)=>tm.push(setTimeout(f,ms));
  const g={
    end(s){if(over)return;finish(1-P.indexOf(s))},
    in(s,d){const i=P.indexOf(s);inp[i]={dx:cl(+d.dx||0,-1,1),dy:cl(+d.dy||0,-1,1),a:+d.a||0,f:d.f?1:0}}
  };
  P.forEach(s=>s.g=g);
  function round(){rd++;st='count';bl=[];cd[0]=cd[1]=0;
    ps=[{x:120,y:250,a:0,hp:100,mv:0},{x:680,y:250,a:Math.PI,hp:100,mv:0}];
    P.forEach((s,i)=>s.emit('fg:round',{rd,sc:[sc[i],sc[1-i]],names:[P[i].nick,P[1-i].nick],walls:WALLS}));
    T(()=>{st='fight'},3000)}
  function won(w){st='res';sc[w]++;
    P.forEach((s,i)=>s.emit('fg:res',{win:w==i?0:1,sc:[sc[i],sc[1-i]]}));
    T(sc[w]>=3?()=>finish(w):round,2500)}
  function finish(w){if(over)return;over=1;clearInterval(iv);tm.forEach(clearTimeout);
    P.forEach((s,i)=>{s.g=null;const gain=w==i?100:10;s.emit('fg:end',{win:w==i?0:1,sc:[sc[i],sc[1-i]],g:gain,c:pay(s,gain)})})}
  function snap(){const f=p=>[p.x|0,p.y|0,+p.a.toFixed(2),Math.max(0,p.hp),p.mv],B=bl.map(o=>[o.x|0,o.y|0,o.vx|0,o.vy|0]);
    P.forEach((s,i)=>s.volatile.emit('fg:s',{p:[f(ps[i]),f(ps[1-i])],b:B,st}))}
  function tick(){const dt=.033;
    if(st=='fight'){
      for(let i=0;i<2;i++){const p=ps[i],n=inp[i];let dx=n.dx,dy=n.dy;const m=Math.hypot(dx,dy);if(m>1){dx/=m;dy/=m}
        p.x=cl(p.x+dx*180*dt,14,W-14);p.y=cl(p.y+dy*180*dt,14,H-14);push(p);p.a=n.a;p.mv=m>.05?1:0;cd[i]-=dt;
        if(n.f&&cd[i]<=0){cd[i]=.35;bl.push({o:i,x:p.x,y:p.y,vx:Math.cos(p.a)*520,vy:Math.sin(p.a)*520,l:.8})}}
      for(const o of bl){o.x+=o.vx*dt;o.y+=o.vy*dt;o.l-=dt;if(inW(o.x,o.y))o.l=0;const t=ps[1-o.o];
        if(o.l>0&&Math.hypot(t.x-o.x,t.y-o.y)<20){t.hp-=20;o.l=0;if(t.hp<=0){snap();return won(o.o)}}}
      bl=bl.filter(o=>o.l>0);
    }
    snap();
  }
  const iv=setInterval(tick,33);round();
}
srv.listen(process.env.PORT||3000,()=>console.log('Server on port',process.env.PORT||3000));
