// Visual, audio and haptic feedback. Uses only platform APIs (Web Animations,
// Canvas, Web Audio, Vibration / Capacitor Haptics) so the game still boots
// when a CDN is unreachable or the app runs offline inside a native shell.

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const EASE_OUT = "cubic-bezier(.22, 1, .36, 1)";
let canvas;
let context;
let particles = [];
let frame = 0;
let audioContext;
let masterGain;

function readSetting(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writeSetting(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage may be blocked */ }
}

let soundEnabled = readSetting("wra-sound", "on") !== "off";
let hapticsEnabled = readSetting("wra-haptics", "on") !== "off";

function motionAllowed() { return !reducedMotion.matches; }

function play(element, keyframes, options = {}) {
  const list = (Array.isArray(element) ? element : [element]).filter((item) => item?.animate);
  return Promise.all(list.map((item) => item.animate(keyframes, { duration: 260, easing: EASE_OUT, ...options }).finished.catch(() => {})));
}

function resizeCanvas() {
  if (!canvas) return;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.floor(innerWidth * ratio);
  canvas.height = Math.floor(innerHeight * ratio);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function particleFrame() {
  context.clearRect(0, 0, innerWidth, innerHeight);
  particles = particles.filter((particle) => particle.life > 0);
  for (const particle of particles) {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vx *= particle.drag;
    particle.vy = particle.vy * particle.drag + particle.gravity;
    particle.rotation += particle.spin;
    particle.life -= 1;
    context.save();
    context.globalAlpha = Math.max(0, Math.min(1, particle.life / particle.maxLife * 1.6));
    context.translate(particle.x, particle.y);
    context.rotate(particle.rotation);
    context.fillStyle = particle.color;
    if (particle.shape === "diamond") {
      context.rotate(Math.PI / 4);
      context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
    } else if (particle.shape === "confetti") {
      context.fillRect(-particle.size / 2, -particle.size / 5, particle.size, particle.size / 2.5);
    } else {
      context.beginPath();
      context.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }
  if (particles.length) frame = requestAnimationFrame(particleFrame);
  else { cancelAnimationFrame(frame); frame = 0; context.clearRect(0, 0, innerWidth, innerHeight); }
}

export function initEffects(target) {
  canvas = target;
  context = canvas.getContext("2d", { alpha: true });
  resizeCanvas();
  addEventListener("resize", resizeCanvas, { passive: true });
  addEventListener("pointerdown", unlockAudio, { passive: true });
  addEventListener("keydown", unlockAudio, { passive: true });
}

export function burstAt(x, y, options = {}) {
  if (!canvas || !motionAllowed()) return;
  const count = Math.min(options.count ?? 18, 90);
  const colors = options.colors ?? ["#FFB238", "#57D6A0", "#F4E9D0", "#FF8D5C"];
  for (let index = 0; index < count; index += 1) {
    const angle = options.spread ? -Math.PI / 2 + (Math.random() - .5) * options.spread : Math.random() * Math.PI * 2;
    const speed = (options.speed ?? 1) * (2 + Math.random() * 4.6);
    const life = 34 + Math.random() * 38;
    particles.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1.2,
      gravity: options.gravity ?? .1, drag: .975, life, maxLife: life,
      size: 4 + Math.random() * 7, color: colors[index % colors.length],
      rotation: Math.random() * Math.PI, spin: (Math.random() - .5) * .3,
      shape: options.shape ?? ["confetti", "circle", "diamond"][index % 3]
    });
  }
  if (!frame) frame = requestAnimationFrame(particleFrame);
}

export function burstFrom(element, options) {
  const rect = element?.getBoundingClientRect?.();
  if (rect && rect.width) burstAt(rect.left + rect.width / 2, rect.top + rect.height / 2, options);
}

export function enterScreen(element) {
  if (!element || !motionAllowed()) return;
  play(element, [{ opacity: 0, transform: "translateY(12px) scale(.985)" }, { opacity: 1, transform: "none" }], { duration: 300 });
}

