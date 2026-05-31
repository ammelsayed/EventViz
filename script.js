import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// =============================================================================
// PDG particle database
// =============================================================================

const pidMap = new Map();

function particleColor(pid) {
    const abs = Math.abs(pid);
    const anti = pid < 0;

    const quarkColors = {
        1: '#42a5f5', 2: '#ef5350', 3: '#66bb6a',
        4: '#ab47bc', 5: '#ffa726', 6: '#ec407a',
    };
    if (abs >= 1 && abs <= 6) {
        const c = quarkColors[abs];
        return anti ? shadeColor(c, -30) : c;
    }

    if (abs === 11) return anti ? '#ff7043' : '#29b6f6';
    if (abs === 13) return anti ? '#ce93d8' : '#9ccc65';
    if (abs === 15) return anti ? '#78909c' : '#ffca28';
    if (abs === 12 || abs === 14 || abs === 16) return '#cfd8dc';

    if (pid === 21) return '#f06292';
    if (pid === 22) return '#fff176';
    if (pid === 23) return '#b0bec5';
    if (pid === 24) return '#ef5350';
    if (pid === -24) return '#26c6da';
    if (pid === 25) return '#ffca28';

    if (abs === 2212) return anti ? '#e53935' : '#ef9a9a';
    if (abs === 2112) return '#78909c';
    if (abs === 211) return anti ? '#7e57c2' : '#ba68c8';
    if (abs === 111) return '#ce93d8';
    if (abs === 321 || abs === 310 || abs === 130) return '#26a69a';
    if (abs === 221 || abs === 331 || abs === 333) return '#a1887f';
    if (abs === 443) return '#5c6bc0';

    return '#9e9e9e';
}

