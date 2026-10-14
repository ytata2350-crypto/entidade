/** @file Cena contínua da prova: deslocamento, tarefas e efeitos dirigidos por eventos do servidor. */
import { person, paleHunter, sprite, setPersonPose, advancePersonFrame, addWoundLayers } from './pixel.js';
import { sceneLayers } from './scenery.js';

const clamp = (value, low = .045, high = .94) => Math.max(low, Math.min(high, value));
const element = (tag, className, text) => {
  const result = document.createElement(tag); result.className = className;
  if (text != null) result.textContent = text;
  return result;
};
const beaconX = (index, count) => .29 + index * (.55 / Math.max(1, count - 1));
const terminal = (state) => ['caught', 'dead', 'escaped'].includes(state);

export class TrialScene {
  constructor(stage, { lookFor, prefix = () => '!' }) {
    this.stage = stage; this.lookFor = lookFor; this.prefix = prefix;
    this.actors = new Map(); this.lastEvent = 0; this.effects = [];
    this.width = stage.clientWidth || 700; this.visible = false; this.booted = false;
    this.paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.motionButton = document.getElementById('toggle-scene');
    this.motionButton.addEventListener('click', () => {
      this.paused = !this.paused;
      for (const actor of this.actors.values()) {
        this.cancelCarry(actor);
        actor.queue = []; actor.task = null; actor.pendingAttack = actor.pendingCare = false;
        this.applyWounds(actor, actor.serverWounds); this.paintState(actor, actor.serverState, { snap: true });
      }
      if (this.hunter) { this.hunter.queue = []; this.hunter.task = null; this.hunter.root.classList.remove('is-attacking'); }
      this.paintMotionControl();
    });
    this.paintMotionControl();
    this.resize = new ResizeObserver(([entry]) => {
      this.width = entry.contentRect.width || 700;
      if(this.hunter)this.hunter.actorScale=parseFloat(getComputedStyle(this.hunter.root).getPropertyValue('--actor-scale'))||3;
    });
    this.resize.observe(stage);
    this.intersection = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; });
    this.intersection.observe(stage);
    this.frame = this.frame.bind(this);
    this.frameId = requestAnimationFrame(this.frame);
    window.addEventListener('pagehide', () => this.destroy(), { once: true });
  }

  paintMotionControl() {
    this.stage.dataset.motion = this.paused ? 'off' : 'on';
    this.motionButton.textContent = this.paused ? 'Ativar movimentos' : 'Pausar movimentos';
    this.motionButton.setAttribute('aria-pressed', String(this.paused));
  }

  reset(trial) {
    this.actors.clear(); this.effects = []; this.hunter = null;
    this.stage.style.setProperty('--camera', '0px'); this.camera = 0;
    this.stage.replaceChildren(sceneLayers(trial?.hunter?.id || 'none', 330));
    this.beaconLayer = element('div', 'world-beacons');
    this.actorLayer = element('div', 'world-actors');
    this.captivity = element('div', 'captivity-site');
    this.captivity.append(element('div', 'captivity-platform back-platform'), element('div', 'captivity-platform'), element('span', '', 'GRILHÕES'));
    this.actorLayer.append(this.captivity);
    this.effectLayer = element('div', 'world-effects');
    this.caption = element('div', 'scene-caption');
    this.gate = element('div', 'world-gate'); this.gate.append(sprite('gate'));
    this.stage.append(this.beaconLayer, this.gate, this.actorLayer, this.effectLayer, this.caption);
    this.beacons = []; this.lastEvent = 0;
  }

  createActor(entry, index, me) {
    const actor = { slot: index, login: entry.login, name: entry.name, x: .32 + index * .14, target: .35,
      direction: 1, heading: 'front', y: index % 2 ? 8 : -3, targetY: 0, serverState: entry.state, visualState: entry.state, queue: [], task: null,
      waitUntil: performance.now() + index * 350, hidden: entry.hidden, nextRoam: 0,
      serverWounds: entry.wounds ?? (entry.state === 'caught' ? 2 : entry.state === 'hurt' ? 1 : 0) };
    actor.root = element('div', `world-avatar${entry.login === me ? ' is-me' : ''}`);
    actor.root.dataset.actor = entry.login;
    actor.shadow = element('span', 'world-shadow');
    actor.facing = element('div', 'actor-facing');
    actor.figure = addWoundLayers(person(entry.login, 'idle', 3, '', this.lookFor(entry.login)));
    actor.lookKey = JSON.stringify(this.lookFor(entry.login));
    actor.facing.append(actor.figure);
    actor.label = element('span', 'actor-name', `${entry.name}${entry.login === me ? ' · você' : ''}`);
    actor.bubble = element('span', 'actor-bubble'); actor.bubble.hidden = true;
    actor.chains = element('span', 'actor-chains');
    actor.root.append(actor.shadow, actor.facing, actor.label, actor.bubble, actor.chains);
    this.actorLayer.append(actor.root); this.actors.set(entry.login, actor);
    this.applyWounds(actor, actor.serverWounds);
    this.paintState(actor, entry.state, { snap: true });
    advancePersonFrame(actor.figure, 0);
    return actor;
  }

  createHunter() {
    this.hunter = { x: .89, target: .73, y: -3, targetY: 0, direction: -1, heading: 'left', queue: [], task: null, nextRoam: 0, serverState: 'ok' };
    const hunter = this.hunter;
    hunter.root = element('div', 'world-avatar world-hunter'); hunter.root.dataset.actor = 'palido';
    hunter.facing = element('div', 'hunter-facing');
    hunter.figure = paleHunter(); hunter.facing.append(hunter.figure);
    hunter.label = element('span', 'actor-name', this.trial?.hunter?.name || 'O Pálido');
    hunter.root.append(element('span', 'world-shadow'), hunter.facing, element('span', 'carrying-arm'), hunter.label);
    this.actorLayer.append(hunter.root);
    hunter.actorScale=parseFloat(getComputedStyle(hunter.root).getPropertyValue('--actor-scale'))||3;
  }

  sync(trial, me, serverTime) {
    this.clockOffset = serverTime - Date.now();
    const key = trial ? `${trial.id ?? trial.openedAt ?? trial.hunter.id}` : 'camp';
    const changed = key !== this.key;
    if (changed) { this.key = key; this.reset(trial); }
    this.trial = trial;
    this.stage.dataset.phase = trial?.phase || 'none';
    this.caption.textContent = !trial ? 'ACAMPAMENTO · SOBREVIVENTES À VONTADE'
      : trial.phase === 'lobby' ? 'REUNINDO O GRUPO' : trial.phase === 'ended' ? 'A CAÇADA TERMINOU' : 'A CAÇADA ESTÁ ACONTECENDO';
    const incoming = (trial?.sceneEvents || []).filter(event => event.id > this.lastEvent);
    const recent = incoming.filter(event => serverTime - event.at < 10_000);
    const animate = !this.paused && this.visible && !document.hidden && !this.stage.closest('[hidden]');
    if (!animate) for (const actor of this.actors.values()) this.cancelCarry(actor);
    const affected = new Set(recent.flatMap(event => [event.actor, event.target]).filter(Boolean));
    const entries = trial?.players || [{ login: me || 'voce', name: 'Você', state: 'ok' }];
    const keep = new Set(entries.map(entry => entry.login));
    for (const [login, actor] of this.actors) {
      if (!keep.has(login)) { this.cancelCarry(actor); actor.root.remove(); this.actors.delete(login); }
    }
    entries.forEach((entry, index) => {
      const actor = this.actors.get(entry.login) || this.createActor(entry, index, me);
      actor.serverState = entry.state; actor.hidden = entry.hidden;
      actor.serverWounds = entry.wounds ?? (entry.state === 'caught' ? 2 : entry.state === 'hurt' ? 1 : 0);
      actor.name = entry.name; actor.root.classList.toggle('is-me', entry.login === me);
      actor.label.textContent = `${entry.name}${entry.login === me ? ' · você' : ''}`;
      const lookKey = JSON.stringify(this.lookFor(entry.login));
      if (actor.lookKey !== lookKey) {
        actor.lookKey = lookKey;
        const pose = actor.figure.dataset.pose || 'idle';
        actor.figure.replaceWith(actor.figure = addWoundLayers(person(entry.login, 'idle', 3, '', this.lookFor(entry.login))));
        setPersonPose(actor.figure, pose, actor.heading); advancePersonFrame(actor.figure, 0);
      }
      if (!animate) { actor.task = null; actor.queue = []; actor.pendingAttack = actor.pendingCare = false; }
      if (!animate || !affected.has(entry.login) && !actor.task && !actor.queue.length && !actor.pendingAttack && !actor.pendingCare) {
        this.applyWounds(actor, actor.serverWounds);
        this.paintState(actor, entry.state, { snap: !animate });
      }
      if (!entry.hidden && actor.task?.kind === 'hide') actor.task.until = performance.now();
    });
    this.syncBeacons(trial?.generators || [0]);
    this.gate.hidden = !trial?.gates;
    this.stage.classList.toggle('gate-is-open', !!trial?.gates);
    if (trial && trial.phase !== 'ended' && !this.hunter) this.createHunter();
    if (!this.booted) {
      // Uma página aberta no meio da partida mostra o presente, sem repetir ataques antigos.
      this.lastEvent = Math.max(0, ...(trial?.sceneEvents || []).map(event => event.id));
      this.booted = true;
    } else {
      for (const event of recent) if (animate) this.route(event);
      this.lastEvent = Math.max(this.lastEvent, ...incoming.map(event => event.id));
    }
    if (trial?.phase === 'ended' && this.hunter && !this.hunter.leaving) {
      this.hunter.leaving = true; this.enqueue(this.hunter, { kind: 'leave', goal: 1.12, duration: 0 });
    }
    if (changed && !trial) this.caption.textContent = 'ACAMPAMENTO · ANTES DA PRÓXIMA PROVA';
    if (!animate) {
      for (const actor of this.actors.values()) this.place(actor);
      if (this.hunter) {
        this.hunter.queue = []; this.hunter.task = null; this.hunter.root.classList.remove('is-attacking');
        if (trial?.phase === 'ended') this.hunter.root.hidden = true;
        this.place(this.hunter);
      }
    }
  }

  syncBeacons(values) {
    while (this.beacons.length > values.length) this.beacons.pop().root.remove();
    values.forEach((value, index) => {
      let beacon = this.beacons[index];
      if (!beacon) {
        const root = element('div', 'world-beacon'); root.dataset.beacon = index;
        const art = element('div', 'beacon-art');
        const label = element('span', 'beacon-name');
        const meter = element('span', 'beacon-meter'); meter.append(element('i', ''));
        root.append(art, label, meter); this.beaconLayer.append(root);
        beacon = { root, art, label, meter, value: -1 }; this.beacons.push(beacon);
      }
      beacon.x = beaconX(index, values.length); beacon.root.style.left = `${100 * beacon.x}%`;
      beacon.label.textContent = `F${index + 1} · ${Math.floor(value)}%`;
      beacon.meter.firstChild.style.width = `${value}%`;
      if (beacon.value !== value) {
        beacon.art.replaceChildren(sprite(value >= 100 ? 'farolOn' : 'farolOff'));
        beacon.root.classList.toggle('is-lit', value >= 100); beacon.value = value;
      }
    });
  }

  enqueue(actor, task) {
    if (!actor) return;
    actor.queue.push(task);
    if (actor.queue.length > 5) actor.queue.shift();
  }

  bubble(actor, text, duration = 2100) {
    if (!actor?.bubble) return;
    actor.bubble.textContent = text; actor.bubble.hidden = false;
    actor.bubbleUntil = performance.now() + duration;
  }

  route(event) {
    const actor = this.actors.get(event.actor);
    const target = this.actors.get(event.target);
    switch (event.kind) {
      case 'join':
        if (actor) { actor.x = .24; this.enqueue(actor, { kind: 'join', goal: .32 + actor.slot * .14, duration: 200 }); this.bubble(actor, 'Cheguei!'); }
        break;
      case 'start': this.flash('A CAÇADA COMEÇOU', .5, 'announcement'); break;
      case 'repair':
        this.enqueue(actor, { ...event, kind: 'repair', goal: beaconX(event.generator, this.beacons.length) + [28, -28, 48, -48][actor?.slot || 0] / Math.max(280, this.width), goalY: 0, duration: 2500 });
        this.bubble(actor, `${this.prefix()}reparar`); break;
      case 'hide': {
        if (!actor) break;
        const places = [.28, .48, .68, .91];
        const goal = places.reduce((best, x) => Math.abs(x - actor.x) < Math.abs(best - actor.x) ? x : best, places[0]);
        this.enqueue(actor, { kind: 'hide', goal, duration: 25_000 }); this.bubble(actor, 'Escondendo…'); break;
      }
      case 'heal': case 'rescue':
        if (target && (target.carrier || target.awaitingCarry)) this.cancelCarry(target);
        if (target) { target.waitUntil = performance.now() + 4000; target.pendingCare = true; }
        this.enqueue(actor, { ...event, goal: target ? target.x + (target.x < .8 ? .05 : -.05) : actor?.x, duration: 1800 });
        this.bubble(actor, event.kind === 'heal' ? 'Cuidando de você' : 'Vou te libertar!'); break;
      case 'attack':
        if (this.hunter && target) { target.pendingAttack = true; this.enqueue(this.hunter, { ...event, duration: 430 }); }
        break;
      case 'escape':
        if (actor) { this.paintState(actor, 'ok'); this.enqueue(actor, { kind: 'escape', goal: 1.1, duration: 0 }); this.bubble(actor, 'O portão!'); }
        break;
      case 'death':
        if (actor) { this.cancelCarry(actor); actor.queue = []; actor.task = null; this.paintState(actor, 'dead'); this.bubble(actor, 'A névoa me levou…'); }
        break;
      case 'beacon':
        this.flash(`FAROL ${event.generator + 1} ACESO`, beaconX(event.generator, this.beacons.length), 'gold'); break;
      case 'gate': this.flash('PORTÃO ABERTO · CORRAM!', .5, 'announcement'); break;
    }
  }

  applyWounds(actor, wounds) {
    actor.wounds = Math.max(0, Math.min(3, Number(wounds) || 0));
    actor.root.dataset.wounds = actor.wounds;
  }

  captivePosition(actor) {
    const spacing = Math.min(47, this.width * .105);
    const gap = matchMedia('(max-width:600px)').matches ? 48 : 72;
    return { x: (Math.min(45, this.width * .09) + actor.slot % 2 * spacing) / this.width, y: actor.slot < 2 ? -gap : 0 };
  }

  seatCaptive(actor, snap) {
    if(snap && (actor.carrier || actor.awaitingCarry))this.cancelCarry(actor);
    const position = this.captivePosition(actor);
    if (!actor.captive || snap) {
      actor.captive = true; actor.queue = []; actor.task = null;
      if (snap) {
        actor.x = position.x; actor.y = position.y; actor.heading = 'front';
        actor.seated = true; actor.root.dataset.captive = 'seated';
        setPersonPose(actor.figure, 'seated');
      } else {
        actor.seated = false; actor.awaitingCarry = true; actor.root.dataset.captive = 'downed';
        actor.root.classList.add('is-downed'); setPersonPose(actor.figure, 'downed', 'right');
        if (this.hunter) this.hunter.queue.unshift({ kind: 'carry', target: actor.login, phase: 'approach' });
        else this.seatCaptive(actor, true);
      }
    }
  }

  /** A captura visual mantém a vítima no chão até o Pálido levantá-la. */
  cancelCarry(actor) {
    const hunter = actor.carrier || this.hunter;
    if (hunter) {
      hunter.queue = hunter.queue.filter(task => task.kind !== 'carry' || task.target !== actor.login);
      if (hunter.task?.kind === 'carry' && hunter.task.target === actor.login) {
        hunter.task = null; hunter.root.dataset.action = ''; delete hunter.root.dataset.carryPhase;
        hunter.root.classList.remove('is-lifting','is-carrying');
      }
    }
    const inTransit = actor.carrier || actor.awaitingCarry;
    actor.carrier = null; actor.awaitingCarry = false; actor.carryDrop = 0; delete actor.carryDirection;
    actor.root.classList.remove('is-carried','is-downed'); actor.root.style.removeProperty('--carry-drop');
    if (inTransit) { actor.captive = actor.seated = false; delete actor.root.dataset.captive; setPersonPose(actor.figure,'idle',actor.heading); }
  }

  updateCarry(hunter, task, time, delta) {
    const victim = this.actors.get(task.target);
    if (!victim || victim.serverState !== 'caught' || victim.visualState !== 'caught') {
      if (victim) {this.cancelCarry(victim);this.paintState(victim,victim.serverState);}
      hunter.task = null; hunter.root.classList.remove('is-lifting','is-carrying');
      delete hunter.root.dataset.carryPhase; hunter.root.dataset.action = ''; return;
    }
    let moving = false;
    if (task.phase === 'approach') {
      moving = this.move(hunter, victim.x + (hunter.x < victim.x ? -.025 : .025), Math.max(170,this.width*.4), delta, victim.y);
      if (!moving) { task.phase='pickup';task.phaseAt=time;hunter.root.classList.add('is-lifting');this.bubble(victim,'Não consigo levantar…',1000); }
    } else if (task.phase === 'pickup') {
      if (time-task.phaseAt>=650) {
        task.phase='haul';task.phaseAt=time;victim.awaitingCarry=false;victim.carrier=hunter;victim.carryDrop=0;
        victim.root.classList.remove('is-downed','is-struck','is-dodging');victim.root.classList.add('is-carried');
        victim.root.dataset.captive='carried';victim.bubble.hidden=true;setPersonPose(victim.figure,'carried','right');
        hunter.root.classList.remove('is-lifting');hunter.root.classList.add('is-carrying');
        this.caption.textContent='O PÁLIDO ESTÁ LEVANDO UM SOBREVIVENTE AOS GRILHÕES';
      }
    } else if (task.phase === 'haul') {
      const goal=this.captivePosition(victim);
      // O Pálido vai até a base dos grilhões pelo chão. Só a vítima alcança a plataforma elevada.
      moving=this.move(hunter,goal.x+Math.min(52,this.width*.12)/Math.max(280,this.width),Math.max(115,this.width*.24),delta,0);
      if (!moving) {
        task.phase='putdown';task.phaseAt=time;victim.carryDirection=hunter.heading==='left'?-1:1;
        hunter.heading='back';hunter.root.classList.add('is-lifting');victim.root.dataset.captive='lowering';
        this.caption.textContent='O PÁLIDO COLOCA O SOBREVIVENTE SOBRE OS GRILHÕES';
      }
    } else if (task.phase === 'putdown') {
      const progress=Math.min(1,(time-task.phaseAt)/950);victim.carryDrop=progress*progress*(3-2*progress);
      if(progress>=.5)victim.root.dataset.captive='placing';
      if(progress>=1) {
        this.cancelCarry(victim);this.seatCaptive(victim,true);
        this.bubble(victim,'Preso · preciso de ajuda',2400);
        this.caption.textContent='NOS GRILHÕES · OS ALIADOS PODEM LIBERTAR';
        hunter.waitUntil=time+500;hunter.nextRoam=time+550;
      }
    }
    hunter.root.dataset.carryPhase=task.phase;hunter.root.dataset.action='carry';
    hunter.root.classList.toggle('is-moving',moving);
    setPersonPose(hunter.figure,moving?'walk':'idle',hunter.heading);
    if (!hunter.task) {delete hunter.root.dataset.carryPhase;hunter.root.dataset.action='';}
  }

  paintState(actor, state, { snap = false } = {}) {
    if (state !== 'caught' && (actor.carrier || actor.awaitingCarry)) this.cancelCarry(actor);
    if (snap && (actor.carrier || actor.awaitingCarry)) this.cancelCarry(actor);
    const wasCaptive = actor.captive;
    actor.visualState = state;
    for (const name of ['hurt', 'caught', 'dead', 'escaped']) actor.root.classList.toggle(`is-${name}`, state === name);
    actor.root.hidden = state === 'escaped';
    if (state === 'caught') this.seatCaptive(actor, snap);
    else if (wasCaptive && state === 'hurt') {
      actor.captive = actor.seated = false; delete actor.root.dataset.captive;
      actor.queue = []; actor.task = null; actor.heading = 'right';
      if (!snap) this.enqueue(actor, { kind: 'return', goal: .32 + actor.slot * .14, goalY: 0, duration: 0 });
      setPersonPose(actor.figure, 'idle', actor.heading);
    }
    else if (terminal(state)) { actor.target = actor.x; setPersonPose(actor.figure, state); }
    else if (!actor.task) setPersonPose(actor.figure, 'idle', actor.heading);
    advancePersonFrame(actor.figure, 0);
  }

  flash(text, x, tone = 'gold') {
    const effect = element('div', `world-float ${tone}`, text);
    effect.style.left = `${100 * x}%`; this.effectLayer.append(effect);
    this.effects.push({ node: effect, expires: performance.now() + 2600 });
  }

  burst(x, tone = 'gold') {
    const effect = element('div', `world-burst ${tone}`); effect.style.left = `${100 * x}%`;
    for (let i = 0; i < 8; i++) {
      const particle = element('i', ''); particle.style.setProperty('--i', i);
      effect.append(particle);
    }
    this.effectLayer.append(effect); this.effects.push({ node: effect, expires: performance.now() + 1400 });
  }

  arrive(actor, task, time) {
    task.arrived = true; task.until = time + task.duration;
    actor.root.dataset.action = task.kind;
    if (task.kind === 'repair') {
      actor.direction = beaconX(task.generator, this.beacons.length) < actor.x ? -1 : 1; actor.heading = actor.direction < 0 ? 'left' : 'right'; setPersonPose(actor.figure, 'repair', actor.heading);
      this.burst(beaconX(task.generator, this.beacons.length));
      this.flash(`+${task.amount}%`, actor.x, 'gold');
      this.bubble(actor, task.boxed ? 'Reparando · usando caixa' : 'Reparando…', task.duration);
    } else if (task.kind === 'hide') { setPersonPose(actor.figure, 'hide'); this.bubble(actor, 'Oculto', 2600); }
    else if (task.kind === 'heal' || task.kind === 'rescue') {
      setPersonPose(actor.figure, 'heal');
      const target = this.actors.get(task.target);
      if (target) {
        target.pendingCare = false; this.applyWounds(target, task.wounds ?? target.serverWounds);
        this.paintState(target, task.kind === 'heal' ? 'ok' : 'hurt'); this.bubble(target, task.kind === 'heal' ? 'Curado ♥' : 'Livre!');
      }
      this.burst(target?.x ?? actor.x, 'green'); this.flash(task.kind === 'heal' ? '♥ CURA' : 'GRILHÕES ROMPIDOS', actor.x, 'green');
    } else if (task.kind === 'attack') {
      const victim = this.actors.get(task.target);
      if (victim) {
        victim.pendingAttack = false;
        victim.task = null; victim.queue = []; victim.waitUntil = time + 1400;
        if (['hit', 'caught'].includes(task.outcome)) this.applyWounds(victim, task.wounds ?? Math.min(3, victim.wounds + 1));
        this.paintState(victim, task.outcome === 'caught' ? 'caught' : task.outcome === 'hit' ? 'hurt' : victim.visualState);
        victim.root.classList.remove('is-dodging', 'is-struck');
        const hit = task.outcome === 'hit' || task.outcome === 'caught';
        victim.root.classList.add(hit ? 'is-struck' : 'is-dodging');
        if (hit) {
          this.blood(victim); actor.root.classList.add('fresh-blood'); actor.bloodUntil = time + 1300;
        }
        victim.reactionUntil = time + 700;
        this.bubble(victim, task.outcome === 'miss' ? 'Por pouco!' : task.outcome === 'caught' ? 'Me libertem!' : task.outcome === 'secondWind' ? 'Segundo fôlego!' : 'Fui atingido!');
        this.burst(victim.x, hit ? 'red' : 'gold');
      }
      actor.root.classList.add('is-attacking'); setPersonPose(actor.figure, 'attack', actor.heading);
      if (['hit', 'caught'].includes(task.outcome)) { this.stage.classList.add('attack-impact'); this.impactUntil = time + 450; }
    } else if (task.kind === 'escape') {
      this.paintState(actor, 'escaped'); this.flash('ESCAPOU!', .91, 'green');
    } else if (task.kind === 'leave') actor.root.hidden = true;
  }

  blood(actor) {
    const cloud = element('div', 'world-blood');
    cloud.style.left = String(actor.x * 100) + '%';
    cloud.style.setProperty('--lane', String(actor.y || 0) + 'px');
    for (let i = 0; i < 9; i++) {
      const drop = element('i', '');
      drop.style.setProperty('--dx', String((i - 4) * 7) + 'px');
      drop.style.setProperty('--rise', String(8 + (i % 3) * 8) + 'px');
      drop.style.setProperty('--drop-size', String(2 + i % 2) + 'px');
      cloud.append(drop);
    }
    const stain = element('div', 'world-blood-stain');
    stain.style.left = String(actor.x * 100) + '%'; stain.style.setProperty('--lane', String(actor.y || 0) + 'px');
    this.effectLayer.append(cloud, stain);
    this.effects.push({node: cloud, expires: performance.now() + 1300}, {node: stain, expires: performance.now() + 6200});
  }

  move(actor, goal, speed, delta, goalY = actor.targetY || 0) {
    const width = Math.max(280, this.width);
    const dx = (goal - actor.x) * width, dy = goalY - (actor.y || 0);
    const distance = Math.hypot(dx, dy), step = speed * delta;
    if (distance <= step + .8) { actor.x = goal; actor.y = goalY; return false; }
    actor.direction = dx >= 0 ? 1 : -1;
    actor.heading = Math.abs(dy) > Math.abs(dx) * .65 ? dy > 0 ? 'front' : 'back' : dx > 0 ? 'right' : 'left';
    actor.x += dx / distance * step / width; actor.y += dy / distance * step;
    return true;
  }

  updateActor(actor, time, delta, hunter = false) {
    if (actor.bubbleUntil < time && actor.bubble) actor.bubble.hidden = true;
    if (actor.reactionUntil < time) actor.root.classList.remove('is-dodging', 'is-struck');
    if (actor.bloodUntil < time) actor.root.classList.remove('fresh-blood');
    if (actor.carrier) {advancePersonFrame(actor.figure,delta);return;}
    if (actor.seated && actor.captive && actor.visualState === 'caught') {
      const position = this.captivePosition(actor); actor.x = position.x; actor.y = position.y;
    }
    if (!actor.task && actor.queue.length && time >= (actor.queue[0].notBefore || 0)) {
      actor.task = actor.queue.shift(); actor.task.started = time; actor.root.hidden = false;
    }
    const task = actor.task;
    if (hunter && task?.kind === 'carry') {
      this.updateCarry(actor,task,time,delta);actor.stepFrame=advancePersonFrame(actor.figure,delta);this.place(actor,true);return;
    }
    let moving = false;
    if (task) {
      let goal = task.goal; let goalY = task.goalY ?? 0;
      if (task.kind === 'attack') { const victim = this.actors.get(task.target); goal = (victim?.x ?? actor.x) + (actor.x < (victim?.x ?? .5) ? -.035 : .035); goalY = victim?.y || 0; }
      if (task.kind === 'heal' || task.kind === 'rescue') { const target = this.actors.get(task.target); if (target) { goal = target.x + .05; goalY = target.y || 0; } }
      if (!task.arrived) {
        const speed = Math.max(hunter ? 260 : 140, this.width * (hunter ? .55 : .38));
        moving = this.move(actor, goal ?? actor.x, speed, delta, goalY);
        if (!moving) this.arrive(actor, task, time);
      } else if (time >= task.until || task.kind === 'hide' && !actor.hidden) {
        actor.task = null; actor.root.dataset.action = ''; actor.root.classList.remove('is-attacking');
        actor.waitUntil = time + 350; actor.nextRoam = time + 400;
        if (!hunter) this.paintState(actor, actor.serverState);
      }
    } else if (hunter || !terminal(actor.visualState)) {
      const roam = hunter ? this.trial?.phase !== 'ended' : this.trial?.phase !== 'ended' || !this.trial;
      if (roam && time >= (actor.waitUntil || 0)) {
        if (time >= actor.nextRoam) {
          const living = [...this.actors.values()].filter(item => !terminal(item.serverState));
          actor.target = hunter && living.length ? clamp(living[Math.floor(Math.random() * living.length)].x + (Math.random() < .5 ? -.14 : .14), .25, .94) : .28 + Math.random() * .62;
          actor.targetY = -7 + Math.random() * 20;
          if (!hunter && Math.random() < .3) actor.target = clamp(actor.x + (Math.random() - .5) * .025);
          actor.nextRoam = time + 3200 + Math.random() * 3500;
        }
        moving = this.move(actor, actor.target, hunter ? 55 : actor.serverState === 'hurt' ? 31 : 48, delta);
        if (!moving) actor.waitUntil = time + 400 + Math.random() * 900;
      }
    }
    actor.root.classList.toggle('is-moving', moving);
    if (moving) setPersonPose(actor.figure, !hunter && actor.wounds > 0 ? 'limp' : task ? 'run' : 'walk', actor.heading);
    else if (!task && (hunter || !terminal(actor.visualState))) setPersonPose(actor.figure, 'idle', actor.heading);
    actor.stepFrame=advancePersonFrame(actor.figure, delta);
    this.place(actor, hunter);
  }

  place(actor, hunter = false) {
    if (actor.carrier) {
      const carrier=actor.carrier,scale=carrier.actorScale||3;
      const direction=actor.carryDirection ?? (carrier.heading==='left'?-1:1), drop=actor.carryDrop||0, seat=this.captivePosition(actor);
      const shoulderX=carrier.x+direction*4*scale/this.width,shoulderY=(carrier.y||0)-24*scale+(carrier.stepFrame%3===1?1.5:0);
      actor.x=carrier.x;actor.y=carrier.y;actor.heading=carrier.heading;
      actor.root.style.transform=`translate3d(${((shoulderX+(seat.x-shoulderX)*drop)*this.width).toFixed(2)}px,${(shoulderY+(seat.y-shoulderY)*drop).toFixed(2)}px,0)`;
      actor.root.style.setProperty('--carry-drop',drop.toFixed(3));
      actor.facing.style.setProperty('--facing',direction);actor.root.style.zIndex=String(11+Math.round(carrier.y||0));
      actor.root.dataset.motion='carried';return;
    }
    actor.root.style.transform = `translate3d(${(actor.x * this.width).toFixed(2)}px,${(actor.y || 0).toFixed(2)}px,0)`;
    actor.facing.style.setProperty('--facing', actor.heading === 'left' ? -1 : 1);
    actor.root.style.zIndex = actor.visualState === 'dead' ? '1' : String(10 + Math.round(actor.y || 0));
    actor.root.dataset.motion = actor.task?.kind || (actor.root.classList.contains('is-moving') ? 'walk' : 'idle');
  }

  frame(time) {
    this.frameId = requestAnimationFrame(this.frame);
    const delta = Math.min(.06, (time - (this.previousFrame || time)) / 1000); this.previousFrame = time;
    if (this.paused || !this.visible || document.hidden || this.stage.closest('[hidden]')) return;
    const actors = [...this.actors.values()];
    for (let i = 0; i < actors.length; i++) {
      const actor = actors[i];
      for (const other of actors.slice(i + 1)) {
        if (!actor.task && !other.task && !terminal(actor.visualState) && !terminal(other.visualState) && Math.abs(actor.x - other.x) < 36 / Math.max(280, this.width)) {
          actor.target = clamp(actor.x - .12, .27, .94); other.target = clamp(other.x + .12, .27, .94);
          actor.nextRoam = other.nextRoam = time + 2200;
        }
      }
      this.updateActor(actor, time, delta);
    }
    if (this.hunter) this.updateActor(this.hunter, time, delta, true);
    // Depois do passo do Pálido, a vítima usa a mesma posição e o mesmo balanço, sem trajetória própria.
    for (const actor of actors) if (actor.carrier) this.place(actor);
    const living = actors.filter(actor => !terminal(actor.visualState));
    const focus = living.length ? living.reduce((sum, actor) => sum + actor.x, 0) / living.length : .5;
    const cameraTarget = clamp((focus - .5) * this.width * .14, -Math.min(25, this.width * .035), Math.min(25, this.width * .035));
    this.camera += (cameraTarget - this.camera) * Math.min(1, delta * 1.4);
    this.stage.style.setProperty('--camera', `${this.camera.toFixed(2)}px`);
    if (this.impactUntil < time) this.stage.classList.remove('attack-impact');
    this.effects = this.effects.filter(effect => {
      if (effect.expires > time) return true;
      effect.node.remove(); return false;
    });
  }

  destroy() {
    cancelAnimationFrame(this.frameId); this.resize.disconnect(); this.intersection.disconnect();
  }
}
