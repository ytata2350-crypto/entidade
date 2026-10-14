/** Caminhada, busca e descoberta na carta do domínio; recompensas vêm apenas do servidor. */
import { person, setPersonPose, advancePersonFrame, sprite } from './pixel.js';
import { sceneLayers } from './scenery.js';
const make=(tag,className,text)=>{ const e=document.createElement(tag); e.className=className; if(text!=null)e.textContent=text; return e; };
const spots=[.24,.62,.84];
const kinds=['hut','roots','crate'];
const artPart=(id,className='')=>{
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('class',className); svg.setAttribute('aria-hidden','true');
  const use=document.createElementNS('http://www.w3.org/2000/svg','use'); use.setAttribute('href',`/search-props.svg#${id}`);
  if(id==='hut')svg.setAttribute('viewBox','0 0 48 64');
  if(id.startsWith('bed-'))svg.setAttribute('viewBox','0 0 64 24');
  svg.append(use);return svg;
};

export class ExplorationScene {
  constructor(art,{lookFor,itemFor,rarityFor,iconFor,itemArtFor}) {
    Object.assign(this,{art,lookFor,itemFor,rarityFor,iconFor,itemArtFor});
    this.width=art.clientWidth||400; this.visible=false; this.paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.lastEvent=0; this.booted=false; this.x=.18; this.spot=0; this.camera=0;
    this.resize=new ResizeObserver(([e])=>{this.width=e.contentRect.width||400;
      this.scenery?.style.setProperty('--h',`${e.contentRect.height||340}px`);
    }); this.resize.observe(art);
    this.intersection=new IntersectionObserver(([e])=>{this.visible=e.isIntersecting;}); this.intersection.observe(art);
    this.frame=this.frame.bind(this); this.frameId=requestAnimationFrame(this.frame);
    window.addEventListener('pagehide',()=>this.destroy(),{once:true});
  }

  sync(region,player,events,serverTime=Date.now()) {
    this.readyAt=player?.readyAt||0; this.clockOffset=serverTime-Date.now();
    const seed=player?.login||'voce', appearance=this.lookFor(seed), key=`${seed}:${JSON.stringify(appearance)}`;
    if(this.region!==region.id) this.reset(region,seed,appearance);
    else if(this.lookKey!==key) {
      const pose=this.figure.dataset.pose||'idle';
      this.figure.replaceWith(this.figure=person(seed,'idle',3,'',appearance)); setPersonPose(this.figure,pose,this.facing);
      this.addSpade();
      advancePersonFrame(this.figure,0);
    }
    this.lookKey=key;
    const fresh=events.filter(e=>e.id>this.lastEvent);
    this.lastEvent=Math.max(this.lastEvent,...events.map(e=>e.id));
    if(this.booted && !this.manual && this.canAnimate()) {
      const discovery=fresh.find(e=>e.kind==='explore' && e.name===player?.name && Date.now()-e.createdAt<10000);
      if(discovery) { this.begin(); this.payload=this.payloadFor(discovery); }
    }
    this.booted=true;
  }

