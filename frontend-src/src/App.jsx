import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Ban, Bell, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, ExternalLink, Flag, History, KeyRound, Map as MapIcon,
  ImagePlus, LayoutDashboard, ListChecks, LogIn, LogOut, MessageCircle, Palette, Paintbrush, Radio, RefreshCw, Save, Search,
  Send, Settings, Shield, SlidersHorizontal, Trash2, UserPlus, UserRound, Users, Volume2, VolumeX, X
} from 'lucide-react';
import './style.css';

const API = import.meta.env.VITE_API_BASE || '';
const SERVER_ID = '1495608662025048125';
const DEFAULT_REASONS = ['Random killing', 'Disobeying staff', 'RDM', 'Spawn camping', 'Harassment', 'Exploiting', 'Evading punishment'];
const ERROR_LABELS = {
  ban_duration_exceeds_24_hours: 'Trial Mods can ban for at most 24 hours.',
  ban_duration_exceeds_3_days: 'Mods can ban for at most 3 days.',
  permanent_ban_not_allowed: 'Permanent bans are available to HMods and above.',
  review_requires_higher_rank: 'Only a higher moderation rank can review this ban.',
  cannot_review_own_ban: 'You cannot review a ban you created.',
  ban_review_already_completed: 'This ban has already been reviewed.',
  cannot_manage_same_or_higher_rank: 'Your rank cannot manage a ban from the same or a higher rank.',
  missing_canManage_perms: 'Only HMods and above can decide unban requests.',
  ban_is_not_active: 'That ban is no longer active. The request remains visible for audit.',
  staff_age_requirement_not_met: 'Staff applicants must be at least 18 years old.',
  valid_birth_date_required: 'Enter a valid date of birth.',
  staff_guild_time_requirement_not_met: 'You must have been in the Discord server for at least 30 days.',
  discord_join_date_unavailable: 'Discord did not return your server join date yet. Refresh your sign-in and try again.',
  staff_application_already_pending: 'You already have a staff application waiting for review.',
  staff_application_already_decided: 'That staff application has already been decided.',
  missing_canModerate_perms: 'A moderation role is required to view this queue.',
  unban_message_forbidden: 'Only the requester and HMods+ staff can access this conversation.',
  unban_message_required: 'Write a message before sending it.',
  ban_request_already_pending: 'You already have a pending request for this player.',
  ban_request_already_decided: 'That ban request has already been decided.',
  cannot_decide_own_ban_request: 'You cannot decide your own ban request.',
  warthunder_id_resolution_required: 'The War Thunder plugin could not resolve a stable player ID. The ban was not created; have the plugin send the player ID and try again.',
  evidence_file_count_exceeded: 'Choose no more than 10 evidence files.',
  evidence_total_size_exceeded: 'Evidence files must total 100 MB or less.',
  evidence_file_size_exceeded: 'One evidence file is larger than the 100 MB limit.',
  evidence_file_type_not_allowed: 'That file type cannot be uploaded as evidence.',
  evidence_upload_failed: 'The evidence upload failed. No ban was created; try again.',
  map_vote_not_open: 'There is no open map vote right now.',
  map_vote_already_open: 'A map vote is already open.',
  map_vote_already_cast: 'You have already voted in this round.',
  map_not_available_for_vote: 'That map is not available in the current round.',
  valid_map_required: 'Choose a valid map.',
  map_name_required: 'Enter a map name.',
  map_server_link_required: 'Enter the server link for this map.',
  valid_map_server_link_required: 'Enter a valid server link.',
  map_image_required: 'Upload an image or provide an HTTPS image URL.',
  map_image_type_not_allowed: 'Map artwork must be an image file.',
  map_image_too_large: 'Map artwork must be 10 MB or smaller.',
  map_image_upload_failed: 'The map image upload failed. Try another image.',
  missing_mapCreator_perms: 'The Map Creator Discord role is required for this page.'
};

async function api(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: isFormData ? { ...(options.headers || {}) } : { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body ? (isFormData ? options.body : JSON.stringify(options.body)) : undefined
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { message: text }; }
  if (!res.ok) throw new Error(ERROR_LABELS[json.error] || json.error || json.message || `Request failed (${res.status})`);
  return json;
}

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
  return '';
}

function setCookie(name, value, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function loadSavedReasons() {
  try {
    const parsed = JSON.parse(getCookie('cb_custom_ban_reasons') || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch { return []; }
}

function saveReasons(reasons) {
  setCookie('cb_custom_ban_reasons', JSON.stringify([...new Set(reasons.map((r) => r.trim()).filter(Boolean))]));
}

const UI_SETTINGS_KEY = 'cb_ui_settings_v1';
const DEFAULT_UI_SETTINGS = {
  theme: 'aurora', density: 'comfortable', motion: 'full', fontSize: 'normal', surfaces: 'glass',
  soundEnabled: true, soundVolume: 0.35, customThemeName: 'My theme', customAccent: '#91ffd0',
  customHighlight: '#c6a6ff', customBackgroundUrl: '', backgroundOverlay: 0.38,
  backgroundPattern: 'aurora', patternOpacity: 0.38, fontSizePx: 16, cardRadius: 26, surfaceBlur: 13,
  atmosphere: 'balanced', netDensity: 78, netSpeed: 0.32, netLinkDistance: 150,
  netLineOpacity: 0.34, netParticleSize: 1.8, netInteractive: true
};

const ATMOSPHERE_PRESETS = {
  balanced: null,
  cozy: { mint: '#ffd6a0', mint2: '#d99b68', purple: '#efb7c9', pink: '#ffd9e5' },
  ocean: { mint: '#8de8ff', mint2: '#45b6d9', purple: '#9aa8ff', pink: '#c6d9ff' },
  forest: { mint: '#a8f0bd', mint2: '#4bbf7d', purple: '#b9d2a5', pink: '#e1c993' },
  candy: { mint: '#ffb9db', mint2: '#ef75b1', purple: '#b9a6ff', pink: '#ffd1ec' }
};
const ANIMATED_BACKGROUNDS = new Set(['net', 'stars', 'orbs', 'waves', 'aurora-live']);

function validHexColor(value, fallback) { return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback; }
function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeUiSettings(value = {}) {
  const merged = { ...DEFAULT_UI_SETTINGS, ...(value || {}) };
  return {
    ...merged,
    theme: ['aurora', 'midnight', 'ember', 'paper', 'custom'].includes(merged.theme) ? merged.theme : DEFAULT_UI_SETTINGS.theme,
    density: ['comfortable', 'compact'].includes(merged.density) ? merged.density : DEFAULT_UI_SETTINGS.density,
    motion: ['full', 'reduced'].includes(merged.motion) ? merged.motion : DEFAULT_UI_SETTINGS.motion,
    fontSize: ['normal', 'large'].includes(merged.fontSize) ? merged.fontSize : DEFAULT_UI_SETTINGS.fontSize,
    surfaces: ['glass', 'solid'].includes(merged.surfaces) ? merged.surfaces : DEFAULT_UI_SETTINGS.surfaces,
    soundEnabled: merged.soundEnabled !== false,
    soundVolume: boundedNumber(merged.soundVolume, DEFAULT_UI_SETTINGS.soundVolume, 0, 1),
    customThemeName: String(merged.customThemeName || DEFAULT_UI_SETTINGS.customThemeName).slice(0, 64),
    customAccent: validHexColor(merged.customAccent, DEFAULT_UI_SETTINGS.customAccent),
    customHighlight: validHexColor(merged.customHighlight, DEFAULT_UI_SETTINGS.customHighlight),
    customBackgroundUrl: String(merged.customBackgroundUrl || '').trim().slice(0, 1200),
    backgroundOverlay: boundedNumber(merged.backgroundOverlay, DEFAULT_UI_SETTINGS.backgroundOverlay, 0, 0.85),
    backgroundPattern: ['none', 'wire', 'mesh', 'dots', 'aurora', ...ANIMATED_BACKGROUNDS].includes(merged.backgroundPattern) ? merged.backgroundPattern : DEFAULT_UI_SETTINGS.backgroundPattern,
    patternOpacity: boundedNumber(merged.patternOpacity, DEFAULT_UI_SETTINGS.patternOpacity, 0, 1),
    fontSizePx: boundedNumber(merged.fontSizePx, DEFAULT_UI_SETTINGS.fontSizePx, 12, 24),
    cardRadius: boundedNumber(merged.cardRadius, DEFAULT_UI_SETTINGS.cardRadius, 10, 42),
    surfaceBlur: boundedNumber(merged.surfaceBlur, DEFAULT_UI_SETTINGS.surfaceBlur, 0, 30),
    atmosphere: Object.prototype.hasOwnProperty.call(ATMOSPHERE_PRESETS, merged.atmosphere) ? merged.atmosphere : DEFAULT_UI_SETTINGS.atmosphere,
    netDensity: boundedNumber(merged.netDensity, DEFAULT_UI_SETTINGS.netDensity, 20, 180),
    netSpeed: boundedNumber(merged.netSpeed, DEFAULT_UI_SETTINGS.netSpeed, 0, 1),
    netLinkDistance: boundedNumber(merged.netLinkDistance, DEFAULT_UI_SETTINGS.netLinkDistance, 60, 260),
    netLineOpacity: boundedNumber(merged.netLineOpacity, DEFAULT_UI_SETTINGS.netLineOpacity, 0.05, 1),
    netParticleSize: boundedNumber(merged.netParticleSize, DEFAULT_UI_SETTINGS.netParticleSize, 0.5, 4),
    netInteractive: merged.netInteractive !== false
  };
}

function loadUiSettings() {
  try {
    const cookieValue = getCookie(UI_SETTINGS_KEY);
    if (cookieValue) return normalizeUiSettings(JSON.parse(cookieValue));
    const legacy = window.localStorage.getItem(UI_SETTINGS_KEY);
    return normalizeUiSettings(legacy ? JSON.parse(legacy) : {});
  } catch { return { ...DEFAULT_UI_SETTINGS }; }
}

function saveUiSettings(settings) {
  const normalized = normalizeUiSettings(settings);
  try { setCookie(UI_SETTINGS_KEY, JSON.stringify(normalized), 365); } catch { /* cookies can be disabled */ }
  try { window.localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(normalized)); } catch { /* legacy fallback is optional */ }
}

function safeBackgroundUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(raw) && raw.length <= 1200) return raw;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const url = new URL(raw, window.location.origin);
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

let notificationAudioContext;
function playNotificationSound(volume = 0.35) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    notificationAudioContext ||= new AudioContextClass();
    const context = notificationAudioContext;
    if (context.state === 'suspended') context.resume().catch(() => {});
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(660, now);
    oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.12);
    gain.gain.setValueAtTime(Math.max(0.001, Math.min(1, volume)) * 0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(now); oscillator.stop(now + 0.22);
  } catch { /* browsers can block audio until a user gesture */ }
}

function parseColor(value, fallback = { r: 145, g: 255, b: 208 }) {
  const raw = String(value || '').trim();
  const hex = raw.match(/^#([0-9a-f]{6})$/i);
  if (hex) return { r: parseInt(hex[1].slice(0, 2), 16), g: parseInt(hex[1].slice(2, 4), 16), b: parseInt(hex[1].slice(4, 6), 16) };
  const rgb = raw.match(/rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)/i);
  return rgb ? { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) } : fallback;
}