function shadeColor(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, (n >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amount));
    const b = Math.min(255, Math.max(0, (n & 0xff) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function initPidMap() {
    const entries = [
        [1, 'd', 'd', -1 / 3], [-1, 'd̄', '\\bar{d}', 1 / 3],
        [2, 'u', 'u', 2 / 3], [-2, 'ū', '\\bar{u}', -2 / 3],
        [3, 's', 's', -1 / 3], [-3, 's̄', '\\bar{s}', 1 / 3],
        [4, 'c', 'c', 2 / 3], [-4, 'c̄', '\\bar{c}', -2 / 3],
        [5, 'b', 'b', -1 / 3], [-5, 'b̄', '\\bar{b}', 1 / 3],
        [6, 't', 't', 2 / 3], [-6, 't̄', '\\bar{t}', -2 / 3],
        [11, 'e⁻', 'e^-', -1], [-11, 'e⁺', 'e^+', 1],
        [12, 'νₑ', '\\nu_e', 0], [-12, 'ν̄ₑ', '\\bar{\\nu}_e', 0],
        [13, 'μ⁻', '\\mu^-', -1], [-13, 'μ⁺', '\\mu^+', 1],
        [14, 'ν_μ', '\\nu_\\mu', 0], [-14, 'ν̄_μ', '\\bar{\\nu}_\\mu', 0],
        [15, 'τ⁻', '\\tau^-', -1], [-15, 'τ⁺', '\\tau^+', 1],
        [16, 'ν_τ', '\\nu_\\tau', 0], [-16, 'ν̄_τ', '\\bar{\\nu}_\\tau', 0],
        [21, 'g', 'g', 0],
        [22, 'γ', '\\gamma', 0],
        [23, 'Z⁰', 'Z^0', 0], [24, 'W⁺', 'W^+', 1], [-24, 'W⁻', 'W^-', -1],
        [25, 'H⁰', 'H^0', 0],
        [111, 'π⁰', '\\pi^0', 0], [211, 'π⁺', '\\pi^+', 1], [-211, 'π⁻', '\\pi^-', -1],
        [130, 'K⁰L', 'K^0_L', 0], [310, 'K⁰S', 'K^0_S', 0],
        [321, 'K⁺', 'K^+', 1], [-321, 'K⁻', 'K^-', -1],
        [2112, 'n', 'n', 0], [-2112, 'n̄', '\\bar{n}', 0],
        [2212, 'p', 'p', 1], [-2212, 'p̄', '\\bar{p}', -1],
        [221, 'η', '\\eta', 0], [331, 'η′', "\\eta'", 0],
        [333, 'φ', '\\phi', 0], [443, 'J/ψ', 'J/\\psi', 0],
        [9000001, 'd', 'd', -1 / 3], [9000002, 'u', 'u', 2 / 3],
    ];
    for (const [code, name, latex, charge] of entries) {
        pidMap.set(code, { name, latex, charge, color: particleColor(code) });
    }
}
initPidMap();

function getParticleInfo(pid) {
    const info = pidMap.get(pid);
    if (info) return info;
    return { name: 'unknown', latex: '\\mathrm{unknown}', charge: null, color: particleColor(pid) };
}

function renderLatex(el, tex, displayMode = false) {
    if (typeof katex !== 'undefined') {
        katex.render(tex, el, { throwOnError: false, displayMode });
    } else {
        el.textContent = tex;
    }
}

// =============================================================================
// LHE parser
// =============================================================================

const BEAM_NAMES = {
    2212: 'p', [-2212]: 'p̄',
    11: 'e⁻', [-11]: 'e⁺',
    13: 'μ⁻', [-13]: 'μ⁺',
    22: 'γ', 9000001: 'd', 9000002: 'u',
};

function parseFortranFloat(s) {
    return parseFloat(String(s).replace(/[dD](?=[+-]?\d)/, 'E'));
}

function parseNumericLine(line) {
    return line.trim().split(/\s+/).map(parseFortranFloat);
}

function isIncoming(p) {
    return p.istup < 0;
}

function parseEventBlock(text) {
    const lines = text.split(/\r?\n/);
    const particles = [];
    let headerDone = false;

    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line === '<event>' || line === '</event>') continue;

        if (!headerDone) {
            const hdr = parseNumericLine(line);
            if (hdr.length >= 6 && !Number.isNaN(hdr[0])) headerDone = true;
            continue;
        }

        const parts = parseNumericLine(line);
        if (parts.length < 13 || Number.isNaN(parts[0])) continue;

        particles.push({
            idup: Math.trunc(parts[0]),
            istup: Math.trunc(parts[1]),
            moth1: Math.trunc(parts[2]),
            moth2: Math.trunc(parts[3]),
            icol1: Math.trunc(parts[4]),
            icol2: Math.trunc(parts[5]),
            px: parts[6], py: parts[7], pz: parts[8],
            e: parts[9], m: parts[10],
        });
    }
    return particles;
}