  reset(region,seed,appearance) {
    this.complete(); this.region=region.id; this.x=.15; this.camera=0; this.spot=0; this.phase='walk';
    this.particles=[]; this.itinerary=[]; this.destination=spots[0];
    this.art.classList.add('exploration-scene'); this.art.dataset.region=region.id;
    const scenery=sceneLayers(region.id,340); this.scenery=scenery;
    this.field=make('div','search-field'); this.props=make('div','search-props');
    this.propNodes=[];
    for(const [i,kind] of kinds.entries()) {
      const prop=make('div',`search-prop prop-${kind}`); prop.style.left=`${spots[i]*100}%`;
      if(kind==='crate') {
        const light=make('div','chest-radiance'); light.append(make('i','ray-one'),make('i','ray-two'),make('i','ray-three'));
        const motes=make('div','chest-motes');
        for(let m=0;m<7;m++){const mote=make('i','');mote.style.setProperty('--i',m);motes.append(mote);}
        prop.append(light,artPart('chest-base','chest-base'),artPart('chest-lid','chest-lid'),motes);
        prop.setAttribute('aria-label','Baú fechado'); this.chest=prop;
      } else {
        prop.append(artPart(kind));
        if(kind==='roots')prop.append(make('span','search-hole'));
        if(kind==='hut')prop.append(make('span','hut-window left-window'),make('span','hut-window right-window'),make('span','hut-door-light'));
      }
      prop.append(make('i','prop-glint')); this.props.append(prop); this.propNodes.push(prop);
    }
    const bed=make('div','search-bed');bed.append(artPart('bed-base'));
    const cover=make('div','search-bed-cover');cover.append(artPart('bed-cover'));
    this.props.append(bed);
    this.actor=make('div','world-avatar search-avatar');
    const body=make('div','actor-facing'); this.figure=person(seed,'idle',3,'',appearance); body.append(this.figure);
    this.addSpade();
    this.actor.append(make('span','world-shadow'),make('span','footstep-dust'),body);
    this.bubble=make('span','search-bubble'); this.bubble.hidden=true; this.actor.append(this.bubble);
    const sleep=make('span','search-sleep');sleep.setAttribute('aria-hidden','true');
    for(let i=0;i<3;i++){const z=make('i','','z');z.style.setProperty('--i',i);sleep.append(z);} this.actor.append(sleep);
    this.field.append(this.props,this.actor,cover);
    this.effects=make('div','search-effects');
    this.caption=make('span','scene-caption',`${region.name.toUpperCase()} · EXPLORANDO`);
    this.control=make('button','search-motion-control'); this.control.type='button';
    this.control.addEventListener('click',()=>{this.paused=!this.paused; if(this.paused)this.cancel(); this.paintControl();});
    const lights=make('div','search-fireflies');
    for(let i=0;i<6;i++){const light=make('i',''); light.style.cssText=`left:${12+i*15}%;top:${30+(i%3)*13}%;--delay:${i*-1.7}s;--flight:${6+i}s`; lights.append(light);}
    const things=[scenery,this.field,this.effects,lights,this.caption,this.control];
    if(region.id==='farol'||region.id==='limiar'){const landmark=sprite(region.id==='farol'?'farolOn':'gate','landmark');landmark.style.left='88%';things.splice(1,0,landmark);}
    this.art.replaceChildren(...things); this.paintControl(); this.paint();
  }

  paintControl() {
    this.art.dataset.motion=this.paused?'off':'on';
    this.control.textContent=this.paused?'Animar cenário':'Pausar cenário'; this.control.setAttribute('aria-pressed',String(this.paused));
  }
  canAnimate(){return this.visible && !this.paused && !document.hidden && !this.art.closest('[hidden]');}
  isRecovering(){return this.readyAt>Date.now()+(this.clockOffset||0);}
  addSpade() {
    const layer=make('div','person-layer search-spade');layer.style.setProperty('--layer','url(/sprites/layers/search-spade.svg)');
    this.figure.append(layer);
  }
  stopActions() {
    this.propNodes?.forEach(prop=>prop.classList.remove('is-active','is-struck','is-open','is-occupied'));
    this.chest?.setAttribute('aria-label','Baú fechado'); this.work=null; this.actor?.classList.remove('dig-impact');
    this.actor?.classList.remove('entering-hut','inside-hut','leaving-hut');
    this.actor?.classList.remove('is-resting');
  }
  walkTo(index) {
    this.stopActions(); this.spot=index;
    this.destination=Math.max(.12,spots[index]-(index===0?0:Math.min(27,this.width*.06)/this.width));
    this.phase='walk'; this.phaseAt=performance.now(); this.lastDigFrame=1;
  }
  begin() {
    this.complete(); this.manual=true; this.payload=null; this.clearFind(); this.itinerary=[2];
    const start=(this.expeditionCount||0)%2===0?0:1; this.expeditionCount=(this.expeditionCount||0)+1; this.walkTo(start);
    this.caption.textContent='SEGUINDO VESTÍGIOS';
    this.bubble.textContent='Seguindo vestígios…'; this.bubble.hidden=false;
  }
  payloadFor(result) {
    const item=this.itemFor(result.itemId||result.drops?.[0]?.id);
    return item?{item,rarity:this.rarityFor(item.rarity),quantity:result.drops?.[0]?.quantity||1,xp:result.xpGained}:null;
  }
  reveal(result) {
    this.payload=this.payloadFor(result);
    if(!this.payload||!this.canAnimate()){this.complete();return Promise.resolve();}
    return new Promise(resolve=>{this.resolve=resolve;this.fallback=setTimeout(()=>this.cancel(),10500);});
  }
  cancel(){this.complete();this.stopActions();this.clearFind();this.phase='idle';this.phaseAt=performance.now();if(this.bubble)this.bubble.hidden=true;}
  complete() {
    clearTimeout(this.fallback); this.resolve?.(); this.resolve=null; this.manual=false; this.payload=null;
  }
  clearFind(){this.drop?.remove();this.drop=null;this.effects?.replaceChildren();this.particles=[];}