export function pressTile(element) {
  if (!element || !motionAllowed()) return;
  play(element, [
    { transform: "scale(.88) translateY(3px)" },
    { transform: "scale(1.06) translateY(-5px)", offset: .55 },
    { transform: "scale(1)" }
  ], { duration: 240 });
}

export function popIn(element) {
  if (!element || !motionAllowed()) return;
  play(element, [{ opacity: 0, transform: "translateY(10px) scale(.6)" }, { opacity: 1, transform: "none" }], { duration: 220 });
}

export function refillTiles(elements) {
  if (!elements?.length || !motionAllowed()) return;
  elements.forEach((element, index) => play(element, [
    { opacity: 0, transform: "translateY(-22px) scale(.7) rotate(-6deg)" },
    { opacity: 1, transform: "none" }
  ], { duration: 340, delay: index * 40, fill: "backwards" }));
}

export function dealTiles(elements) {
  if (!elements?.length || !motionAllowed()) return;
  elements.forEach((element, index) => play(element, [
    { opacity: 0, transform: "translateY(36px) scale(.6) rotate(8deg)" },
    { opacity: 1, transform: "none" }
  ], { duration: 420, delay: index * 35, fill: "backwards" }));
  playSound("deal");
}

export function invalidWord(element) {
  if (element) {
    element.classList.remove("is-invalid");
    void element.offsetWidth;
    element.classList.add("is-invalid");
    setTimeout(() => element.classList.remove("is-invalid"), 420);
    if (motionAllowed()) {
      play(element, [
        { transform: "translateX(0)" }, { transform: "translateX(-8px)" }, { transform: "translateX(8px)" },
        { transform: "translateX(-5px)" }, { transform: "translateX(3px)" }, { transform: "translateX(0)" }
      ], { duration: 360, easing: "ease-out" });
    }
  }
  playSound("error");
  haptic("error");
}

export function floatText(element, text, tone = "good") {
  const rect = element?.getBoundingClientRect?.();
  if (!rect || !rect.width) return;
  const label = document.createElement("div");
  label.className = `floating-score ${tone}`;
  label.textContent = text;
  label.style.left = `${rect.left + rect.width / 2}px`;
  label.style.top = `${rect.top}px`;
  document.body.append(label);
  if (!motionAllowed()) { setTimeout(() => label.remove(), 700); return; }
  play(label, [
    { opacity: 0, transform: "translate(-50%, 10px) scale(.6)" },
    { opacity: 1, transform: "translate(-50%, -16px) scale(1.18)", offset: .3 },
    { opacity: 1, transform: "translate(-50%, -30px) scale(1)", offset: .7 },
    { opacity: 0, transform: "translate(-50%, -52px) scale(.95)" }
  ], { duration: 900, easing: "ease-out" }).then(() => label.remove());
}