function parseMetadata(headerText) {
    const meta = {
        generator: 'Unknown',
        generatorVersion: '',
        process: 'N/A',
        crossSection: null,
        crossSectionErr: null,
        beam1: null, beam2: null,
        energy1: null, energy2: null,
        pdf1: null, pdf2: null,
        nProcesses: 0,
        readable: true,
    };

    const genRe = /<generator\b([^>]*)>([\s\S]*?)<\/generator>/gi;
    const gens = [];
    let m;
    while ((m = genRe.exec(headerText)) !== null) {
        const attrs = m[1];
        const body = m[2].trim();
        const name = (attrs.match(/\bname\s*=\s*['"]([^'"]+)['"]/i) || [])[1]
            || (attrs.match(/\bname\s*=\s*(\S+)/i) || [])[1]
            || body.split(/\s/)[0]
            || '';
        const version = (attrs.match(/\bversion\s*=\s*['"]([^'"]+)['"]/i) || [])[1]
            || (attrs.match(/\bversion\s*=\s*(\S+)/i) || [])[1]
            || '';
        if (name || body) gens.push({ name: name || body, version });
    }
    if (gens.length) {
        meta.generator = gens.map(g => g.name + (g.version ? ` v${g.version}` : '')).join(', ');
    }

    const initMatch = headerText.match(/<init>([\s\S]*?)<\/init>/i);
    if (initMatch) {
        const initLines = initMatch[1].split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (initLines.length) {
            const g = parseNumericLine(initLines[0]);
            if (g.length >= 10) {
                meta.beam1 = Math.trunc(g[0]);
                meta.beam2 = Math.trunc(g[1]);
                meta.energy1 = g[2];
                meta.energy2 = g[3];
                meta.pdf1 = { group: Math.trunc(g[4]), set: Math.trunc(g[5]) };
                meta.pdf2 = { group: Math.trunc(g[6]), set: Math.trunc(g[7]) };
                meta.nProcesses = Math.trunc(g[9]);

                if (initLines.length > 1) {
                    const proc = parseNumericLine(initLines[1]);
                    if (proc.length >= 4) {
                        meta.crossSection = proc[0];
                        meta.crossSectionErr = proc[1];
                        const lprup = Math.trunc(proc[3]);
                        const procTag = headerText.match(
                            new RegExp(`<proc\\b[^>]*id\\s*=\\s*['"]?${lprup}['"]?[^>]*>([\\s\\S]*?)<\\/proc>`, 'i')
                        );
                        if (procTag) {
                            meta.process = procTag[1].trim().replace(/\s+/g, ' ');
                        } else if (meta.process === 'N/A') {
                            meta.process = `Process ID ${lprup}`;
                        }
                    }
                }
            }
        }
    }

    if (meta.process === 'N/A') {
        const procMatch = headerText.match(/<proc\b[^>]*>([\s\S]*?)<\/proc>/i);
        if (procMatch) meta.process = procMatch[1].trim().replace(/\s+/g, ' ');
    }

    const pdfLine = headerText.match(/PDF\s*set\s*=?\s*([^\n<]+)/i);
    if (pdfLine) meta.pdfInfoText = pdfLine[1].trim();

    const pdfInfo = headerText.match(/PDF[^<\n]{0,120}/i);
    if (pdfInfo && !meta.pdfInfoText && (!meta.pdf1 || meta.pdf1.group === 0)) {
        meta.pdfInfoText = pdfInfo[0].trim();
    }

    return meta;
}

function validateLheStructure(text) {
    if (!text.includes('<event>')) return { ok: false, reason: 'No <event> blocks found.' };
    if (!text.includes('</event>')) return { ok: false, reason: 'Malformed events (missing </event>).' };
    return { ok: true };
}

async function readHeader(file) {
    const size = Math.min(file.size, 512 * 1024);
    let text = await file.slice(0, size).text();

    if (!text.includes('</init>') && file.size > size) {
        const more = await file.slice(0, Math.min(file.size, 2 * 1024 * 1024)).text();
        text = more;
    }
    return text;
}

async function buildEventIndex(file) {
    const offsets = [];
    const CHUNK = 512 * 1024;
    let bytePos = 0;
    let carry = '';
    let openStart = null;

    while (bytePos < file.size) {
        const chunk = await file.slice(bytePos, bytePos + CHUNK).text();
        const text = carry + chunk;

        let searchFrom = 0;
        while (searchFrom < text.length) {
            if (openStart === null) {
                const openIdx = text.indexOf('<event>', searchFrom);
                if (openIdx === -1) break;
                openStart = bytePos - carry.length + openIdx;
                searchFrom = openIdx + 7;
            } else {
                const closeIdx = text.indexOf('</event>', searchFrom);
                if (closeIdx === -1) break;
                const closeEnd = bytePos - carry.length + closeIdx + 8;
                offsets.push({ start: openStart, end: closeEnd });
                openStart = null;
                searchFrom = closeIdx + 8;
            }
        }

        if (openStart === null) {
            carry = text.slice(Math.max(0, text.length - 16));
        } else {
            const openLocal = openStart - (bytePos - carry.length);
            carry = text.slice(Math.max(0, openLocal));
        }

        bytePos += CHUNK;
    }

    return offsets;
}

function formatBeam(id) {
    return BEAM_NAMES[id] ? `${BEAM_NAMES[id]} (${id})` : `PID ${id}`;
}

function formatPdf(pdf, fallback) {
    if (fallback) return fallback;
    if (!pdf) return 'N/A';
    if (pdf.group === 0 && pdf.set === 0) return 'built-in / sum-of-weights';
    return `LHAPDF group ${pdf.group}, set ${pdf.set}`;
}