  startWork(time) {
    if(this.isRecovering()&&!this.manual){this.returnToRest(time);return;}
    this.phase='search'; this.phaseAt=time; this.facing='right'; this.lastDigFrame=1;
    this.work={kind:kinds[this.spot],prop:this.propNodes[this.spot],opened:false};
    this.work.prop.classList.add('is-active');
    this.caption.textContent=this.work.kind==='roots'?'PROCURANDO SOB A TERRA…':this.work.kind==='crate'?'ABRINDO O BAÚ…':'VASCULHANDO A CASINHA…';
    setPersonPose(this.figure,this.work.kind==='roots'?'dig':this.work.kind==='crate'?'reach':'search','right');
    if(this.work.kind==='hut') {this.actor.classList.add('entering-hut');this.work.prop.classList.add('is-occupied');}
    this.bubble.hidden=false;
  }
  returnToRest(time) {
    const scale=parseFloat(getComputedStyle(this.art).getPropertyValue('--actor-scale'))||3;
    this.stopActions();this.clearFind();this.phase='return';this.phaseAt=time;this.destination=.46+11*scale/this.width;
    this.bubble.hidden=true;this.caption.textContent='VOLTANDO PARA DESCANSAR…';
  }
  openChest() {
    if(this.work.opened)return;
    this.work.opened=true;
    const color=this.payload?.item.rarity>=2?this.payload.rarity.color:'var(--gold)';
    this.chest.style.setProperty('--treasure-color',color);
    this.chest.classList.add('is-open');this.chest.setAttribute('aria-label','Baú aberto com brilho');
    this.caption.textContent='ALGO BRILHA ENTRE AS SOMBRAS…';
  }
  digImpact(time) {
    const burst=make('div','dig-burst');burst.style.left=`${spots[1]*100}%`;
    for(let i=0;i<7;i++){const dirt=make('i','');dirt.style.setProperty('--i',i);burst.append(dirt);}
    this.effects.append(burst);this.particles.push({node:burst,until:time+850});
    this.work.prop.classList.add('is-dug','is-struck');this.actor.classList.add('dig-impact');this.impactUntil=time+140;
  }

  found(time) {
    const {item,rarity,quantity}=this.payload;
    this.phase='found';this.phaseAt=time;this.bubble.textContent='Encontrei!';
    this.bubble.hidden=false;
    this.caption.textContent=`${quantity>1?quantity+'× ':''}${item.name} · ${rarity.name}`;
    this.drop=make('div','search-find'); this.drop.style.left=`${spots[this.spot]*100}%`;this.drop.style.setProperty('--find-color',rarity.color);
    this.drop.setAttribute('role','status');
    this.drop.append(this.itemArtFor?.(item)||this.iconFor(item.icon),make('span','',`${quantity>1?quantity+'× ':''}${item.name}`));
    const sparks=make('div','search-sparks');
    for(let i=0;i<7;i++){const spark=make('i','');spark.style.setProperty('--i',i);sparks.append(spark);}
    this.drop.append(sparks);this.effects.append(this.drop);
  }

  paint() {
    this.actor.style.transform=`translate3d(${(this.x*this.width).toFixed(2)}px,0,0)`;
    this.actor.querySelector('.actor-facing').style.setProperty('--facing',this.facing==='left'?-1:1);
    this.art.dataset.activity=this.phase;
    this.art.dataset.searchMode=this.phase==='search'?this.work?.kind||'':'';
    this.art.style.setProperty('--search-camera',`${this.camera.toFixed(2)}px`);
  }