function rgba(color, alpha) { return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`; }

function AnimatedBackground({ settings }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const mode = settings.backgroundPattern;
    if (!canvas || !ANIMATED_BACKGROUNDS.has(mode)) return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    let width = 0;
    let height = 0;
    let devicePixelRatio = 1;
    let animationFrame = 0;
    let particles = [];
    const pointer = { x: -1000, y: -1000, active: false };
    const reduced = settings.motion === 'reduced' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const lowPowerDevice = Number.isFinite(navigator.hardwareConcurrency) && navigator.hardwareConcurrency <= 4;
    const frameInterval = reduced ? 1000 / 8 : 1000 / (lowPowerDevice ? 24 : 30);
    let lastFrameTime = -Infinity;
    let palette;

    function colors() {
      const styles = getComputedStyle(document.documentElement);
      return {
        primary: parseColor(styles.getPropertyValue('--mint'), parseColor(settings.customAccent)),
        secondary: parseColor(styles.getPropertyValue('--purple'), parseColor(settings.customHighlight, { r: 198, g: 166, b: 255 }))
      };
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      devicePixelRatio = Math.min(window.devicePixelRatio || 1, lowPowerDevice ? 1 : 1.5);
      canvas.width = Math.max(1, Math.round(width * devicePixelRatio));
      canvas.height = Math.max(1, Math.round(height * devicePixelRatio));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      const multiplier = (width < 640 ? 0.48 : width < 980 ? 0.68 : 1) * (lowPowerDevice ? 0.8 : 1);
      const count = Math.max(20, Math.round(settings.netDensity * multiplier));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.24,
        vy: (Math.random() - 0.5) * 0.24,
        radius: settings.netParticleSize * (0.7 + Math.random() * 0.7),
        phase: Math.random() * Math.PI * 2,
        orbit: 0.45 + Math.random() * 1.35,
        hue: Math.random()
      }));
    }

    function onPointerMove(event) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    }
    function onPointerLeave() { pointer.active = false; }

    function drawNet(palette) {
      const motionScale = reduced ? 0.16 : Math.max(0.02, settings.netSpeed);
      const linkDistance = settings.netLinkDistance + (settings.netInteractive && pointer.active ? 34 : 0);
      const linkDistanceSquared = linkDistance * linkDistance;
      for (const particle of particles) {
        particle.x += particle.vx * motionScale * 3;
        particle.y += particle.vy * motionScale * 3;
        if (particle.x < -20) particle.x = width + 20;
        if (particle.x > width + 20) particle.x = -20;
        if (particle.y < -20) particle.y = height + 20;
        if (particle.y > height + 20) particle.y = -20;
      }
      const cellSize = Math.max(60, linkDistance);
      const buckets = new Map();
      particles.forEach((particle, index) => {
        const cellX = Math.floor(particle.x / cellSize);
        const cellY = Math.floor(particle.y / cellSize);
        const key = cellX * 100000 + cellY;
        const bucket = buckets.get(key);
        if (bucket) bucket.push(index); else buckets.set(key, [index]);
      });
      context.beginPath();
      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        if (settings.netInteractive && pointer.active) {
          const dx = pointer.x - particle.x;
          const dy = pointer.y - particle.y;
          const distance = Math.hypot(dx, dy);
          if (distance < 160 && distance > 0.1) {
            const pull = (1 - distance / 160) * 0.008;
            particle.vx += dx * pull;
            particle.vy += dy * pull;
            particle.vx = Math.max(-0.55, Math.min(0.55, particle.vx));
            particle.vy = Math.max(-0.55, Math.min(0.55, particle.vy));
          }
        }
        const cellX = Math.floor(particle.x / cellSize);
        const cellY = Math.floor(particle.y / cellSize);
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
            const bucket = buckets.get((cellX + offsetX) * 100000 + cellY + offsetY) || [];
            for (const otherIndex of bucket) {
              if (otherIndex <= index) continue;
              const other = particles[otherIndex];
              const dx = particle.x - other.x;
              const dy = particle.y - other.y;
              const distanceSquared = dx * dx + dy * dy;
              if (distanceSquared > linkDistanceSquared) continue;
              context.moveTo(particle.x, particle.y);
              context.lineTo(other.x, other.y);
            }
          }
        }
      }
      context.strokeStyle = rgba(palette.primary, settings.netLineOpacity * 0.58);
      context.lineWidth = 1;
      context.stroke();
      context.beginPath();
      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        if (index % 3 === 0) continue;
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      }
      context.fillStyle = rgba(palette.primary, Math.min(1, settings.netLineOpacity + 0.22));
      context.fill();
      context.beginPath();
      for (let index = 0; index < particles.length; index += 1) {
        if (index % 3 !== 0) continue;
        const particle = particles[index];
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      }
      context.fillStyle = rgba(palette.secondary, Math.min(1, settings.netLineOpacity + 0.22));
      context.fill();
    }

    function drawStars(palette, time) {
      const motionScale = reduced ? 0.05 : Math.max(0.02, settings.netSpeed) * 0.45;
      for (const particle of particles) {
        particle.y += (0.08 + particle.orbit * 0.06) * motionScale;
        particle.x += particle.vx * motionScale;
        if (particle.y > height + 8) { particle.y = -8; particle.x = Math.random() * width; }
        if (particle.x < -8) particle.x = width + 8;
        if (particle.x > width + 8) particle.x = -8;
        const twinkle = 0.35 + ((Math.sin(time * 0.0014 * particle.orbit + particle.phase) + 1) / 2) * 0.65;
        context.beginPath();
        context.arc(particle.x, particle.y, Math.max(0.45, particle.radius * 0.62), 0, Math.PI * 2);
        context.fillStyle = rgba(particle.hue > 0.5 ? palette.secondary : palette.primary, settings.netLineOpacity * twinkle + 0.12);
        context.fill();
      }
      if (settings.netInteractive && pointer.active) {
        const glow = context.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 180);
        glow.addColorStop(0, rgba(palette.primary, 0.18)); glow.addColorStop(1, rgba(palette.primary, 0));
        context.fillStyle = glow; context.fillRect(pointer.x - 180, pointer.y - 180, 360, 360);
      }
    }

    function drawOrbs(palette, time) {
      const count = Math.max(5, Math.min(14, Math.round(settings.netDensity / 12)));
      for (let index = 0; index < count; index += 1) {
        const particle = particles[index % particles.length];
        const angle = time * 0.00012 * settings.netSpeed * (particle.orbit * 2) + particle.phase;
        const centerX = width * (0.12 + ((index * 0.173) % 0.76));
        const centerY = height * (0.12 + ((index * 0.271) % 0.72));
        const x = centerX + Math.cos(angle) * width * 0.11 + (settings.netInteractive && pointer.active ? (pointer.x - width / 2) * 0.025 : 0);
        const y = centerY + Math.sin(angle * 1.2) * height * 0.12 + (settings.netInteractive && pointer.active ? (pointer.y - height / 2) * 0.018 : 0);
        const radius = Math.min(width, height) * (0.09 + particle.hue * 0.08);
        const color = index % 2 ? palette.secondary : palette.primary;
        const gradient = context.createRadialGradient(x - radius * 0.3, y - radius * 0.35, radius * 0.05, x, y, radius);
        gradient.addColorStop(0, rgba(color, settings.netLineOpacity * 1.5));
        gradient.addColorStop(0.45, rgba(color, settings.netLineOpacity * 0.55));
        gradient.addColorStop(1, rgba(color, 0));
        context.fillStyle = gradient;
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    }

    function drawWaves(palette, time) {
      const lines = 7;
      const amplitude = Math.min(80, height * 0.1);
      for (let line = 0; line < lines; line += 1) {
        const base = height * (0.26 + line * 0.085);
        context.beginPath();
        for (let x = -20; x <= width + 20; x += 14) {
          const pointerBend = settings.netInteractive && pointer.active ? Math.max(0, 1 - Math.abs(x - pointer.x) / 260) * (pointer.y - height / 2) * 0.12 : 0;
          const y = base + Math.sin(x * 0.006 + time * 0.00035 * Math.max(0.2, settings.netSpeed) + line * 0.8) * amplitude * (0.55 + line * 0.06) + pointerBend;
          if (x === -20) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.strokeStyle = rgba(line % 2 ? palette.secondary : palette.primary, settings.netLineOpacity * (0.34 + line * 0.045));
        context.lineWidth = 1.2 + (lines - line) * 0.08;
        context.stroke();
      }
    }

    function drawAurora(palette, time) {
      const shift = reduced ? 0 : time * 0.00002 * Math.max(0.2, settings.netSpeed);
      context.fillStyle = `rgba(4, 10, 12, ${0.03 + settings.netLineOpacity * 0.04})`;
      context.fillRect(0, 0, width, height);
      const blobs = [
        [0.2 + Math.sin(shift) * 0.08, 0.2 + Math.cos(shift * 1.7) * 0.06, palette.primary],
        [0.78 + Math.cos(shift * 1.3) * 0.08, 0.22 + Math.sin(shift * 1.4) * 0.08, palette.secondary],
        [0.52 + Math.sin(shift * 1.2) * 0.1, 0.82 + Math.cos(shift * 1.6) * 0.06, palette.primary]
      ];
      for (const [xRatio, yRatio, color] of blobs) {
        const x = width * xRatio; const y = height * yRatio; const radius = Math.max(width, height) * 0.42;
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, rgba(color, settings.netLineOpacity * 0.55)); gradient.addColorStop(1, rgba(color, 0));
        context.fillStyle = gradient; context.fillRect(0, 0, width, height);
      }
    }

    function onVisibilityChange() {
      if (!document.hidden && !reduced && !animationFrame) animationFrame = requestAnimationFrame(draw);
    }

    function draw(time = 0) {
      if (document.hidden) { animationFrame = 0; return; }
      if (time !== 0 && time - lastFrameTime < frameInterval) {
        animationFrame = requestAnimationFrame(draw);
        return;
      }
      lastFrameTime = time;
      context.clearRect(0, 0, width, height);
      if (mode === 'net') drawNet(palette);
      else if (mode === 'stars') drawStars(palette, time);
      else if (mode === 'orbs') drawOrbs(palette, time);
      else if (mode === 'waves') drawWaves(palette, time);
      else if (mode === 'aurora-live') drawAurora(palette, time);
      if (!reduced) animationFrame = requestAnimationFrame(draw);
    }

    resize();
    palette = colors();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    draw();
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      context.clearRect(0, 0, width, height);
    };
  }, [settings.backgroundPattern, settings.motion, settings.theme, settings.atmosphere, settings.netDensity, settings.netSpeed, settings.netLinkDistance, settings.netLineOpacity, settings.netParticleSize, settings.netInteractive, settings.customAccent, settings.customHighlight]);
  return <canvas ref={canvasRef} className={`netCanvas ${ANIMATED_BACKGROUNDS.has(settings.backgroundPattern) ? 'active' : ''}`} aria-hidden="true" />;
}

function parseDate(value) {
  if (!value) return null;
  const raw = String(value);
  const mysql = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw);
  const date = new Date(mysql ? `${raw.replace(' ', 'T')}Z` : raw);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function formatDate(value) {
  const date = parseDate(value);
  return date ? date.toLocaleString() : value || 'Never';
}

function formatDuration(ban) {
  if (ban?.duration_label) return ban.duration_label;
  const starts = parseDate(ban?.starts_at);
  const ends = parseDate(ban?.ends_at);
  if (!ends) return 'Permanent';
  const hours = Math.max(0, (ends - starts) / 3_600_000);
  if (hours >= 24 && Math.abs(hours % 24) < 0.01) return `${hours / 24} day${hours / 24 === 1 ? '' : 's'}`;
  return `${Math.round(hours * 10) / 10} hour${hours === 1 ? '' : 's'}`;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function Card({ title, icon, children, className = '', kicker }) {
  return <section className={`card ${className}`}>
    <div className="cardTitle"><div>{icon}<div><p>{kicker}</p><h2>{title}</h2></div></div></div>
    {children}
  </section>;
}

function Notice({ children, type = 'info' }) { return <div className={`notice ${type}`}>{children}</div>; }

function DiscordDelivery({ status, reason, message }) {
  if (!status || status === 'not_attempted') return null;
  const sent = status === 'sent';
  return <div className={`discordDelivery ${sent ? 'sent' : 'failed'}`}>
    <b>{sent ? 'Discord update sent' : 'Discord update unavailable'}</b>
    <span>{message || reason || (sent ? 'Sent through the CB Discord bot.' : 'The in-site notification remains available.')}</span>
  </div>;
}

function Login({ user, refresh, onNavigate }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  if (user) {
    const perms = user.perms || {};
    return <div className="accountMenu">
      <button className="loginBox userMenuTrigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <div className="avatar"><UserRound size={18}/></div>
        <div><span>Signed in</span><b>{user.username}</b><small>{perms.levelName || 'Member'}</small></div>
        <ChevronDown size={16}/>
      </button>
      {open && <div className="accountDropdown">
        <div className="accountSummary"><span>Discord access</span><b>{perms.levelName || 'Public member'}</b></div>
        <button className="menuItem" onClick={() => { onNavigate('public'); setOpen(false); }}><Search size={16}/>Public lookup</button>
        <button className="menuItem" onClick={() => { onNavigate('maps'); setOpen(false); }}><MapIcon size={16}/>Map votes</button>
        {perms.canModerate && <button className="menuItem" onClick={() => { onNavigate('mod'); setOpen(false); }}><LayoutDashboard size={16}/>Mod Panel</button>}
        {(perms.mapCreator || perms.canManage || perms.admin || perms.top) && <button className="menuItem" onClick={() => { onNavigate('map-admin'); setOpen(false); }}><MapIcon size={16}/>Map creator</button>}
        <button className="menuItem" onClick={() => { onNavigate('link'); setOpen(false); }}><KeyRound size={16}/>Link a player</button>
        <button className="menuItem" onClick={() => { onNavigate('staff'); setOpen(false); }}><UserPlus size={16}/>Staff application</button>
        <button className="menuItem" onClick={() => { onNavigate('settings'); setOpen(false); }}><Settings size={16}/>Settings</button>
        <div className="menuDivider" />
        <button className="menuItem dangerText" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await api('/auth/logout', { method: 'POST' }); onNavigate('public'); await refresh(); setOpen(false); }
          finally { setBusy(false); }
        }}><LogOut size={16}/>Log out</button>
      </div>}
    </div>;
  }
  return <a className="loginButton" href={`${API}/auth/discord`}><LogIn size={18}/>Login with Discord</a>;
}

const SOUND_NOTIFICATION_TYPES = new Set(['staff_application_created', 'ban_request_created', 'unban_request_created', 'unban_request_message']);

function UnreadMessageIcon({ count }) {
  if (!count) return <MessageCircle size={18}/>;
  const visible = Math.min(Number(count) || 0, 10);
  return <span className="unreadMessageIcon" aria-label={`${count} unread message${count === 1 ? '' : 's'}`}><MessageCircle size={18}/><span className="messageMarks">{Array.from({ length: visible }, (_, index) => <i key={index}/>)}</span>{count > 10 && <b>+</b>}</span>;
}

function NotificationsBell({ user, onNavigate, settings }) {
  const [data, setData] = useState({ notifications: [], unreadCount: 0 });
  const [open, setOpen] = useState(false);
  const notificationsRef = useRef([]);
  const load = async () => {
    if (!user) return;
    try {
      const next = await api('/api/notifications?limit=30');
      const previousIds = new Set(notificationsRef.current.map((notification) => notification.id));
      const newAlerts = notificationsRef.current.length > 0
        ? (next.notifications || []).filter((notification) => !previousIds.has(notification.id) && SOUND_NOTIFICATION_TYPES.has(notification.type))
        : [];
      if (newAlerts.length && settings?.soundEnabled !== false) playNotificationSound(settings?.soundVolume);
      notificationsRef.current = next.notifications || [];
      setData(next);
    } catch { /* notifications should never block the panel */ }
  };
  useEffect(() => {
    if (!user) return undefined;
    notificationsRef.current = [];
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [Boolean(user), settings?.soundEnabled, settings?.soundVolume]);
  if (!user) return null;
  async function openNotification(notification) {
    if (!notification.read_at) await api(`/api/notifications/${notification.id}/read`, { method: 'POST' }).catch(() => {});
    await load();
    setOpen(false);
    if (notification.link === '/mod') onNavigate('mod');
    else if (notification.link === '/settings') onNavigate('settings');
    else if (notification.link === '/staff-applications') onNavigate('staff');
    else onNavigate('public');
  }
  return <div className="notificationMenu">
    <button className="icon notificationButton" onClick={() => setOpen((value) => !value)} aria-label={`${data.unreadCount || 0} unread notifications`} aria-expanded={open}><UnreadMessageIcon count={data.unreadCount}/></button>
    {open && <div className="notificationDropdown">
      <div className="notificationHeader"><div><span>Inbox</span><b>{data.unreadCount ? `${data.unreadCount} unread` : 'All caught up'}</b></div>{data.unreadCount > 0 && <button className="textButton" onClick={async () => { await api('/api/notifications/read-all', { method: 'POST' }).catch(() => {}); load(); }}>Mark all read</button>}</div>
      {data.notifications.length === 0 && <p className="muted small">No notifications yet.</p>}
      <div className="notificationList">{data.notifications.map((notification) => <button className={`notificationItem ${notification.read_at ? 'read' : 'unread'}`} key={notification.id} onClick={() => openNotification(notification)}><b>{notification.title}</b><span>{notification.body}</span><small>{formatDate(notification.created_at)}</small></button>)}</div>
    </div>}
  </div>;
}

function ReasonPicker({ value, onChange }) {
  const [customReasons, setCustomReasons] = useState(loadSavedReasons);
  const [newReason, setNewReason] = useState('');
  const reasons = useMemo(() => [...new Set([...DEFAULT_REASONS, ...customReasons])], [customReasons]);
  function addReason() {
    const clean = newReason.trim();
    if (!clean) return;
    const next = [...new Set([...customReasons, clean])];
    setCustomReasons(next); saveReasons(next); setNewReason(''); onChange(clean);
  }
  function removeReason(reason) {
    const next = customReasons.filter((r) => r !== reason);
    setCustomReasons(next); saveReasons(next); if (value === reason) onChange('');
  }
  return <div className="reasonBox">
    <label>Ban reason</label>
    <select value={reasons.includes(value) ? value : ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select a quick reason...</option>
      {reasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
    </select>
    <textarea placeholder="Add details for staff records" value={value} onChange={(e) => onChange(e.target.value)} required />
    <div className="inline">
      <input placeholder="Save a new quick reason" value={newReason} onChange={(e) => setNewReason(e.target.value)} />
      <button type="button" className="secondary" onClick={addReason}><Save size={16}/>Save</button>
    </div>
    {customReasons.length > 0 && <div className="chips">{customReasons.map((reason) => <span className="chip" key={reason}>{reason}<button type="button" onClick={() => removeReason(reason)}><Trash2 size={12}/></button></span>)}</div>}
  </div>;
}

const MAX_EVIDENCE_FILES = 10;
const MAX_EVIDENCE_BYTES = 100 * 1024 * 1024;

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function EvidencePicker({ files, onChange }) {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  function selectFiles(event) {
    const selected = Array.from(event.target.files || []);
    if (selected.length > MAX_EVIDENCE_FILES) {
      onChange([], 'Choose no more than 10 evidence files.');
      event.target.value = '';
      return;
    }
    const selectedTotal = selected.reduce((sum, file) => sum + file.size, 0);
    if (selectedTotal > MAX_EVIDENCE_BYTES) {
      onChange([], 'Evidence files must total 100 MB or less.');
      event.target.value = '';
      return;
    }
    onChange(selected, '');
  }
  return <div className="evidencePicker">
    <label>Evidence files <small>(optional · up to 10 files · 100 MB total)</small></label>
    <input type="file" multiple onChange={selectFiles} />
    {files.length > 0 && <div className="evidenceFileList">{files.map((file, index) => <div className="evidenceFileRow" key={`${file.name}-${file.lastModified}-${index}`}><span>{file.name}</span><small>{formatBytes(file.size)}</small><button type="button" className="icon secondary" onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index), '')} aria-label={`Remove ${file.name}`}><X size={14}/></button></div>)}<small className="muted">{files.length}/10 files · {formatBytes(total)}/100 MB</small></div>}
  </div>;
}

function BanForm({ onCreated, selectedPlayer, perms }) {
  const initialDuration = perms.maxBanHours == null ? '' : perms.maxBanHours;
  const isRequest = Number(perms.level || 0) < 4;
  const [form, setForm] = useState({ username: '', warthunderId: '', reason: '', durationHours: initialDuration, evidenceUrl: '', evidenceFiles: [] });
  const [msg, setMsg] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const updateForm = (patch) => { setConfirmation(null); setForm((current) => ({ ...current, ...patch })); };
  useEffect(() => {
    if (selectedPlayer) {
      setConfirmation(null);
      setForm((current) => ({ ...current, username: selectedPlayer.warthunder_username || selectedPlayer.username || '', warthunderId: selectedPlayer.warthunder_id || selectedPlayer.id || '' }));
    }
  }, [selectedPlayer]);
  async function reviewAccounts(event) {
    event.preventDefault(); setBusy(true); setMsg('Checking War Thunder accounts…');
    try {
      const body = { username: form.username };
      if (String(form.warthunderId).trim()) body.warthunderId = form.warthunderId.trim();
      const out = await api('/api/bans/resolve', { method: 'POST', body });
      const players = Array.isArray(out.players) ? out.players : [];
      if (!players.length) throw new Error('No War Thunder account matches that name.');
      setConfirmation(players); setMsg('');
    } catch (err) { setConfirmation(null); setMsg(err.message); }
    finally { setBusy(false); }
  }
  async function confirmBan() {
    setBusy(true); setMsg('Creating ban…');
    try {
      const body = new FormData();
      body.append('username', form.username);
      body.append('reason', form.reason);
      if (form.evidenceUrl) body.append('evidenceUrl', form.evidenceUrl);
      if (String(form.warthunderId).trim()) body.append('warthunderId', form.warthunderId.trim());
      body.append('resolvedPlayers', JSON.stringify(confirmation.map((player) => ({ id: player.id || null, username: player.username, resolvedLookupName: player.resolvedLookupName || player.username, matchType: player.matchType || null }))));
      if (String(form.durationHours).trim()) body.append('durationHours', String(Number(form.durationHours)));
      form.evidenceFiles.forEach((file) => body.append('evidence', file, file.name));
      const out = await api('/api/bans', { method: 'POST', body });
      const created = Array.isArray(out.bans) && out.bans.length ? out.bans : [out.ban];
      const names = created.filter(Boolean).map((ban) => `${ban.warthunder_username} (ID ${ban.warthunder_id || 'unresolved'}, ban #${ban.id})`).join(', ');
      const requestNote = out.ban?.review_status === 'pending' ? ' Ban request submitted for higher-rank approval.' : '';
      const deliveryResults = created.flatMap((ban) => ban.notifications?.results || []);
      const linkedCount = created.reduce((total, ban) => total + Number(ban.notifications?.linkedUsers || 0), 0);
      const sentCount = deliveryResults.filter((entry) => entry.discord?.status === 'sent').length;
      const deliveryNote = !isRequest && linkedCount
        ? ` Discord ban notice ${sentCount ? `sent to ${sentCount} linked Discord account${sentCount === 1 ? '' : 's'}` : 'could not be sent; the in-site notification remains available'}.`
        : '';
      setMsg(created.length > 1 ? `Created ${created.length} bans: ${names}.${requestNote}${deliveryNote}` : `${isRequest ? 'Ban request submitted for' : 'Ban created for'} ${names}.${requestNote}${deliveryNote}`);
      setConfirmation(null); setForm({ username: '', warthunderId: '', reason: '', durationHours: initialDuration, evidenceUrl: '', evidenceFiles: [] }); onCreated?.();
    } catch (err) { setMsg(err.message); }
    finally { setBusy(false); }
  }
  function cancelConfirmation() { setConfirmation(null); setMsg('Ban cancelled.'); }
  return <form onSubmit={reviewAccounts} className="stack">
    <Notice>{perms.levelName} can ban for <b>{perms.maxBanLabel}</b>. {perms.maxBanHours == null ? 'Leave duration blank for permanent.' : 'The server enforces this limit.'}</Notice>
    <Notice type="info">The first click asks the War Thunder plugin to resolve the stable player ID, checking the name, <code>@live</code>, and <code>@psn</code> where needed. You will see every matched ID and username before a ban request or ban is created.</Notice>
    {selectedPlayer && <Notice>Selected from live list: <b>{selectedPlayer.warthunder_username}</b>{selectedPlayer.warthunder_id && <> · ID {selectedPlayer.warthunder_id}</>}</Notice>}
    <div className="two"><div><label>War Thunder username</label><input placeholder="Player name" value={form.username} onChange={(e) => updateForm({ username: e.target.value })} required /></div><div><label>Known War Thunder ID (optional)</label><input placeholder="Leave blank to look it up" value={form.warthunderId} onChange={(e) => updateForm({ warthunderId: e.target.value })} /></div></div>
    <ReasonPicker value={form.reason} onChange={(reason) => updateForm({ reason })} />
    <div className="two"><div><label>Duration in hours</label><input type="number" min="0.1" step="0.1" max={perms.maxBanHours || undefined} placeholder={perms.maxBanHours == null ? 'Blank = permanent' : String(perms.maxBanHours)} value={form.durationHours} onChange={(e) => updateForm({ durationHours: e.target.value })} /></div><div><label>Evidence URL</label><input type="url" placeholder="Optional" value={form.evidenceUrl} onChange={(e) => updateForm({ evidenceUrl: e.target.value })} /></div></div>
    <EvidencePicker files={form.evidenceFiles} onChange={(evidenceFiles, error) => updateForm({ evidenceFiles, evidenceError: error })} />
    {form.evidenceError && <Notice type="warn">{form.evidenceError}</Notice>}
    <button type="submit" disabled={busy || Boolean(confirmation)}><Ban size={16}/>{busy ? 'Checking…' : isRequest ? 'Review IDs before submitting request' : 'Review IDs before banning'}</button>
    {confirmation && <div className="banConfirmation"><Notice type="warn"><b>{isRequest ? 'Submit this ban request for higher-rank approval?' : 'Do you want to ban these War Thunder IDs and usernames?'}</b><span className="muted small">Nothing has been created yet. Choose Yes to continue or No to cancel.</span></Notice><div className="resolvedPlayers">{confirmation.map((player, index) => <div className="resolvedPlayer" key={`${player.id || 'unresolved'}-${player.username}-${index}`}><div><b>{player.username}</b><span>{player.resolvedLookupName && player.resolvedLookupName !== player.username ? `Matched from ${player.resolvedLookupName}` : 'War Thunder username'}</span></div><code>ID {player.id || 'not resolved — username only'}</code></div>)}</div><div className="inline end"><button type="button" className="secondary" onClick={cancelConfirmation} disabled={busy}><X size={15}/>No, cancel</button><button type="button" onClick={confirmBan} disabled={busy}><CheckCircle2 size={15}/>{isRequest ? 'Yes, submit request' : 'Yes, ban these accounts'}</button></div></div>}
    {msg && <p className="muted">{msg}</p>}
  </form>;
}