export function acceptedWord(element, points, refillElements = [], combo = 0) {
  if (element) {
    burstFrom(element, { count: 22 + Math.min(combo, 5) * 6, spread: Math.PI * 1.2 });
    play(element, [
      { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(87,214,160,0)" },
      { transform: "scale(1.05)", boxShadow: "0 0 0 6px rgba(87,214,160,.28)", offset: .4 },
      { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(87,214,160,0)" }
    ], { duration: 440 });
    floatText(element, `+${points}`);
  }
  refillTiles(refillElements);
  playSound(points >= 20 ? "big" : "accept");
  haptic("accept");
}

export function comboPop(element, combo) {
  if (!element || combo < 2 || !motionAllowed()) return;
  play(element, [
    { transform: "scale(.7) rotate(-6deg)" },
    { transform: "scale(1.25) rotate(3deg)", offset: .5 },
    { transform: "scale(1) rotate(0deg)" }
  ], { duration: 340 });
  if (combo >= 3) burstFrom(element, { count: Math.min(10 + combo * 4, 34), colors: ["#FFB238", "#FF8D5C", "#FFE29A"] });
  playSound("combo", combo);
}

export function timerPulse(element, remaining) {
  if (!element || remaining > 10 || remaining <= 0) return;
  if (motionAllowed()) play(element, [{ transform: "scale(1)" }, { transform: "scale(1.22)", offset: .4 }, { transform: "scale(1)" }], { duration: 320 });
  if (remaining <= 5) { playSound("tick"); haptic("tap"); }
}

export function countdownPulse(element) {
  if (!element) return;
  if (motionAllowed()) {
    play(element, [{ opacity: 0, transform: "scale(.35)" }, { opacity: 1, transform: "scale(1.16)", offset: .6 }, { opacity: 1, transform: "scale(1)" }], { duration: 380 });
  }
  playSound("tick");
}

export function goPulse(element) {
  if (!element) return;
  if (motionAllowed()) play(element, [{ opacity: 0, transform: "scale(.5)" }, { opacity: 1, transform: "scale(1.2)", offset: .5 }, { opacity: 1, transform: "scale(1)" }], { duration: 360 });
  playSound("go");
  haptic("accept");
}

export function flashElement(element, tone = "good") {
  if (!element || !motionAllowed()) return;
  element.classList.remove(`flash-${tone}`);
  void element.offsetWidth;
  element.classList.add(`flash-${tone}`);
  setTimeout(() => element.classList.remove(`flash-${tone}`), 700);
}

export function attackFlash() {
  const flash = document.createElement("div");
  flash.className = "attack-flash";
  document.body.append(flash);
  play(flash, [{ opacity: 0 }, { opacity: .9, offset: .3 }, { opacity: 0 }], { duration: 520 }).then(() => flash.remove());
  playSound("attack");
  haptic("attack");
}

export function celebrate(element, diamond = false, won = true) {
  if (element && won) {
    const colors = diamond ? ["#8FF5FF", "#B9FAFF", "#967CFF", "#FFFFFF"] : ["#FFB238", "#FF8D5C", "#57D6A0", "#F4E9D0"];
    burstFrom(element, { count: 70, gravity: .14, colors, speed: 1.2 });
    setTimeout(() => {
      burstAt(innerWidth * .15, innerHeight * .9, { count: 36, spread: Math.PI * .5, speed: 1.9, colors, gravity: .12 });
      burstAt(innerWidth * .85, innerHeight * .9, { count: 36, spread: Math.PI * .5, speed: 1.9, colors, gravity: .12 });
    }, 260);
  }
  playSound(won ? "win" : "lose");
  haptic(won ? "win" : "tap");
}

export function purchaseFx(element, currency = "coins") {
  burstFrom(element, { count: 32, shape: "diamond", colors: currency === "diamonds" ? ["#8FF5FF", "#DFFCFF", "#967CFF"] : ["#FFC857", "#FFE29A", "#FF9F43"] });
  play(element, [{ transform: "scale(1)" }, { transform: "scale(.96)" }, { transform: "scale(1.03)" }, { transform: "scale(1)" }], { duration: 380 });
  playSound("purchase");
  haptic("purchase");
}

function unlockAudio() {
  if (!soundEnabled) return;
  try {
    if (!audioContext) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      audioContext = new AudioCtor();
      masterGain = audioContext.createGain();
      masterGain.gain.value = .9;
      masterGain.connect(audioContext.destination);
    }
    if (audioContext.state === "suspended") audioContext.resume();
  } catch { audioContext = null; }
}

export function setSound(value) {
  soundEnabled = Boolean(value);
  writeSetting("wra-sound", soundEnabled ? "on" : "off");
  if (soundEnabled) unlockAudio();
  return soundEnabled;
}
export function isSoundEnabled() { return soundEnabled; }

export function setHaptics(value) {
  hapticsEnabled = Boolean(value);
  writeSetting("wra-haptics", hapticsEnabled ? "on" : "off");
  if (hapticsEnabled) haptic("accept");
  return hapticsEnabled;
}
export function isHapticsEnabled() { return hapticsEnabled; }

function tone(frequency, { start = 0, duration = .12, wave = "sine", volume = .07, slideTo = null } = {}) {
  const at = audioContext.currentTime + start;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, at);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, at + duration);
  gain.gain.setValueAtTime(.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + .012);
  gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  oscillator.connect(gain).connect(masterGain);
  oscillator.start(at);
  oscillator.stop(at + duration + .03);
}