function formatCrossSection(xsec, err) {
    if (xsec == null || Number.isNaN(xsec)) return 'N/A';
    const val = xsec.toExponential(4);
    if (err != null && !Number.isNaN(err)) return `${val} ± ${err.toExponential(2)} pb`;
    return `${val} pb`;
}

// =============================================================================
// Three.js visualization
// =============================================================================

let scene, camera, renderer, labelRenderer, controls, viewportEl;
let currentEventGroup = null;
let hitTargets = [];
const _labelWorldPos = new THREE.Vector3();

const LABEL_REF_DIST = 10;
const LABEL_BASE_PX = 11;
const LABEL_MIN_PX = 5;
const LABEL_MAX_PX = 36;

function updateLabelScales() {
    if (!currentEventGroup) return;
    currentEventGroup.traverse(obj => {
        if (!obj.isCSS2DObject) return;
        obj.getWorldPosition(_labelWorldPos);
        const dist = camera.position.distanceTo(_labelWorldPos);
        const px = THREE.MathUtils.clamp(LABEL_BASE_PX * (LABEL_REF_DIST / dist), LABEL_MIN_PX, LABEL_MAX_PX);
        const katexEl = obj.element.querySelector('.katex');
        if (katexEl) katexEl.style.fontSize = `${px}px`;
    });
}

function viewportSize() {
    const w = viewportEl.clientWidth;
    const h = viewportEl.clientHeight;
    return { w: w || window.innerWidth, h: h || window.innerHeight };
}

function initThree() {
    viewportEl = document.getElementById('viewport');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050b1a);
    scene.fog = new THREE.FogExp2(0x050b1a, 0.006);

    const { w, h } = viewportSize();
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 500);
    camera.position.set(6, 5, 9);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    viewportEl.insertBefore(renderer.domElement, viewportEl.firstChild);

    labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(w, h);
    labelRenderer.domElement.className = 'particle-label-layer';
    viewportEl.appendChild(labelRenderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight(0x606080, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(5, 8, 4);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0x6688cc, 0.35);
    fill.position.set(-4, 2, -3);
    scene.add(fill);

    const grid = new THREE.GridHelper(24, 24, 0x334466, 0x1a2233);
    grid.position.y = -1.5;
    scene.add(grid);

    window.addEventListener('resize', () => {
        const { w: rw, h: rh } = viewportSize();
        camera.aspect = rw / rh;
        camera.updateProjectionMatrix();
        renderer.setSize(rw, rh);
        labelRenderer.setSize(rw, rh);
    });

    (function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
        updateLabelScales();
        labelRenderer.render(scene, camera);
    })();
}

function cleanupEventVisual() {
    if (!currentEventGroup) return;
    currentEventGroup.traverse(obj => {
        if (obj.isCSS2DObject && obj.element?.parentNode) obj.element.remove();
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material.dispose();
        }
    });
    scene.remove(currentEventGroup);
    currentEventGroup = null;
    hitTargets = [];
}

function momentumDirection(p) {
    const v = new THREE.Vector3(p.px, p.py, p.pz);
    if (v.lengthSq() < 1e-12) return new THREE.Vector3(0, 0, 1);
    return v.normalize();
}

function arrowLength(p, maxP) {
    const pMag = Math.hypot(p.px, p.py, p.pz);
    const ratio = maxP > 0 ? pMag / maxP : 0.5;
    return 0.5 + ratio * 1.8;
}

function buildChildrenMap(particles) {
    const map = new Map();
    const link = (mother, child) => {
        if (mother <= 0 || mother > particles.length) return;
        if (!map.has(mother)) map.set(mother, []);
        if (!map.get(mother).includes(child)) map.get(mother).push(child);
    };
    particles.forEach((p, i) => {
        const idx = i + 1;
        link(p.moth1, idx);
        if (p.moth2 > 0 && p.moth2 !== p.moth1) link(p.moth2, idx);
    });
    return map;
}

function findRootIndices(particles) {
    const incoming = new Set();
    particles.forEach((p, i) => { if (isIncoming(p)) incoming.add(i + 1); });

    const roots = [];
    particles.forEach((p, i) => {
        const idx = i + 1;
        if (isIncoming(p)) return;

        const mothers = [p.moth1, p.moth2].filter(m => m > 0);
        if (mothers.length === 0) {
            roots.push(idx);
            return;
        }
        if (mothers.every(m => incoming.has(m))) roots.push(idx);
    });
    return roots;
}