function ReviewBadge({ status }) {
  const label = status === 'pending' ? 'Ban request' : status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Direct ban';
  return <span className={`reviewBadge ${status || 'not_required'}`}>{label}</span>;
}

function BanIdentity({ ban }) {
  return <div className="banIdentity">
    <div><b>#{ban.id} {ban.warthunder_username}</b><span>War Thunder ID: {ban.warthunder_id || 'Not resolved'}</span></div>
    <ReviewBadge status={ban.review_status}/>
  </div>;
}

function BanMeta({ ban }) {
  return <>
    <div className="banMeta"><span><Clock size={14}/>Duration: <b>{formatDuration(ban)}</b></span><span>Starts: {formatDate(ban.starts_at)}</span><span>Ends: {formatDate(ban.ends_at)}</span>{ban.evidence_url && <a href={ban.evidence_url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Evidence URL</a>}{ban.evidence?.map((file) => <a href={file.download_url} target="_blank" rel="noreferrer" key={file.id}><ExternalLink size={14}/>{file.original_name}</a>)}</div>
    <div className="actorLine"><span>Banned by <b>{ban.created_by_display || ban.created_by_label || 'Unknown staff'}</b></span><span className="roleTag">{ban.created_by_level_name || 'Staff'}</span>{ban.reviewed_by_display && <span>Reviewed by <b>{ban.reviewed_by_display}</b></span>}</div>
  </>;
}

function QueuePagination({ page, totalPages, total, onPage }) {
  if (!total) return null;
  return <div className="pagination">
    <span>Page {page} of {Math.max(1, totalPages)} · {total} total</span>
    <div className="inline">
      <button className="secondary icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={15}/></button>
      <button className="secondary icon" disabled={!totalPages || page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={15}/></button>
    </div>
  </div>;
}

function ActiveBans({ perms, refreshKey }) {
  const [data, setData] = useState({ bans: [], page: 1, limit: 15, total: 0, totalPages: 0 });
  const [err, setErr] = useState(''); const [editing, setEditing] = useState({});
  const [page, setPage] = useState(1); const [search, setSearch] = useState(''); const [searchInput, setSearchInput] = useState('');
  const load = async () => {
    if (!perms.canModerate) return;
    try {
      setErr('');
      const params = new URLSearchParams({ page: String(page), limit: '15' });
      if (search) params.set('search', search);
      const out = await api(`/api/bans/active?${params.toString()}`);
      setData(out);
      if (out.page !== page) setPage(out.page);
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, [perms.canModerate, refreshKey, page, search]);
  function submitSearch(event) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }
  async function revoke(id) {
    const reason = window.prompt('Revoke reason?') || 'Revoked by staff';
    try { await api(`/api/bans/${id}/revoke`, { method: 'POST', body: { reason } }); load(); }
    catch (e) { setErr(e.message); }
  }
  async function saveEdit(id) {
    const patch = editing[id];
    try {
      await api(`/api/bans/${id}`, { method: 'PATCH', body: { reason: patch.reason, endsAt: toIsoOrNull(patch.endsAt) } });
      setEditing((current) => ({ ...current, [id]: undefined })); load();
    } catch (e) { setErr(e.message); }
  }
  if (!perms.canModerate) return <Notice type="warn">Login with a moderation role to see active bans.</Notice>;
  const bans = data.bans || [];
  return <div className="stack"><div className="queueToolbar"><div><b>{data.total || 0} active ban{data.total === 1 ? '' : 's'}</b>{search && <small>Matching “{search}”</small>}</div><div className="queueActions"><form className="queueSearch" onSubmit={submitSearch}><Search size={15}/><input aria-label="Search active bans" placeholder="Search name, ID, reason, or ban #" value={searchInput} onChange={(event) => setSearchInput(event.target.value)}/><button>Search</button></form><button className="secondary" onClick={load}><RefreshCw size={16}/>Refresh</button></div></div>{err && <Notice type="warn">{err}</Notice>}<div className="banList">{bans.length === 0 && <Notice type="success">{search ? 'No active bans match this search.' : 'No active bans are in force.'}</Notice>}{bans.map((ban) => {
    const edit = editing[ban.id];
    const canManage = perms.canManage && Number(ban.created_by_level || 0) <= Number(perms.level || 0);
    return <article className="banItem" key={ban.id}>
      <BanIdentity ban={ban}/>
      {edit ? <div className="stack"><textarea value={edit.reason} onChange={(e) => setEditing({ ...editing, [ban.id]: { ...edit, reason: e.target.value } })} /><label>End time (blank = permanent for HMods+)</label><input type="datetime-local" value={edit.endsAt || ''} onChange={(e) => setEditing({ ...editing, [ban.id]: { ...edit, endsAt: e.target.value } })} /></div> : <p>{ban.reason}</p>}
      <BanMeta ban={ban}/>
      {canManage && <div className="inline end">{edit ? <><button onClick={() => saveEdit(ban.id)}>Save edit</button><button className="secondary" onClick={() => setEditing({ ...editing, [ban.id]: undefined })}><X size={15}/>Cancel</button></> : <button className="secondary" onClick={() => setEditing({ ...editing, [ban.id]: { reason: ban.reason, endsAt: ban.ends_at ? String(ban.ends_at).replace(' ', 'T') : '' } })}>Edit</button>}<button className="danger" onClick={() => revoke(ban.id)}>Revoke</button></div>}
    </article>;
  })}</div><QueuePagination page={data.page || page} totalPages={data.totalPages || 0} total={data.total || 0} onPage={setPage}/></div>;
}

function ModerationBanRequestQueue({ perms, refreshKey, onChanged }) {
  const [bans, setBans] = useState([]); const [err, setErr] = useState(''); const [reasons, setReasons] = useState({});
  const load = async () => { if (!perms.canReview) return; try { setErr(''); setBans((await api('/api/bans/requests')).requests || []); } catch (e) { setErr(e.message); } };
  useEffect(() => { load(); }, [perms.canReview, refreshKey]);
  async function decide(id, decision) {
    const reason = (reasons[id] || '').trim();
    if (decision === 'reject' && !reason) { setErr('Add a reason before rejecting a ban.'); return; }
    try { await api(`/api/bans/${id}/request/decision`, { method: 'POST', body: { decision, reason } }); await load(); onChanged?.(); }
    catch (e) { setErr(e.message); }
  }
  if (!perms.canReview) return <Notice>Review access unlocks when you have a higher rank than the ban creator.</Notice>;
  return <div className="stack"><div className="toolbar"><span>{bans.length} ban request{bans.length === 1 ? '' : 's'} waiting for approval</span><button className="secondary" onClick={load}><RefreshCw size={16}/>Refresh</button></div>{err && <Notice type="warn">{err}</Notice>}{bans.length === 0 && <Notice type="success">Your ban-request queue is clear.</Notice>}<div className="banList">{bans.map((ban) => <article className="banItem reviewItem" key={ban.id}><BanIdentity ban={ban}/><p>{ban.reason}</p><BanMeta ban={ban}/><input placeholder="Decision note (required to reject)" value={reasons[ban.id] || ''} onChange={(e) => setReasons({ ...reasons, [ban.id]: e.target.value })}/><div className="inline end"><button className="secondary" onClick={() => decide(ban.id, 'approve')}>Approve request</button><button className="danger" onClick={() => decide(ban.id, 'reject')}>Reject request</button></div></article>)}</div></div>;
}

function UnbanRequestQueue({ perms, refreshKey, onChanged }) {
  const [data, setData] = useState({ requests: [], page: 1, limit: 15, total: 0, totalPages: 0 });
  const [err, setErr] = useState(''); const [reasons, setReasons] = useState({});
  const [page, setPage] = useState(1); const [search, setSearch] = useState(''); const [searchInput, setSearchInput] = useState('');
  const load = async () => {
    if (!perms.canManage) return;
    try {
      setErr('');
      const params = new URLSearchParams({ page: String(page), limit: '15' });
      if (search) params.set('search', search);
      const out = await api(`/api/unban-requests?${params.toString()}`);
      setData(out);
      if (out.page !== page) setPage(out.page);
    } catch (error) { setErr(error.message); }
  };
  useEffect(() => { load(); }, [perms.canManage, refreshKey, page, search]);
  function submitSearch(event) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }
  async function decide(request, decision) {
    const reason = (reasons[request.id] || '').trim();
    if (reason.length < 3) { setErr('Add a reason for every unban decision.'); return; }
    if (decision === 'approve' && !request.ban_is_active) { setErr('This ban is no longer active. Deny or leave the request pending; it will remain visible for audit.'); return; }
    try { await api(`/api/unban-requests/${request.id}/decision`, { method: 'POST', body: { decision, reason } }); await load(); onChanged?.(); }
    catch (error) { setErr(error.message); }
  }
  if (!perms.canManage) return <Notice>Unban request decisions are available to HMods and above.</Notice>;
  const requests = data.requests || [];
  return <div className="stack"><div className="queueToolbar"><div><b>{data.total || 0} pending request{data.total === 1 ? '' : 's'}</b>{search && <small>Matching “{search}”</small>}</div><div className="queueActions"><form className="queueSearch" onSubmit={submitSearch}><Search size={15}/><input aria-label="Search unban requests" placeholder="Search player, requester, reason, or #" value={searchInput} onChange={(event) => setSearchInput(event.target.value)}/><button>Search</button></form><button className="secondary" onClick={load}><RefreshCw size={16}/>Refresh</button></div></div>{err && <Notice type="warn">{err}</Notice>}{requests.length === 0 && <Notice type="success">{search ? 'No pending unban requests match this search.' : 'No unban requests are waiting.'}</Notice>}<div className="requestList">{requests.map((request) => <article className={`requestItem ${request.is_stale ? 'staleRequest' : ''}`} key={request.id}><div className="requestHeader"><div><b>#{request.id} · {request.warthunder_username}</b><span>From {request.requester_display} · {formatDate(request.created_at)}</span></div><span className={`requestStatus ${request.is_stale ? 'stale' : 'pending'}`}>{request.is_stale ? request.ban_state_label : 'pending'}</span></div><div className="requestContext"><span>Original ban: {request.ban_reason}</span><span>{request.ban_ends_at ? `Ends ${formatDate(request.ban_ends_at)}` : 'Permanent ban'}</span></div>{request.is_stale && <Notice type="warn">{request.stale_reason}</Notice>}<p>{request.appeal_reason}</p><DiscordDelivery status={request.discord_delivery_status} reason={request.discord_delivery_reason} message={request.discord_delivery_message}/><UnbanConversation request={request} isStaff/><input placeholder="Decision reason (required for approve or deny)" value={reasons[request.id] || ''} onChange={(event) => setReasons({ ...reasons, [request.id]: event.target.value })}/><div className="inline end"><button className="secondary" disabled={request.is_stale} onClick={() => decide(request, 'approve')}>{request.is_stale ? 'Ban already inactive' : 'Approve unban'}</button><button className="danger" onClick={() => decide(request, 'deny')}>Deny request</button></div></article>)}</div><QueuePagination page={data.page || page} totalPages={data.totalPages || 0} total={data.total || 0} onPage={setPage}/></div>;
}

function AuditTrail({ id }) {
  const [rows, setRows] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { api(`/api/bans/${id}/audit`).then((out) => setRows(out.audit)).catch((e) => setErr(e.message)); }, [id]);
  if (err) return <p className="muted small">{err}</p>;
  if (!rows) return <p className="muted small">Loading audit…</p>;
  return <div className="auditTrail">{rows.map((row) => <div className="auditRow" key={row.id}><span>{formatDate(row.created_at)}</span><b>{row.action}</b><span>{row.actor_label || 'system'}</span></div>)}</div>;
}

function BanHistory({ perms, refreshKey }) {
  const [bans, setBans] = useState([]); const [err, setErr] = useState(''); const [expanded, setExpanded] = useState(null);
  const load = async () => { if (!perms.canModerate) return; try { setErr(''); setBans((await api('/api/bans/history?limit=80')).bans); } catch (e) { setErr(e.message); } };
  useEffect(() => { load(); }, [perms.canModerate, refreshKey]);
  if (!perms.canModerate) return null;
  return <div className="stack"><div className="toolbar"><span>Recent moderation records</span><button className="secondary" onClick={load}><RefreshCw size={16}/>Refresh</button></div>{err && <Notice type="warn">{err}</Notice>}<div className="historyList">{bans.length === 0 && <Notice>No moderation records yet.</Notice>}{bans.map((ban) => <article className="historyItem" key={ban.id}><div><b>#{ban.id} {ban.warthunder_username}</b><span>War Thunder ID: {ban.warthunder_id || 'Not resolved'}</span><span>{ban.status} · {formatDuration(ban)}</span></div><div><span>{ban.created_by_display || 'Unknown staff'}</span><span className="roleTag">{ban.created_by_level_name}</span><ReviewBadge status={ban.review_status}/></div>{perms.canManage && <button className="icon secondary" onClick={() => setExpanded(expanded === ban.id ? null : ban.id)} aria-label="Toggle audit trail"><History size={15}/></button>}{expanded === ban.id && <AuditTrail id={ban.id}/>}</article>)}</div></div>;
}

function PlayerList({ canModerate, onPick }) {
  const [players, setPlayers] = useState([]); const [err, setErr] = useState('');
  const load = async () => { if (canModerate) { try { setErr(''); setPlayers((await api('/api/bot/playerlist')).players); } catch (e) { setErr(e.message); } } };
  useEffect(() => { load(); const timer = setInterval(load, 10_000); return () => clearInterval(timer); }, [canModerate]);
  if (!canModerate) return null;
  return <aside className="rightPanel"><div className="rightPanelHeader"><div><b>Live Players</b><span>{players.length} online</span></div><button className="icon" onClick={load}><RefreshCw size={14}/></button></div>{err && <p className="muted small">{err}</p>}<div className="playerMiniList">{players.map((player) => <button className="playerMini" key={`${player.source}-${player.id}`} onClick={() => onPick?.(player)}><span>{player.warthunder_username}</span><small>{player.warthunder_id || 'unknown id'}</small></button>)}</div></aside>;
}

function UnbanRequestForm({ ban, user }) {
  const [open, setOpen] = useState(false); const [reason, setReason] = useState(''); const [message, setMessage] = useState(''); const [delivery, setDelivery] = useState(null); const [messageType, setMessageType] = useState('success'); const [busy, setBusy] = useState(false);
  if (!user) return <a className="secondary requestLogin" href={`${API}/auth/discord`}>Log in to request an unban</a>;
  if (message) return <div className="stack"><Notice type={messageType}>{message}</Notice><DiscordDelivery {...(delivery || {})}/></div>;
  if (!open) return <button className="secondary requestButton" onClick={() => setOpen(true)}>Request an unban</button>;
  async function submit(event) {
    event.preventDefault(); setBusy(true);
    try {
      const out = await api('/api/unban-requests', { method: 'POST', body: { banId: ban.id, reason } });
      setDelivery(out.request || null);
      setMessage('Your request was sent to the moderation team. Check the notification bell for the decision.');
    } catch (error) { setMessageType('warn'); setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <form className="requestForm" onSubmit={submit}><label>Why should this ban be lifted?</label><textarea minLength="10" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain what happened and include any context for the moderator." required /><div className="inline end"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button></div></form>;
}

function UnbanConversation({ request, isStaff = false }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    try { setErr(''); setData(await api(`/api/unban-requests/${request.id}/messages`)); }
    catch (error) { setErr(error.message); }
  }
  async function send(event) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try { await api(`/api/unban-requests/${request.id}/messages`, { method: 'POST', body: { body } }); setBody(''); await load(); }
    catch (error) { setErr(error.message); }
    finally { setBusy(false); }
  }
  return <div className="conversation"><button className="secondary conversationToggle" onClick={async () => { const next = !open; setOpen(next); if (next && !data) await load(); }}><MessageCircle size={15}/>{open ? 'Hide conversation' : 'Message about this ban'}{data?.messages?.length ? ` (${data.messages.length})` : ''}</button>{open && <div className="conversationBody">{err && <Notice type="warn">{err}</Notice>}{data?.messages?.length ? <div className="messageList">{data.messages.map((message) => <div className={`messageBubble ${message.author_kind === 'staff' ? 'staffMessage' : ''}`} key={message.id}><div><b>{message.author_label}</b><small>{message.author_kind === 'staff' ? 'Staff' : 'Player'} · {formatDate(message.created_at)}</small></div><p>{message.body}</p>{message.author_kind === 'staff' && <DiscordDelivery status={message.discord_delivery_status} reason={message.discord_delivery_reason} message={message.discord_delivery_message}/>}</div>)}</div> : <p className="muted small">No messages yet. Ask a question about the ban or add context for the review.</p>}<form className="messageComposer" onSubmit={send}><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={isStaff ? 'Explain the decision or ask for more information…' : 'Reply to the moderation team…'} maxLength="5000" required/><button disabled={busy}><Send size={15}/>{busy ? 'Sending…' : 'Send message'}</button></form></div>}</div>;
}

function MyUnbanRequests({ user }) {
  const [requests, setRequests] = useState([]); const [err, setErr] = useState('');
  const load = async () => { if (!user) return; try { setErr(''); setRequests((await api('/api/unban-requests/mine')).requests); } catch (error) { setErr(error.message); } };
  useEffect(() => { load(); }, [Boolean(user)]);
  if (!user) return null;
  return <div className="stack">{err && <Notice type="warn">{err}</Notice>}{requests.length === 0 && <p className="muted">You have not submitted an unban request.</p>}<div className="requestList">{requests.map((request) => <article className="requestItem" key={request.id}><div className="requestHeader"><div><b>#{request.id} · {request.warthunder_username}</b><span>Submitted {formatDate(request.created_at)}</span></div><span className={`requestStatus ${request.status}`}>{request.status}</span></div><p>{request.appeal_reason}</p><DiscordDelivery status={request.discord_delivery_status} reason={request.discord_delivery_reason} message={request.discord_delivery_message}/>{request.review_reason && <div className="reviewNote"><b>Moderator note</b><span>{request.review_reason}</span></div>}{request.reviewer_display && <small className="muted">Reviewed by {request.reviewer_display}</small>}<UnbanConversation request={request}/></article>)}</div></div>;
}

function PublicLookup({ user }) {
  const [player, setPlayer] = useState(''); const [result, setResult] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function lookup(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try { setResult(await api(`/api/public/bans/${encodeURIComponent(player.trim())}`)); }
    catch (error) { setErr(error.message); }
    finally { setBusy(false); }
  }
  return <div className="stack"><form onSubmit={lookup} className="stack"><label>Check a player</label><div className="searchLine"><input placeholder="War Thunder name or ID" value={player} onChange={(e) => setPlayer(e.target.value)} required/><button disabled={busy}><Search size={16}/>{busy ? 'Searching…' : 'Search'}</button></div></form>{err && <Notice type="warn">{err}</Notice>}{result && <div className="lookupResults"><Notice type={result.banned ? 'warn' : 'success'}>{result.banned ? `Active ban found (${result.bans.length})` : 'No active ban found.'}</Notice>{result.bans.map((ban) => <article className="publicBan" key={ban.id}><div className="publicBanHeader"><div><span>Active ban</span><b>{ban.warthunder_username}</b><span>War Thunder ID: {ban.warthunder_id || 'Not resolved'}</span></div><strong>{formatDuration(ban)}</strong></div><p>{ban.reason}</p><div className="publicBanMeta"><span>Started {formatDate(ban.starts_at)}</span><span>{ban.ends_at ? `Ends ${formatDate(ban.ends_at)}` : 'No end date'}</span></div><UnbanRequestForm ban={ban} user={user}/></article>)}</div>}</div>;
}

function MapVoteWidget({ compact = false, onOpen }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(null);

  async function load() {
    try { setErr(''); setData(await api('/api/map-votes/current')); }
    catch (error) { setErr(error.message); }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, []);

  async function vote(mapId) {
    setBusy(mapId); setErr('');
    try { setData(await api('/api/map-votes/vote', { method: 'POST', body: { mapId } })); }
    catch (error) { setErr(error.message); }
    finally { setBusy(null); }
  }

  const candidates = data?.candidates || [];
  const round = data?.round;
  return <div className={`mapVoteWidget ${compact ? 'compactMapVote' : ''}`}>
    {err && <Notice type="warn">{err}</Notice>}
    {data?.current_map && <div className="currentMapCard"><div className="mapImageFrame">{data.current_map.image_url && <img src={data.current_map.image_url} alt="" loading="lazy"/>}<span className="mapCurrentBadge">Current map</span></div><div className="mapCardBody"><b>{data.current_map.name}</b><a href={data.current_map.server_link} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Server link</a></div></div>}
    {!data && !err && <p className="muted">Loading the current vote…</p>}
    {data && !round && <Notice type="info">The bot has not opened the next map vote yet.</Notice>}
    {round && candidates.length === 0 && <Notice type="warn">There are no other active maps to vote for yet.</Notice>}
    {round && candidates.length > 0 && <div className="mapVoteCandidates">{candidates.map((map) => <article className={`mapVoteOption ${data.my_vote_map_id ? 'voteLocked' : ''}`} key={map.id}><div className="mapImageFrame">{map.image_url && <img src={map.image_url} alt="" loading="lazy"/>}</div><div className="mapCardBody"><div><b>{map.name}</b><span className="voteCount">{map.vote_count} vote{map.vote_count === 1 ? '' : 's'}</span></div><a href={map.server_link} target="_blank" rel="noreferrer"><ExternalLink size={13}/>Server link</a><button disabled={Boolean(data.my_vote_map_id || busy)} onClick={() => vote(map.id)}>{data.my_vote_map_id === map.id ? 'Your vote' : busy === map.id ? 'Voting…' : data.my_vote_map_id ? 'Vote cast' : 'Vote for this map'}</button></div></article>)}</div>}
    {round && <div className="mapVoteFooter"><span><Clock size={14}/>Vote closes {formatDate(round.ends_at)}</span>{data.my_vote_map_id && <span className="voteSubmitted">Your vote is recorded.</span>}{compact && <button className="secondary" onClick={onOpen}><MapIcon size={15}/>Open full vote</button>}</div>}
    {!round && compact && <button className="secondary" onClick={onOpen}><MapIcon size={15}/>Open map votes</button>}
  </div>;
}

function MapVotePage() {
  return <div className="panelGrid mapVotePage"><Card title="Map vote" kicker="public server choice" icon={<MapIcon/>}><p className="muted small">Anyone can vote once per round. The current map is never offered as a choice. When the round closes, the bot receives the winning map and its server link; a round with no votes picks randomly.</p><MapVoteWidget/></Card><Card title="How map rounds work" kicker="bot-controlled" icon={<Radio/>}><div className="stack"><Notice>Map creators publish the name, artwork, and server link. The Discord bot starts and ends rounds through the protected bot API.</Notice><p className="muted small">Votes are kept to one per browser or signed-in Discord account for each round. Vote totals refresh automatically while this page is open.</p></div></Card></div>;
}

function MapCreatorPage({ user, canManageMaps }) {
  const [maps, setMaps] = useState([]);
  const [form, setForm] = useState({ name: '', serverLink: '', imageUrl: '', image: null });
  const [err, setErr] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function load() {
    if (!canManageMaps) return;
    try { setErr(''); setMaps((await api('/api/maps/manage')).maps || []); }
    catch (error) { setErr(error.message); }
  }
  useEffect(() => { load(); }, [canManageMaps]);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setErr(''); setMessage('');
    try {
      const body = new FormData();
      body.append('name', form.name); body.append('serverLink', form.serverLink);
      if (form.imageUrl) body.append('imageUrl', form.imageUrl);
      if (form.image) body.append('image', form.image, form.image.name);
      await api('/api/maps', { method: 'POST', body });
      setForm({ name: '', serverLink: '', imageUrl: '', image: null });
      const input = document.getElementById('map-image-upload'); if (input) input.value = '';
      setMessage('Map added. The bot can now retrieve its server link from the map API.'); await load();
    } catch (error) { setErr(error.message); }
    finally { setBusy(false); }
  }
  async function toggle(map) {
    try { await api(`/api/maps/${map.id}`, { method: 'PATCH', body: { active: !map.active } }); await load(); }
    catch (error) { setErr(error.message); }
  }
  if (!user) return <Notice type="warn">Log in with Discord to manage maps.</Notice>;
  if (!canManageMaps) return <Notice type="warn">The Map Creator Discord role is required to manage maps.</Notice>;
  return <div className="panelGrid mapCreatorPage"><Card title="Add a map" kicker="map creator tools" icon={<MapIcon/>}><div className="stack">{err && <Notice type="warn">{err}</Notice>}{message && <Notice type="success">{message}</Notice>}<form className="stack" onSubmit={submit}><label>Map name<input value={form.name} maxLength="255" onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Harbor night" required/></label><label>Server link<input type="url" value={form.serverLink} maxLength="2000" onChange={(event) => setForm({ ...form, serverLink: event.target.value })} placeholder="https://…" required/><small className="muted small">This link is returned to the bot for its map announcement or game-server handoff.</small></label><label>Map image<input id="map-image-upload" type="file" accept="image/*" onChange={(event) => setForm({ ...form, image: event.target.files?.[0] || null })}/><small className="muted small">Upload one image up to 10 MB, or use an HTTPS image URL below.</small></label><label>Image URL (optional)<input type="url" value={form.imageUrl} maxLength="2000" onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="https://…"/></label><button disabled={busy}><Save size={16}/>{busy ? 'Adding…' : 'Add map'}</button></form></div></Card><Card title="Map catalogue" kicker={`${maps.length} map${maps.length === 1 ? '' : 's'}`} icon={<ListChecks/>}><div className="mapAdminList">{maps.length === 0 && <Notice>No maps have been added yet.</Notice>}{maps.map((map) => <article className={`mapAdminCard ${map.active ? '' : 'inactiveMap'}`} key={map.id}><div className="mapImageFrame">{map.image_url && <img src={map.image_url} alt="" loading="lazy"/>}<span className={`mapStatus ${map.active ? 'active' : 'inactive'}`}>{map.active ? 'Active' : 'Hidden'}</span></div><div className="mapCardBody"><b>{map.name}</b><a href={map.server_link} target="_blank" rel="noreferrer"><ExternalLink size={13}/>Open server link</a><small className="muted">Added by {map.created_by_label || 'Map creator'}</small><button className="secondary" onClick={() => toggle(map)}>{map.active ? 'Hide map' : 'Publish map'}</button></div></article>)}</div></Card></div>;
}

function StatusBox() {
  const [status, setStatus] = useState(null); const [err, setErr] = useState('');
  const load = async () => { try { setErr(''); setStatus(await api('/api/bot/cb-status')); } catch (e) { setErr(e.message); } };
  useEffect(() => { load(); }, []);
  return <div className="stack">{status ? <Notice type={status.online ? 'success' : 'warn'}>CB is <b>{status.online ? 'online' : 'offline'}</b>. {status.status?.invite_hint}</Notice> : <p>Loading…</p>}{err && <Notice type="warn">{err}</Notice>}<button className="secondary" onClick={load}><RefreshCw size={16}/>Refresh</button></div>;
}

function LinkCode({ user }) {
  const [code, setCode] = useState(null); const [err, setErr] = useState('');
  async function make() { setErr(''); try { setCode(await api('/api/link-codes', { method: 'POST', body: { serviceName: 'warthunder', minutesValid: 15 } })); } catch (e) { setErr(e.message); } }
  if (!user) return <Notice type="warn">Login to make a link code.</Notice>;
  return <div className="stack"><button onClick={make}><KeyRound size={16}/>Make link code</button>{err && <Notice type="warn">{err}</Notice>}{code && <div className="codeBox"><span>{code.serviceName}</span><b>{code.code}</b><small>Expires {formatDate(code.expiresAt)}</small></div>}</div>;
}

function clientGuildDays(joinedAt) {
  const date = parseDate(joinedAt);
  return date ? Math.max(0, Math.floor((Date.now() - date.valueOf()) / 86_400_000)) : null;
}

function StaffApplicationForm({ user }) {
  const [form, setForm] = useState({ birthDate: '', experience: '', availability: '', motivation: '' });
  const [applications, setApplications] = useState([]);
  const [err, setErr] = useState(''); const [message, setMessage] = useState(''); const [delivery, setDelivery] = useState(null); const [busy, setBusy] = useState(false);
  const joinedDays = clientGuildDays(user?.discordJoinedAt);
  const maxBirthDate = new Date(Date.now() - 18 * 365.25 * 86_400_000).toISOString().slice(0, 10);
  async function load() {
    try { setApplications((await api('/api/staff-applications/mine')).applications || []); }
    catch (error) { setErr(error.message); }
  }
  useEffect(() => { if (user) load(); }, [Boolean(user)]);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setErr(''); setMessage('');
    try {
      const out = await api('/api/staff-applications', { method: 'POST', body: form });
      setDelivery(out.application || null);
      setMessage('Application submitted. Moderators will receive a notification when it is ready to review.');
      setForm({ birthDate: '', experience: '', availability: '', motivation: '' }); await load();
    } catch (error) { setErr(error.message); }
    finally { setBusy(false); }
  }
  return <div className="stack"><Notice>Requirements: you must be 18 or older and have been in the CB Discord server for at least 30 days. Your date of birth is used only to verify the age rule; the site stores the resulting age, not your birth date.</Notice><div className="eligibilityGrid"><div><span>Discord membership</span><b>{joinedDays == null ? 'Join date unavailable' : `${joinedDays} day${joinedDays === 1 ? '' : 's'}`}</b></div><div><span>Age rule</span><b>{form.birthDate ? 'Checked on submit' : '18+'}</b></div></div>{err && <Notice type="warn">{err}</Notice>}{message && <><Notice type="success">{message}</Notice><DiscordDelivery {...(delivery || {})}/></>}<form className="stack" onSubmit={submit}><label>Date of birth (private verification)</label><input type="date" max={maxBirthDate} value={form.birthDate} onChange={(event) => setForm({ ...form, birthDate: event.target.value })} required/><label>Moderation experience</label><textarea minLength="20" maxLength="10000" value={form.experience} onChange={(event) => setForm({ ...form, experience: event.target.value })} placeholder="Tell the team about relevant experience, if any." required/><label>Availability</label><textarea minLength="5" maxLength="2000" value={form.availability} onChange={(event) => setForm({ ...form, availability: event.target.value })} placeholder="When are you usually available?" required/><label>Why would you be a good staff member?</label><textarea minLength="20" maxLength="10000" value={form.motivation} onChange={(event) => setForm({ ...form, motivation: event.target.value })} placeholder="What would you bring to the team?" required/><button disabled={busy}><UserPlus size={16}/>{busy ? 'Submitting…' : 'Submit staff application'}</button></form>{applications.length > 0 && <div className="stack"><h3 className="subheading">Your applications</h3><div className="requestList">{applications.map((application) => <article className="requestItem compactItem" key={application.id}><div className="requestHeader"><div><b>Application #{application.id}</b><span>Submitted {formatDate(application.created_at)} · {application.rule_summary}</span></div><span className={`requestStatus ${application.status}`}>{application.status}</span></div><DiscordDelivery status={application.discord_delivery_status} reason={application.discord_delivery_reason} message={application.discord_delivery_message}/>{application.review_reason && <div className="reviewNote"><b>Moderator note</b><span>{application.review_reason}</span></div>}</article>)}</div></div>}</div>;
}

function BanRequestForm({ user }) {
  const [form, setForm] = useState({ username: '', warthunderId: '', reason: '', evidenceUrl: '', evidenceFiles: [], evidenceError: '' });
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  if (!user) return <a className="secondary requestLogin" href={`${API}/auth/discord`}>Log in to report a player</a>;
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage(''); setError('');
    try {
      const body = new FormData();
      body.append('username', form.username);
      if (form.warthunderId) body.append('warthunderId', form.warthunderId);
      body.append('reason', form.reason);
      if (form.evidenceUrl) body.append('evidenceUrl', form.evidenceUrl);
      form.evidenceFiles.forEach((file) => body.append('evidence', file, file.name));
      await api('/api/ban-requests', { method: 'POST', body });
      setMessage('Your ban request was sent to the moderation team. You will be notified when it is reviewed.');
      setForm({ username: '', warthunderId: '', reason: '', evidenceUrl: '', evidenceFiles: [], evidenceError: '' });
    }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <div className="stack">{message && <Notice type="success">{message}</Notice>}{error && <Notice type="warn">{error}</Notice>}<form className="stack" onSubmit={submit}><label>War Thunder username</label><input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="Player to report" required/><label>War Thunder ID (optional)</label><input value={form.warthunderId} onChange={(event) => setForm({ ...form, warthunderId: event.target.value })} placeholder="If known"/><label>Why should moderators review this player?</label><textarea minLength="10" maxLength="10000" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Describe what happened and when." required/><label>Evidence URL (optional)</label><input type="url" value={form.evidenceUrl} onChange={(event) => setForm({ ...form, evidenceUrl: event.target.value })} placeholder="Screenshot, clip, or message link"/><EvidencePicker files={form.evidenceFiles} onChange={(evidenceFiles, evidenceError) => setForm({ ...form, evidenceFiles, evidenceError })}/>{form.evidenceError && <Notice type="warn">{form.evidenceError}</Notice>}<button disabled={busy}><Flag size={16}/>{busy ? 'Sending…' : 'Send ban request'}</button></form></div>;
}

function MyBanRequests({ user }) {
  const [requests, setRequests] = useState([]); const [err, setErr] = useState('');
  async function load() { try { setErr(''); setRequests((await api('/api/ban-requests/mine')).requests || []); } catch (error) { setErr(error.message); } }
  useEffect(() => { if (user) load(); }, [Boolean(user)]);
  if (!user) return null;
  return <div className="stack">{err && <Notice type="warn">{err}</Notice>}{requests.length === 0 ? <p className="muted">You have not sent a ban request.</p> : <div className="requestList">{requests.map((request) => <article className="requestItem compactItem" key={request.id}><div className="requestHeader"><div><b>#{request.id} · {request.warthunder_username}</b><span>Submitted {formatDate(request.created_at)}</span></div><span className={`requestStatus ${request.status}`}>{request.status}</span></div><p>{request.reason}</p>{request.evidence?.map((file) => <a href={file.download_url} target="_blank" rel="noreferrer" className="evidenceLink" key={file.id}><ExternalLink size={14}/>{file.original_name}</a>)}{request.review_reason && <div className="reviewNote"><b>Moderator note</b><span>{request.review_reason}</span></div>}</article>)}</div>}</div>;
}

function StaffApplicationQueue({ perms, refreshKey, onChanged }) {
  const [data, setData] = useState({ applications: [], page: 1, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1); const [search, setSearch] = useState(''); const [searchInput, setSearchInput] = useState(''); const [reasons, setReasons] = useState({}); const [err, setErr] = useState('');
  async function load() {
    if (!perms.canModerate) return;
    try { const params = new URLSearchParams({ page: String(page), limit: '15' }); if (search) params.set('search', search); const out = await api(`/api/staff-applications?${params}`); setData(out); if (out.page !== page) setPage(out.page); setErr(''); }
    catch (error) { setErr(error.message); }
  }
  useEffect(() => { load(); }, [perms.canModerate, refreshKey, page, search]);
  async function decide(application, decision) {
    const reason = (reasons[application.id] || '').trim();
    if (reason.length < 3) { setErr('Add a reason before deciding an application.'); return; }
    try { await api(`/api/staff-applications/${application.id}/decision`, { method: 'POST', body: { decision, reason } }); await load(); onChanged?.(); }
    catch (error) { setErr(error.message); }
  }
  if (!perms.canModerate) return null;
  const applications = data.applications || [];
  return <div className="stack"><div className="queueToolbar"><div><b>{data.total || 0} pending application{data.total === 1 ? '' : 's'}</b>{search && <small>Matching “{search}”</small>}</div><div className="queueActions"><form className="queueSearch" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}><Search size={15}/><input placeholder="Search applicant or application" value={searchInput} onChange={(event) => setSearchInput(event.target.value)}/><button>Search</button></form><button className="secondary" onClick={load}><RefreshCw size={16}/>Refresh</button></div></div>{err && <Notice type="warn">{err}</Notice>}{!perms.canManage && <Notice>Moderators can read applications. HMods and above decide them.</Notice>}{applications.length === 0 && <Notice type="success">{search ? 'No pending applications match this search.' : 'No staff applications are waiting.'}</Notice>}<div className="applicationList">{applications.map((application) => <article className="applicationCard" key={application.id}><div className="requestHeader"><div><b>#{application.id} · {application.applicant_display}</b><span>{formatDate(application.created_at)} · {application.rule_summary}</span></div><span className="requestStatus pending">pending</span></div><DiscordDelivery status={application.discord_delivery_status} reason={application.discord_delivery_reason} message={application.discord_delivery_message}/><div className="applicationFields"><div><b>Experience</b><p>{application.experience}</p></div><div><b>Availability</b><p>{application.availability}</p></div><div><b>Motivation</b><p>{application.motivation}</p></div></div>{perms.canManage && <><textarea placeholder="Decision reason (required)" value={reasons[application.id] || ''} onChange={(event) => setReasons({ ...reasons, [application.id]: event.target.value })}/><div className="inline end"><button className="secondary" onClick={() => decide(application, 'approve')}>Approve</button><button className="danger" onClick={() => decide(application, 'deny')}>Deny</button></div></>}</article>)}</div><QueuePagination page={data.page || page} totalPages={data.totalPages || 0} total={data.total || 0} onPage={setPage}/></div>;
}

function CommunityBanRequestQueue({ perms, refreshKey, onChanged }) {
  const [data, setData] = useState({ requests: [], page: 1, total: 0, totalPages: 0 }); const [page, setPage] = useState(1); const [search, setSearch] = useState(''); const [searchInput, setSearchInput] = useState(''); const [reasons, setReasons] = useState({}); const [err, setErr] = useState('');
  async function load() { if (!perms.canModerate) return; try { const params = new URLSearchParams({ page: String(page), limit: '15' }); if (search) params.set('search', search); const out = await api(`/api/ban-requests?${params}`); setData(out); if (out.page !== page) setPage(out.page); setErr(''); } catch (error) { setErr(error.message); } }
  useEffect(() => { load(); }, [perms.canModerate, refreshKey, page, search]);
  async function decide(request, decision) { const reason = (reasons[request.id] || '').trim(); if (reason.length < 3) { setErr('Add a reason before deciding a ban request.'); return; } try { await api(`/api/ban-requests/${request.id}/decision`, { method: 'POST', body: { decision, reason } }); await load(); onChanged?.(); } catch (error) { setErr(error.message); } }
  if (!perms.canModerate) return null;
  const requests = data.requests || [];
  return <div className="stack"><div className="queueToolbar"><div><b>{data.total || 0} pending community report{data.total === 1 ? '' : 's'}</b>{search && <small>Matching “{search}”</small>}</div><div className="queueActions"><form className="queueSearch" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}><Search size={15}/><input placeholder="Search player, requester, or reason" value={searchInput} onChange={(event) => setSearchInput(event.target.value)}/><button>Search</button></form><button className="secondary" onClick={load}><RefreshCw size={16}/>Refresh</button></div></div>{err && <Notice type="warn">{err}</Notice>}{requests.length === 0 && <Notice type="success">{search ? 'No community reports match this search.' : 'No community ban reports are waiting.'}</Notice>}<div className="requestList">{requests.map((request) => <article className="requestItem" key={request.id}><div className="requestHeader"><div><b>#{request.id} · {request.warthunder_username}</b><span>From {request.requester_display} · {formatDate(request.created_at)}</span></div><span className="requestStatus pending">pending</span></div>{request.warthunder_id && <span className="muted small">War Thunder ID: {request.warthunder_id}</span>}<p>{request.reason}</p>{request.evidence_url && <a href={request.evidence_url} target="_blank" rel="noreferrer" className="evidenceLink"><ExternalLink size={14}/>Open evidence URL</a>}{request.evidence?.map((file) => <a href={file.download_url} target="_blank" rel="noreferrer" className="evidenceLink" key={file.id}><ExternalLink size={14}/>{file.original_name}</a>)}<textarea placeholder="Decision reason (required)" value={reasons[request.id] || ''} onChange={(event) => setReasons({ ...reasons, [request.id]: event.target.value })}/><div className="inline end"><button className="secondary" onClick={() => decide(request, 'approve')}>Accept for moderation</button><button className="danger" onClick={() => decide(request, 'deny')}>Deny</button></div></article>)}</div><QueuePagination page={data.page || page} totalPages={data.totalPages || 0} onPage={setPage}/></div>;
}

function SettingsPage({ user, settings, onChange }) {
  if (!user) return <Notice type="warn">Log in with Discord to open settings.</Notice>;
  const themes = [{ id: 'aurora', label: 'Aurora', description: 'Mint and violet glass' }, { id: 'midnight', label: 'Midnight', description: 'Cool blue contrast' }, { id: 'ember', label: 'Ember', description: 'Warm orange accents' }, { id: 'paper', label: 'Paper', description: 'Bright high-contrast cards' }, { id: 'custom', label: settings.customThemeName || 'My theme', description: 'Your colors and background' }];
  const update = (key, value) => onChange({ ...settings, [key]: value });
  return <div className="settingsPage stack">
    <Card title="Appearance" kicker="saved in cookies" icon={<Palette/>}>
      <div className="stack">
        <p className="muted small">Choose a preset or select Custom to make your own colors and image background. These preferences are saved in a browser cookie.</p>
        <div className="themeCards">{themes.map((theme) => <button type="button" className={`themeOption ${settings.theme === theme.id ? 'selected' : ''} themePreview-${theme.id}`} key={theme.id} onClick={() => update('theme', theme.id)}><span className="themeSwatch"/><b>{theme.label}</b><small>{theme.description}</small>{settings.theme === theme.id && <CheckCircle2 size={16}/>}</button>)}</div>
        {settings.theme === 'custom' && <div className="customThemeEditor">
          <label>Theme name<input maxLength="64" value={settings.customThemeName} onChange={(event) => update('customThemeName', event.target.value)} placeholder="My theme"/></label>
          <label>Accent color<input type="color" value={settings.customAccent} onChange={(event) => update('customAccent', event.target.value)}/></label>
          <label>Highlight color<input type="color" value={settings.customHighlight} onChange={(event) => update('customHighlight', event.target.value)}/></label>
          <label className="wideSetting"><span className="settingLabel"><ImagePlus size={15}/>Background image URL</span><input type="url" maxLength="1200" value={settings.customBackgroundUrl} onChange={(event) => update('customBackgroundUrl', event.target.value)} placeholder="https://example.com/background.jpg"/><small className="muted small">Use an HTTPS image URL. The URL is saved in the cookie; image files are not uploaded.</small></label>
          <label className="wideSetting">Background overlay<input type="range" min="0" max="0.85" step="0.01" value={settings.backgroundOverlay} onChange={(event) => update('backgroundOverlay', Number(event.target.value))}/></label>
        </div>}
        <div className="settingsGrid">
          <label>Layout density<select value={settings.density} onChange={(event) => update('density', event.target.value)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
          <label>Motion<select value={settings.motion} onChange={(event) => update('motion', event.target.value)}><option value="full">Full motion</option><option value="reduced">Reduce motion</option></select></label>
          <label>Font size (px)<input type="number" min="12" max="24" step="1" value={settings.fontSizePx} onChange={(event) => update('fontSizePx', Number(event.target.value))}/></label>
          <label>Surface style<select value={settings.surfaces} onChange={(event) => update('surfaces', event.target.value)}><option value="glass">Glass</option><option value="solid">Solid</option></select></label>
        </div>
        <div className="appearanceControls">
          <label>Background mood<select value={settings.backgroundPattern} onChange={(event) => update('backgroundPattern', event.target.value)}><option value="aurora">Aurora wash</option><option value="net">Interactive net</option><option value="orbs">Floating orbs</option><option value="waves">Calm waves</option><option value="stars">Slow starfield</option><option value="aurora-live">Living aurora</option><option value="wire">Wire mesh</option><option value="mesh">Grid mesh</option><option value="dots">Constellation dots</option><option value="none">Clean</option></select></label>
          <label>Atmosphere<select value={settings.atmosphere} onChange={(event) => update('atmosphere', event.target.value)}><option value="balanced">Balanced</option><option value="cozy">Cozy sunset</option><option value="ocean">Ocean calm</option><option value="forest">Soft forest</option><option value="candy">Candy glow</option></select></label>
          <label>Card corner radius (px)<input type="number" min="10" max="42" step="1" value={settings.cardRadius} onChange={(event) => update('cardRadius', Number(event.target.value))}/></label>
          <label className="rangeField">Texture strength <output>{Math.round(settings.patternOpacity * 100)}%</output><input type="range" min="0" max="1" step="0.01" value={settings.patternOpacity} onChange={(event) => update('patternOpacity', Number(event.target.value))}/></label>
          <label className="rangeField">Glass blur <output>{settings.surfaceBlur}px</output><input type="range" min="0" max="30" step="1" value={settings.surfaceBlur} onChange={(event) => update('surfaceBlur', Number(event.target.value))}/></label>
        </div>
        {ANIMATED_BACKGROUNDS.has(settings.backgroundPattern) && <div className="netControls">
          <div className="netControlsIntro"><div><b>Living background controls</b><p className="muted small">Tune the movement without changing your content. The canvas stays behind the cards and responds gently to your pointer.</p></div><label className="toggleLabel"><input type="checkbox" checked={settings.netInteractive} onChange={(event) => update('netInteractive', event.target.checked)}/>Pointer interaction</label></div>
          <label>Node count<input type="number" min="20" max="180" step="1" value={settings.netDensity} onChange={(event) => update('netDensity', Number(event.target.value))}/></label>
          <label className="rangeField">Motion speed <output>{Math.round(settings.netSpeed * 100)}%</output><input type="range" min="0" max="1" step="0.01" value={settings.netSpeed} onChange={(event) => update('netSpeed', Number(event.target.value))}/></label>
          <label className="rangeField">Link distance <output>{settings.netLinkDistance}px</output><input type="range" min="60" max="260" step="1" value={settings.netLinkDistance} onChange={(event) => update('netLinkDistance', Number(event.target.value))}/></label>
          <label className="rangeField">Glow strength <output>{Math.round(settings.netLineOpacity * 100)}%</output><input type="range" min="0.05" max="1" step="0.01" value={settings.netLineOpacity} onChange={(event) => update('netLineOpacity', Number(event.target.value))}/></label>
          <label className="rangeField">Particle size <output>{settings.netParticleSize}px</output><input type="range" min="0.5" max="4" step="0.1" value={settings.netParticleSize} onChange={(event) => update('netParticleSize', Number(event.target.value))}/></label>
        </div>}
        <div className="soundSettings"><div><b>Notification sounds</b><p className="muted small">Play a short sound for new staff applications, ban requests, unban requests, and replies.</p></div><label className="toggleLabel"><input type="checkbox" checked={settings.soundEnabled} onChange={(event) => update('soundEnabled', event.target.checked)}/>{settings.soundEnabled ? <Volume2 size={16}/> : <VolumeX size={16}/>} {settings.soundEnabled ? 'Enabled' : 'Muted'}</label><label>Volume<input type="range" min="0" max="1" step="0.05" value={settings.soundVolume} onChange={(event) => update('soundVolume', Number(event.target.value))}/></label><button type="button" className="secondary" onClick={() => playNotificationSound(settings.soundVolume)}><Volume2 size={16}/>Test sound</button></div>
        <button className="secondary" onClick={() => onChange({ ...DEFAULT_UI_SETTINGS })}><SlidersHorizontal size={16}/>Reset appearance</button>
      </div>
    </Card>
    <Card title="Cookie controls" kicker="privacy and portability" icon={<Paintbrush/>}><p className="muted small">Appearance preferences stay on this browser. Clearing site cookies resets them. Remote background URLs are only loaded by your browser when you choose one.</p><button type="button" className="secondary" onClick={() => { setCookie(UI_SETTINGS_KEY, '', -1); onChange({ ...DEFAULT_UI_SETTINGS }); }}><Trash2 size={16}/>Clear saved appearance</button></Card>
  </div>;
}

function StaffApplicationsPage({ user }) {
  if (!user) return <Notice type="warn">Log in with Discord to apply for staff.</Notice>;
  return <div className="panelGrid staffApplicationsPage"><Card title="Staff application" kicker="join the moderation team" icon={<UserPlus/>}><StaffApplicationForm user={user}/></Card><Card title="Application rules" kicker="before you submit" icon={<CheckCircle2/>}><div className="stack"><Notice>Applications require an age of 18+ and at least 30 days in the CB Discord server.</Notice><p className="muted">Your date of birth is checked server-side and only the resulting age is stored. Your Discord membership time comes from the guild record, so changing a browser value cannot bypass the rule.</p><p className="muted">HMods and above decide applications. Approval records the decision; assigning the Discord role is still handled by a server administrator.</p></div></Card></div>;
}

function PublicPage({ user, onOpenMaps }) {
  return <div className="panelGrid publicGrid"><Card title="Public Ban Lookup" kicker="player tools" icon={<Search/>}><PublicLookup user={user}/></Card><Card title="Map vote" kicker="choose the next map" icon={<MapIcon/>}><MapVoteWidget compact onOpen={onOpenMaps}/></Card><Card title="CB Status" kicker="server status" icon={<Radio/>}><StatusBox/></Card>{user && <Card title="My unban requests" kicker="appeals" icon={<Bell/>}><MyUnbanRequests user={user}/></Card>}{user && <Card title="Report a player" kicker="community ban request" icon={<Flag/>}><BanRequestForm user={user}/><MyBanRequests user={user}/></Card>}<Card title="How it works" kicker="clear records" icon={<CheckCircle2/>}><p className="muted">Search a War Thunder name or ID to see whether an active ban exists, how long it lasts, and the recorded reason. Sign in with Discord to request an unban, report a player, apply for staff, and receive updates in your notification inbox.</p></Card></div>;
}

function ModPanel({ perms, selectedPlayer, onCreated, refreshKey }) {
  if (!perms.canModerate) return <Notice type="warn">This workspace is only available to Trial Mods and above.</Notice>;
  const isRequest = Number(perms.level || 0) < 4;
  return <div className="modWorkspace stack"><Card title={`${perms.levelName} workspace`} kicker="role-aware moderation" icon={<LayoutDashboard/>}><div className="workspaceSummary"><div><span>Ban limit</span><b>{perms.maxBanLabel}</b></div><div><span>Review access</span><b>{perms.canReview ? 'Lower-rank requests' : 'No lower rank yet'}</b></div><div><span>Management</span><b>{perms.canManage ? 'Edit, revoke, audit' : 'Create and request'}</b></div></div><p className="muted small">Trial Mods, Mods, and HMods submit ban requests for higher-rank approval. Approved requests become active bans. Every request records the Discord moderator, their rank, resolved War Thunder ID, and evidence. HMods and above can decide unban requests for any player. Discord role access is rechecked automatically about once a minute.</p></Card><div className="panelGrid"><Card title={isRequest ? 'Submit ban request' : 'Create ban'} kicker={isRequest ? 'higher-rank approval' : 'moderation action'} icon={<Shield/>}><BanForm perms={perms} selectedPlayer={selectedPlayer} onCreated={onCreated}/></Card>{perms.canReview && <Card title="Ban requests" kicker="higher-rank approval" icon={<ListChecks/>}><ModerationBanRequestQueue perms={perms} refreshKey={refreshKey} onChanged={onCreated}/></Card>}<Card title="Staff applications" kicker="join requests" icon={<UserPlus/>} className="wideCard"><StaffApplicationQueue perms={perms} refreshKey={refreshKey} onChanged={onCreated}/></Card><Card title="Community reports" kicker="player reports" icon={<Flag/>} className="wideCard"><CommunityBanRequestQueue perms={perms} refreshKey={refreshKey} onChanged={onCreated}/></Card>{perms.canManage && <Card title="Unban requests" kicker="HMod+ appeals and messages" icon={<Bell/>} className="wideCard"><UnbanRequestQueue perms={perms} refreshKey={refreshKey} onChanged={onCreated}/></Card>}<Card title="Active bans" kicker="live records" icon={<Ban/>} className="wideCard"><ActiveBans perms={perms} refreshKey={refreshKey}/></Card><Card title="Ban history" kicker="who did what" icon={<History/>} className="wideCard"><BanHistory perms={perms} refreshKey={refreshKey} /></Card></div></div>;
}

function panelFromLocation() {
  if (window.location.pathname === '/mod') return 'mod';
  if (window.location.pathname === '/link') return 'link';
  if (window.location.pathname === '/maps') return 'maps';
  if (window.location.pathname === '/map-creator') return 'map-admin';
  if (window.location.pathname === '/settings') return 'settings';
  if (window.location.pathname === '/staff-applications') return 'staff';
  return 'public';
}

function App() {
  const [me, setMe] = useState(null); const [authErr, setAuthErr] = useState(''); const [activePanel, setActivePanel] = useState(panelFromLocation); const [refreshKey, setRefreshKey] = useState(0); const [selectedPlayer, setSelectedPlayer] = useState(null); const [uiSettings, setUiSettings] = useState(loadUiSettings);
  const refresh = (force = false) => api(`/auth/me${force ? '?refresh=1' : ''}`).then((out) => { setMe(out.user); setAuthErr(''); return out.user; }).catch((error) => { if (!force) setMe(null); setAuthErr(error.message); return null; });
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!me) return undefined;
    const timer = setInterval(() => refresh(true), 30_000);
    return () => clearInterval(timer);
  }, [Boolean(me)]);
  useEffect(() => { const handlePopState = () => setActivePanel(panelFromLocation()); window.addEventListener('popstate', handlePopState); return () => window.removeEventListener('popstate', handlePopState); }, []);
  useEffect(() => { if (activePanel === 'mod' && !me?.perms?.canModerate) { setActivePanel('public'); if (window.location.pathname === '/mod') window.history.replaceState({}, '', '/'); } }, [me, activePanel]);
  useEffect(() => {
    saveUiSettings(uiSettings);
    const root = document.documentElement;
    ['theme-aurora', 'theme-midnight', 'theme-ember', 'theme-paper', 'theme-custom', 'density-comfortable', 'density-compact', 'motion-full', 'motion-reduced', 'font-normal', 'font-large', 'surfaces-glass', 'surfaces-solid'].forEach((name) => root.classList.remove(name));
    root.classList.add(`theme-${uiSettings.theme}`, `density-${uiSettings.density}`, `motion-${uiSettings.motion}`, `font-${uiSettings.fontSize}`, `surfaces-${uiSettings.surfaces}`);
    const customTheme = uiSettings.theme === 'custom';
    ['--mint', '--mint2', '--purple', '--pink'].forEach((property) => root.style.removeProperty(property));
    if (customTheme) {
      root.style.setProperty('--mint', uiSettings.customAccent);
      root.style.setProperty('--mint2', uiSettings.customAccent);
      root.style.setProperty('--purple', uiSettings.customHighlight);
      root.style.setProperty('--pink', uiSettings.customHighlight);
    } else if (ATMOSPHERE_PRESETS[uiSettings.atmosphere]) {
      const preset = ATMOSPHERE_PRESETS[uiSettings.atmosphere];
      root.style.setProperty('--mint', preset.mint);
      root.style.setProperty('--mint2', preset.mint2);
      root.style.setProperty('--purple', preset.purple);
      root.style.setProperty('--pink', preset.pink);
    }
    ['atmosphere-balanced', 'atmosphere-cozy', 'atmosphere-ocean', 'atmosphere-forest', 'atmosphere-candy'].forEach((name) => document.body.classList.remove(name));
    document.body.classList.add(`atmosphere-${uiSettings.atmosphere}`);
    const backgroundUrl = safeBackgroundUrl(uiSettings.customBackgroundUrl);
    document.body.classList.toggle('hasCustomBackground', Boolean(customTheme && backgroundUrl));
    document.body.classList.remove('pattern-none', 'pattern-wire', 'pattern-mesh', 'pattern-dots', 'pattern-aurora', 'pattern-net', 'pattern-orbs', 'pattern-waves', 'pattern-stars', 'pattern-aurora-live');
    document.body.classList.add(`pattern-${uiSettings.backgroundPattern}`);
    root.style.setProperty('--custom-background-url', backgroundUrl ? `url("${backgroundUrl.replace(/["\\]/g, '\\$&')}")` : 'none');
    root.style.setProperty('--background-overlay', String(uiSettings.backgroundOverlay));
    root.style.setProperty('--pattern-opacity', String(uiSettings.patternOpacity));
    root.style.setProperty('--font-size-px', `${uiSettings.fontSizePx}px`);
    root.style.setProperty('--card-radius', `${uiSettings.cardRadius}px`);
    root.style.setProperty('--surface-blur', `${uiSettings.surfaceBlur}px`);
  }, [uiSettings]);
  useEffect(() => { if ((activePanel === 'settings' || activePanel === 'staff' || activePanel === 'map-admin') && !me) { setActivePanel('public'); if (window.location.pathname === '/settings' || window.location.pathname === '/staff-applications' || window.location.pathname === '/map-creator') window.history.replaceState({}, '', '/'); } }, [me, activePanel]);
  const perms = me?.perms || {};
  const canModerate = Boolean(perms.canModerate || perms.mod || perms.hmod || perms.admin || perms.top);
  const canManageMaps = Boolean(perms.mapCreator || perms.canManage || perms.admin || perms.top);
  const changePanel = (panel) => { setActivePanel(panel); const path = panel === 'mod' ? '/mod' : panel === 'link' ? '/link' : panel === 'maps' ? '/maps' : panel === 'map-admin' ? '/map-creator' : panel === 'settings' ? '/settings' : panel === 'staff' ? '/staff-applications' : '/'; if (window.location.pathname !== path) window.history.pushState({}, '', path); };
  return <><AnimatedBackground settings={uiSettings}/><main>
    <header className="hero"><div><p className="eyebrow">CB moderation suite</p><h1>Ban Panel</h1><p>Public records first. Discord-gated moderation tools appear in one workspace when your role allows them.</p></div><div className="headerActions"><NotificationsBell user={me} settings={uiSettings} onNavigate={changePanel}/><Login user={me} refresh={refresh} onNavigate={changePanel}/></div></header>
    {authErr && <Notice type="warn">Auth check failed: {authErr}</Notice>}
    <nav className="tabs" aria-label="Site navigation"><button className={activePanel === 'public' ? 'activeTab' : ''} onClick={() => changePanel('public')}><Search size={16}/>Public</button><button className={activePanel === 'maps' ? 'activeTab' : ''} onClick={() => changePanel('maps')}><MapIcon size={16}/>Map vote</button>{canManageMaps && <button className={activePanel === 'map-admin' ? 'activeTab' : ''} onClick={() => changePanel('map-admin')}><MapIcon size={16}/>Map creator</button>}{canModerate && <button className={activePanel === 'mod' ? 'activeTab' : ''} onClick={() => changePanel('mod')}><LayoutDashboard size={16}/>Mod Panel</button>}{me && <button className={activePanel === 'link' ? 'activeTab' : ''} onClick={() => changePanel('link')}><KeyRound size={16}/>Linking</button>}{me && <button className={activePanel === 'staff' ? 'activeTab' : ''} onClick={() => changePanel('staff')}><UserPlus size={16}/>Staff application</button>}{me && <button className={activePanel === 'settings' ? 'activeTab' : ''} onClick={() => changePanel('settings')}><Settings size={16}/>Settings</button>}</nav>
    {activePanel === 'public' && <PublicPage user={me} onOpenMaps={() => changePanel('maps')}/>}
    {activePanel === 'maps' && <MapVotePage/>}
    {activePanel === 'map-admin' && <MapCreatorPage user={me} canManageMaps={canManageMaps}/>}
    {activePanel === 'link' && <div className="panelGrid"><Card title="Link a player" kicker="account linking" icon={<KeyRound/>}><LinkCode user={me}/></Card><Card title="Discord lock" kicker="security" icon={<Shield/>}><p className="muted">This site accepts members of CB Discord server <b>{SERVER_ID}</b>. Your role is read from Discord at sign-in and every moderation request is checked again on the server.</p></Card></div>}
    {activePanel === 'settings' && <SettingsPage user={me} settings={uiSettings} onChange={setUiSettings}/>}
    {activePanel === 'staff' && <StaffApplicationsPage user={me}/>}
    {activePanel === 'mod' && <div className="appShell"><div className="panelArea"><ModPanel perms={perms} selectedPlayer={selectedPlayer} refreshKey={refreshKey} onCreated={() => setRefreshKey((key) => key + 1)}/></div><PlayerList canModerate={canModerate} onPick={(player) => { setSelectedPlayer(player); setActivePanel('mod'); }}/></div>}
  </main></>;
}

createRoot(document.getElementById('root')).render(<App/>);