// Major pentatonic steps keep rising selection tones musical.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];
const note = (semitones, base = 392) => base * 2 ** (semitones / 12);

export function playSound(type, step = 0) {
  if (!soundEnabled) return;
  unlockAudio();
  if (!audioContext || audioContext.state !== "running") return;
  try {
    switch (type) {
      case "select": tone(note(SCALE[Math.min(step, SCALE.length - 1)]), { duration: .09, wave: "triangle", volume: .06 }); break;
      case "deselect": tone(330, { duration: .08, wave: "triangle", volume: .04, slideTo: 260 }); break;
      case "accept": [0, 4, 7].forEach((semi, index) => tone(note(semi, 523), { start: index * .055, duration: .16, wave: "triangle", volume: .06 })); break;
      case "big": [0, 4, 7, 12].forEach((semi, index) => tone(note(semi, 523), { start: index * .05, duration: .2, wave: "triangle", volume: .065 })); break;
      case "combo": tone(note(12 + Math.min(step, 6) * 2, 523), { duration: .14, wave: "sine", volume: .05 }); break;
      case "error": tone(190, { duration: .16, wave: "sawtooth", volume: .045, slideTo: 120 }); break;
      case "tick": tone(880, { duration: .05, wave: "square", volume: .03 }); break;
      case "go": [0, 7, 12].forEach((semi, index) => tone(note(semi, 440), { start: index * .04, duration: .22, wave: "triangle", volume: .06 })); break;
      case "deal": for (let index = 0; index < 6; index += 1) tone(1200 + index * 90, { start: index * .035, duration: .03, wave: "square", volume: .015 }); break;
      case "shuffle": for (let index = 0; index < 4; index += 1) tone(700 - index * 60, { start: index * .03, duration: .04, wave: "triangle", volume: .03 }); break;
      case "attack": tone(130, { duration: .22, wave: "sawtooth", volume: .07, slideTo: 60 }); break;
      case "opponent": tone(660, { duration: .07, wave: "sine", volume: .03, slideTo: 520 }); break;
      case "purchase": tone(520, { duration: .14, volume: .06, slideTo: 1040 }); break;
      case "win": [0, 4, 7, 12, 16].forEach((semi, index) => tone(note(semi, 523), { start: index * .09, duration: .32, wave: "triangle", volume: .06 })); break;
      case "lose": [7, 4, 0].forEach((semi, index) => tone(note(semi, 349), { start: index * .12, duration: .26, wave: "triangle", volume: .05 })); break;
      default: tone(620, { duration: .09 });
    }
  } catch { /* audio is best-effort */ }
}

const HAPTIC_STYLES = { tap: "LIGHT", select: "LIGHT", accept: "MEDIUM", error: "HEAVY", attack: "HEAVY", purchase: "MEDIUM", win: "HEAVY" };

export function haptic(type) {
  if (!hapticsEnabled) return;
  // Inside the Capacitor shell the native Haptics plugin works on iOS too.
  const native = window.Capacitor?.Plugins?.Haptics;
  if (native && window.Capacitor?.isNativePlatform?.()) {
    if (type === "error") native.notification?.({ type: "ERROR" })?.catch?.(() => {});
    else if (type === "win") native.notification?.({ type: "SUCCESS" })?.catch?.(() => {});
    else native.impact?.({ style: HAPTIC_STYLES[type] ?? "LIGHT" })?.catch?.(() => {});
    return;
  }
  if (!navigator.vibrate) return;
  const patterns = { tap: 6, select: 6, accept: 16, error: [26, 30, 26], attack: [35, 22, 55], purchase: [12, 18, 28], win: [20, 35, 20, 35, 60] };
  try { navigator.vibrate(patterns[type] ?? 8); } catch { /* ignored */ }
}