  frame(time) {
    this.frameId=requestAnimationFrame(this.frame);
    const delta=Math.min(.06,(time-(this.previousFrame||time))/1000);this.previousFrame=time;
    if(!this.figure)return;
    if(!this.canAnimate()){if(this.resolve)this.complete();return;}
    const recovering=this.isRecovering();
    if(recovering&&!this.manual&&!['return','rest'].includes(this.phase))this.returnToRest(time);
    if(!recovering&&['return','rest'].includes(this.phase)) {
      this.stopActions();this.phase='idle';this.phaseAt=time;
      this.caption.textContent='DESCANSO CONCLUÍDO · PRONTA PARA EXPLORAR';
      this.bubble.textContent='Vamos nessa!';this.bubble.hidden=false;
    }
    if(this.phase==='walk'||this.phase==='return') {
      const headingHome=this.phase==='return';
      const dx=(this.destination-this.x)*this.width,step=(this.manual?Math.max(85,this.width*.3):46)*delta;
      this.facing=dx<0?'left':'right';
      if(Math.abs(dx)<=step+1){
        this.x=this.destination;
        if(headingHome){this.phase='rest';this.phaseAt=time;this.facing='right';this.actor.classList.add('is-resting');setPersonPose(this.figure,'sleep','right');this.caption.textContent='DORMINDO · RECUPERANDO O FÔLEGO';}
        else this.startWork(time);
      }
      else this.x+=Math.sign(dx)*step/this.width;
      if(this.phase==='walk'||this.phase==='return')setPersonPose(this.figure,'walk',this.facing);
    } else if(this.phase==='search') {
      const elapsed=time-this.phaseAt, kind=this.work.kind;
      this.bubble.hidden=false;
      this.bubble.textContent=kind==='roots'?'Cavando…':kind==='crate'?'Abrindo o baú…':'Vasculhando a casinha…';
      setPersonPose(this.figure,kind==='roots'?'dig':kind==='crate'?'reach':'search','right');
      if(kind==='crate'&&elapsed>650)this.openChest();
      if(kind==='hut'&&elapsed>650)this.actor.classList.add('inside-hut');
      if(kind==='hut'&&elapsed>2100) {
        this.actor.classList.remove('inside-hut','entering-hut');this.actor.classList.add('leaving-hut');
        this.phase='exit';this.phaseAt=time;this.bubble.hidden=true;
      }
      else if(this.manual&&kind==='roots'&&elapsed>1750)this.walkTo(this.itinerary.shift()??2);
      else if(kind==='crate'&&elapsed>1450&&this.payload)this.found(time);
      else if(!this.manual&&elapsed>(kind==='crate'?2700:2200)){this.phase='idle';this.phaseAt=time;this.bubble.hidden=true;}
    } else if(this.phase==='exit') {
      setPersonPose(this.figure,'walk','left');this.facing='left';
      if(time-this.phaseAt>550){
        if(this.manual)this.walkTo(this.itinerary.shift()??2);
        else{this.stopActions();this.phase='idle';this.phaseAt=time;}
      }
    } else if(this.phase==='found') {
      setPersonPose(this.figure,'celebrate','front');
      if(time-this.phaseAt>1600){this.complete();this.phase='idle';this.phaseAt=time;this.bubble.hidden=true;}
    } else if(this.phase==='rest') {
      setPersonPose(this.figure,'sleep','right');this.facing='right';this.bubble.hidden=true;
    } else {
      setPersonPose(this.figure,'idle','front');
      if(time-this.phaseAt>(this.phase==='rest'?1800:1100)){
        this.clearFind();this.walkTo((this.spot+1)%spots.length);
        this.caption.textContent=this.isRecovering()?'PREPARANDO A PRÓXIMA BUSCA':'SEGUINDO VESTÍGIOS';
      }
    }
    const cameraTarget=(this.x-.5)*this.width*.07;
    this.camera+=(cameraTarget-this.camera)*Math.min(1,delta*1.8);
    const frame=advancePersonFrame(this.figure,delta);
    if(this.phase==='search'&&this.work?.kind==='roots') {
      if(frame===0&&this.lastDigFrame===1)this.digImpact(time);
      this.lastDigFrame=frame;
    }
    if(time>this.impactUntil){this.actor.classList.remove('dig-impact');this.propNodes[1].classList.remove('is-struck');}
    this.particles=this.particles.filter(p=>{if(p.until>time)return true;p.node.remove();return false;});
    this.paint();
  }
  destroy(){this.complete();cancelAnimationFrame(this.frameId);this.resize.disconnect();this.intersection.disconnect();}
}