function hexColor(color) {
    return typeof color === 'string' ? new THREE.Color(color) : color;
}

function addSphereLabel(group, position, latex) {
    const div = document.createElement('div');
    div.className = 'particle-label';
    renderLatex(div, latex, true);
    const label = new CSS2DObject(div);
    label.position.copy(position);
    group.add(label);
}

function addIncomingBeam(group, start, dir, length, particle) {
    const end = start.clone().add(dir.clone().multiplyScalar(length));
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const line = new THREE.Line(geo, new THREE.LineDashedMaterial({
        color: 0x4ade80,
        dashSize: 0.2,
        gapSize: 0.14,
        transparent: true,
        opacity: 0.92,
    }));
    line.computeLineDistances();
    group.add(line);

    const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, length, 6),
        new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.copy(start.clone().add(dir.clone().multiplyScalar(length * 0.5)));
    hit.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    hit.userData.particle = particle;
    group.add(hit);
    hitTargets.push(hit);
}

function addParticleTrack(group, start, dir, length, color, particle, info) {
    const col = hexColor(color);
    const end = start.clone().add(dir.clone().multiplyScalar(length));
    const lineRadius = 0.016;
    const sphereRadius = 0.085;

    const trackMat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.3,
        metalness: 0.12,
        roughness: 0.5,
    });
    const track = new THREE.Mesh(
        new THREE.CylinderGeometry(lineRadius, lineRadius, length, 10),
        trackMat
    );
    track.position.copy(start.clone().add(dir.clone().multiplyScalar(length * 0.5)));
    track.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    group.add(track);

    const sphereMat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.45,
        metalness: 0.2,
        roughness: 0.4,
        transparent: true,
        opacity: 0.88,
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(sphereRadius, 18, 18), sphereMat);
    sphere.position.copy(end);
    sphere.userData.particle = particle;
    group.add(sphere);
    hitTargets.push(sphere);

    addSphereLabel(group, end, info.latex || info.name);
}

function renderEvent(particles) {
    cleanupEventVisual();
    if (!particles.length) return;

    const group = new THREE.Group();
    const origin = new THREE.Vector3(0, 0, 0);
    const childrenMap = buildChildrenMap(particles);
    const maxP = Math.max(...particles.map(p => Math.hypot(p.px, p.py, p.pz)), 1e-6);

    const endPoints = new Map();
    const drawn = new Set();

    // Incoming beams — thin green dashed lines, no endpoint sphere
    particles.forEach((p, i) => {
        if (!isIncoming(p)) return;
        const beamZ = p.pz >= 0 ? -3.4 : 3.4;
        const start = new THREE.Vector3(0, 0, beamZ);
        const dir = origin.clone().sub(start).normalize();
        const len = start.distanceTo(origin);
        addIncomingBeam(group, start, dir, len, p);
    });

    function drawBranch(particleIdx, startPos) {
        if (drawn.has(particleIdx)) return;
        const p = particles[particleIdx - 1];
        if (!p || isIncoming(p)) return;
        drawn.add(particleIdx);

        const dir = momentumDirection(p);
        const len = arrowLength(p, maxP);
        const info = getParticleInfo(p.idup);
        const end = startPos.clone().add(dir.clone().multiplyScalar(len));
        endPoints.set(particleIdx, end);

        addParticleTrack(group, startPos, dir, len, info.color, p, info);

        const childList = childrenMap.get(particleIdx) || [];
        for (const childIdx of childList) {
            if (isIncoming(particles[childIdx - 1])) continue;
            drawBranch(childIdx, end);
        }
    }

    const roots = findRootIndices(particles);
    for (const rootIdx of roots) drawBranch(rootIdx, origin);

    // Orphan outgoing lines (e.g. disconnected color-flow tags)
    particles.forEach((p, i) => {
        const idx = i + 1;
        if (isIncoming(p) || drawn.has(idx)) return;
        drawBranch(idx, origin);
    });

    currentEventGroup = group;
    scene.add(group);
}

