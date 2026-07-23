import { animate, stagger } from "https://cdn.jsdelivr.net/npm/motion@12.42.2/+esm";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let canvas;
let context;
let particles = [];
let frame = 0;
let audioContext;
let soundEnabled = localStorage.getItem("wra-sound") !== "off";

function motionAllowed() { return !reducedMotion.matches; }

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
    particle.vy += particle.gravity;
    particle.rotation += particle.spin;
    particle.life -= 1;
    context.save();
    context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    context.translate(particle.x, particle.y);
    context.rotate(particle.rotation);
    context.fillStyle = particle.color;
    if (particle.shape === "diamond") {
      context.rotate(Math.PI / 4);
      context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
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
  addEventListener("pointerdown", unlockAudio, { once: true, passive: true });
}

export function burstAt(x, y, options = {}) {
  if (!canvas || !motionAllowed()) return;
  const count = Math.min(options.count ?? 18, 60);
  const colors = options.colors ?? ["#8ff5ff", "#967cff", "#51e5a8", "#ffc857"];
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.8 + Math.random() * 4.2;
    const life = 28 + Math.random() * 34;
    particles.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1,
      gravity: options.gravity ?? .08, life, maxLife: life,
      size: 3 + Math.random() * 7, color: colors[index % colors.length],
      rotation: Math.random() * Math.PI, spin: (Math.random() - .5) * .22,
      shape: options.shape ?? (index % 3 === 0 ? "diamond" : "circle")
    });
  }
  if (!frame) frame = requestAnimationFrame(particleFrame);
}

export function burstFrom(element, options) {
  const rect = element?.getBoundingClientRect?.();
  if (rect) burstAt(rect.left + rect.width / 2, rect.top + rect.height / 2, options);
}

export function enterScreen(element) {
  if (!element || !motionAllowed()) return;
  animate(element, { opacity: [0, 1], transform: ["translateY(10px) scale(.985)", "translateY(0) scale(1)"] }, { duration: .28, ease: [0.22, 1, 0.36, 1] });
}

export function pressTile(element) {
  if (!element || !motionAllowed()) return;
  animate(element, { transform: ["scale(.9) translateY(2px)", "scale(1.04) translateY(-4px)", "scale(1)"] }, { duration: .24 });
}

export function refillTiles(elements) {
  if (!elements?.length || !motionAllowed()) return;
  animate(elements, { opacity: [0, 1], transform: ["translateY(-18px) scale(.72) rotate(-5deg)", "translateY(0) scale(1) rotate(0deg)"] }, { delay: stagger(.035), duration: .3, ease: [0.22, 1, 0.36, 1] });
}

export function invalidWord(element) {
  if (!element) return;
  animate(element, { transform: ["translateX(0)", "translateX(-7px)", "translateX(7px)", "translateX(-4px)", "translateX(0)"], backgroundColor: ["rgba(17,20,39,.95)", "rgba(116,18,44,.88)", "rgba(17,20,39,.95)"] }, { duration: .34 });
  playSound("error");
  haptic("error");
}

export function acceptedWord(element, points, refillElements = []) {
  if (element) {
    burstFrom(element, { count: 26 });
    animate(element, { transform: ["scale(1)", "scale(1.06)", "scale(1)"], boxShadow: ["0 0 0 rgba(81,229,168,0)", "0 0 30px rgba(81,229,168,.45)", "0 0 0 rgba(81,229,168,0)"] }, { duration: .42 });
    const rect = element.getBoundingClientRect();
    const score = document.createElement("div");
    score.className = "floating-score";
    score.textContent = `+${points}`;
    score.style.left = `${rect.left + rect.width / 2}px`;
    score.style.top = `${rect.top}px`;
    document.body.append(score);
    animate(score, { opacity: [0, 1, 1, 0], transform: ["translate(-50%, 8px) scale(.7)", "translate(-50%, -14px) scale(1.15)", "translate(-50%, -42px) scale(1)"] }, { duration: .75 }).then(() => score.remove());
  }
  refillTiles(refillElements);
  playSound("accept");
  haptic("accept");
}

export function comboPop(element, combo) {
  if (!element || combo < 2 || !motionAllowed()) return;
  animate(element, { transform: ["scale(.8) rotate(-4deg)", "scale(1.18) rotate(2deg)", "scale(1) rotate(0deg)"] }, { duration: .32 });
  if (combo >= 3) burstFrom(element, { count: Math.min(12 + combo * 3, 34), colors: ["#ffc857", "#ff8d5c", "#967cff"] });
}

export function timerPulse(element, remaining) {
  if (!element || remaining > 10 || !motionAllowed()) return;
  animate(element, { transform: ["scale(1)", "scale(1.18)", "scale(1)"], color: remaining <= 5 ? ["#fff", "#ff536f", "#fff"] : ["#fff", "#ffc857", "#fff"] }, { duration: .32 });
  if (remaining <= 5) playSound("tick");
}

export function countdownPulse(element) {
  if (!element) return;
  if (motionAllowed()) {
    animate(element, { transform: ["scale(.4)", "scale(1.14)", "scale(1)"], opacity: [0, 1, 1] }, { duration: .38, ease: [0.22, 1, 0.36, 1] });
  }
  playSound("tick");
}

export function attackFlash() {
  const flash = document.createElement("div");
  flash.className = "attack-flash";
  document.body.append(flash);
  animate(flash, { opacity: [0, .9, 0] }, { duration: .48 }).then(() => flash.remove());
  playSound("attack");
  haptic("attack");
}

export function celebrate(element, diamond = false) {
  if (element) burstFrom(element, { count: 60, gravity: .12, colors: diamond ? ["#8ff5ff", "#b9faff", "#967cff"] : ["#ffc857", "#ff8d5c", "#51e5a8"] });
  playSound("win");
  haptic("win");
}

export function purchaseFx(element, currency = "coins") {
  burstFrom(element, { count: 32, shape: "diamond", colors: currency === "diamonds" ? ["#8ff5ff", "#dffcff", "#967cff"] : ["#ffc857", "#ffe29a", "#ff9f43"] });
  animate(element, { transform: ["scale(1)", "scale(.96)", "scale(1.03)", "scale(1)"] }, { duration: .38 });
  playSound("purchase");
  haptic("purchase");
}

function unlockAudio() {
  if (!soundEnabled) return;
  audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
}

export function setSound(value) {
  soundEnabled = Boolean(value);
  localStorage.setItem("wra-sound", soundEnabled ? "on" : "off");
  if (soundEnabled) unlockAudio();
  return soundEnabled;
}

export function isSoundEnabled() { return soundEnabled; }

export function playSound(type) {
  if (!soundEnabled) return;
  unlockAudio();
  if (!audioContext) return;
  const presets = {
    accept: [620, 880, .09, "sine"], error: [180, 120, .14, "sawtooth"],
    tick: [420, 380, .045, "square"], attack: [130, 70, .18, "sawtooth"],
    purchase: [520, 1040, .13, "sine"], win: [440, 1180, .32, "triangle"]
  };
  const [from, to, duration, wave] = presets[type] ?? presets.accept;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(from, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(to, audioContext.currentTime + duration);
  gain.gain.setValueAtTime(.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(.07, audioContext.currentTime + .012);
  gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration + .02);
}

export function haptic(type) {
  if (!navigator.vibrate) return;
  const patterns = { tap: 7, accept: 18, error: [28, 28, 28], attack: [35, 22, 55], purchase: [12, 18, 28], win: [20, 35, 20, 35, 60] };
  navigator.vibrate(patterns[type] ?? 8);
}