function kinematicEta(p) {
    const pt = Math.hypot(p.px, p.py);
    if (pt < 1e-12) return p.pz >= 0 ? Infinity : -Infinity;
    return Math.asinh(p.pz / pt);
}

function kinematicPhi(p) {
    return Math.atan2(p.py, p.px);
}

// =============================================================================
// App state & UI
// =============================================================================

let sourceFile = null;
let eventOffsets = [];
let totalEvents = 0;
let currentEventNumber = 1;
let fileMeta = null;

const $ = id => document.getElementById(id);

function renderFileInfo() {
    const m = fileMeta;
    const lines = [
        `<span class="meta-row"><span class="meta-label">Generator:</span> ${m.generator}</span>`,
        `<span class="meta-row"><span class="meta-label">Process:</span> ${m.process}</span>`,
        `<span class="meta-row"><span class="meta-label">Cross section:</span> ${formatCrossSection(m.crossSection, m.crossSectionErr)}</span>`,
    ];
    if (m.beam1 != null) {
        lines.push(`<span class="meta-row"><span class="meta-label">Beams:</span> ${formatBeam(m.beam1)} × ${formatBeam(m.beam2)} @ ${m.energy1} / ${m.energy2} GeV</span>`);
    }
    lines.push(`<span class="meta-row"><span class="meta-label">PDF:</span> ${formatPdf(m.pdf1, m.pdfInfoText)} / ${formatPdf(m.pdf2, null)}</span>`);
    lines.push(`<span class="meta-row"><span class="meta-label">Events:</span> ${totalEvents.toLocaleString()}</span>`);
    $('fileInfo').innerHTML = lines.join('');
}

async function loadEventByNumber(eventNum) {
    if (!sourceFile || !eventOffsets.length) return false;
    if (eventNum < 1 || eventNum > totalEvents) return false;

    const { start, end } = eventOffsets[eventNum - 1];
    const text = await sourceFile.slice(start, end).text();
    const particles = parseEventBlock(text);

    renderEvent(particles);
    const outgoing = particles.filter(p => !isIncoming(p)).length;
    $('eventStats').textContent = `Event ${eventNum} of ${totalEvents} — ${particles.length} entries (${outgoing} outgoing)`;
    return true;
}

function setEventNumber(num) {
    if (!totalEvents) return;
    num = Math.min(totalEvents, Math.max(1, Math.trunc(num) || 1));
    if (num === currentEventNumber && currentEventGroup) return;
    currentEventNumber = num;
    $('eventNumberInput').value = num;
    loadEventByNumber(num);
}

async function handleFile(file) {
    $('warningMsg').textContent = '';
    $('fileName').textContent = file.name;

    if (file.name.endsWith('.gz') || file.name.endsWith('.lhe.gz')) {
        const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
        if (head[0] === 0x1f && head[1] === 0x8b) {
            $('warningMsg').textContent = 'Compressed .lhe.gz detected. Please gunzip the file and upload the raw .lhe file.';
            $('fileInfo').innerHTML = '<span class="status error">Cannot read gzip-compressed LHE directly.</span>';
            $('eventControlPanel').hidden = true;
            cleanupEventVisual();
            return;
        }
    }

    const headerText = await readHeader(file);
    const validation = validateLheStructure(headerText);
    if (!validation.ok) {
        $('fileInfo').innerHTML = `<span class="status error">${validation.reason}</span>`;
        $('eventControlPanel').hidden = true;
        return;
    }

    fileMeta = parseMetadata(headerText);
    eventOffsets = await buildEventIndex(file);
    totalEvents = eventOffsets.length;
    sourceFile = file;

    if (totalEvents === 0) {
        $('fileInfo').innerHTML = '<span class="status error">No parseable events found.</span>';
        $('eventControlPanel').hidden = true;
        return;
    }

    renderFileInfo();
    $('eventControlPanel').hidden = false;
    $('eventNumberInput').max = totalEvents;
    currentEventNumber = 1;
    $('eventNumberInput').value = 1;
    await loadEventByNumber(1);
}

// Tooltip
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tooltip = $('tooltip');
const tooltipName = $('tooltipName');
const tooltipPid = $('tooltipPid');
const tooltipBody = $('tooltipBody');

function formatCharge(q) {
    if (q == null) return '?';
    if (q === 0) return '0';
    return q > 0 ? `+${q}` : `${q}`;
}

function showParticleTooltip(p, info, clientX, clientY) {
    const pMag = Math.hypot(p.px, p.py, p.pz);
    const pt = Math.hypot(p.px, p.py);
    const eta = kinematicEta(p);
    const phi = kinematicPhi(p);
    const etaStr = Number.isFinite(eta) ? eta.toFixed(3) : (eta > 0 ? '+\\infty' : '-\\infty');

    renderLatex(tooltipName, info.latex || info.name, true);
    tooltipPid.textContent = `PID ${p.idup}  ·  Q = ${formatCharge(info.charge)}`;

    tooltipBody.innerHTML = '';
    const rows = [
        ['|{\\vec p}|', `${pMag.toFixed(3)}\\;\\mathrm{GeV}`],
        ['p_x', `${p.px.toFixed(3)}\\;\\mathrm{GeV}`],
        ['p_y', `${p.py.toFixed(3)}\\;\\mathrm{GeV}`],
        ['p_z', `${p.pz.toFixed(3)}\\;\\mathrm{GeV}`],
        ['p_T', `${pt.toFixed(3)}\\;\\mathrm{GeV}`],
        ['E', `${p.e.toFixed(3)}\\;\\mathrm{GeV}`],
        ['m', `${p.m.toFixed(4)}\\;\\mathrm{GeV}`],
        ['\\eta', etaStr],
        ['\\phi', `${phi.toFixed(3)}\\;\\mathrm{rad}`],
    ];
    for (const [label, value] of rows) {
        const lbl = document.createElement('span');
        lbl.className = 't-label';
        renderLatex(lbl, label);
        const val = document.createElement('span');
        val.className = 't-value';
        renderLatex(val, value);
        tooltipBody.appendChild(lbl);
        tooltipBody.appendChild(val);
    }

    tooltip.hidden = false;
    const rect = viewportEl.getBoundingClientRect();
    let left = clientX - rect.left + 16;
    let top = clientY - rect.top - 12;
    const tw = tooltip.offsetWidth || 220;
    const th = tooltip.offsetHeight || 180;
    if (left + tw > rect.width - 8) left = clientX - rect.left - tw - 16;
    if (top + th > rect.height - 8) top = rect.height - th - 8;
    if (top < 8) top = 8;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

window.addEventListener('mousemove', e => {
    if (!hitTargets.length) {
        tooltip.hidden = true;
        return;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(hitTargets);
    if (!hits.length) {
        tooltip.hidden = true;
        return;
    }
    const p = hits[0].object.userData.particle;
    showParticleTooltip(p, getParticleInfo(p.idup), e.clientX, e.clientY);
});

// Navigation
const homeOverlay = $('homeOverlay');

function showHome() {
    homeOverlay.hidden = false;
    $('navHome').classList.add('active');
    $('navViewer').classList.remove('active');
}

function showViewer() {
    homeOverlay.hidden = true;
    $('navHome').classList.remove('active');
    $('navViewer').classList.add('active');
}

$('navHome').addEventListener('click', e => { e.preventDefault(); showHome(); });
$('navViewer').addEventListener('click', e => { e.preventDefault(); showViewer(); });
$('closeHome').addEventListener('click', showViewer);
homeOverlay.addEventListener('click', e => { if (e.target === homeOverlay) showViewer(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') showViewer(); });

// UI bindings
$('uploadBtn').addEventListener('click', () => $('lheFileInput').click());
$('lheFileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleFile(file);
    e.target.value = '';
});
$('prevEventBtn').addEventListener('click', () => setEventNumber(currentEventNumber - 1));
$('nextEventBtn').addEventListener('click', () => setEventNumber(currentEventNumber + 1));
$('eventNumberInput').addEventListener('change', e => setEventNumber(parseInt(e.target.value, 10)));
$('eventNumberInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') setEventNumber(parseInt(e.target.value, 10));
});

initThree();
