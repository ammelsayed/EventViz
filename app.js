import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createLheHandler } from './lhe_handler.js';
import { createHepmcHandler } from './hepmc_handler.js';

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
    if (abs === 2112) return anti ? '#78909c': '#cfd8dc';
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

export function getParticleInfo(pid) {
    const info = pidMap.get(pid);
    if (info) return info;
    return { name: 'unknown', latex: '\\mathrm{unknown}', charge: null, color: particleColor(pid) };
}

export function renderLatex(el, tex, displayMode = false) {
    if (typeof katex !== 'undefined') {
        katex.render(tex, el, { throwOnError: false, displayMode });
    } else {
        el.textContent = tex;
    }
}

export function parseFortranFloat(s) {
    return parseFloat(String(s).replace(/[dD](?=[+-]?\d)/, 'E'));
}

export function parseNumericLine(line) {
    return line.trim().split(/\s+/).map(parseFortranFloat);
}

export function isIncoming(p) {
    return p.istup < 0;
}

export const BEAM_NAMES = {
    2212: 'p', [-2212]: 'p̄',
    11: 'e⁻', [-11]: 'e⁺',
    13: 'μ⁻', [-13]: 'μ⁺',
    22: 'γ', 9000001: 'd', 9000002: 'u',
};

export function formatBeam(id) {
    return BEAM_NAMES[id] ? `${BEAM_NAMES[id]} (${id})` : `PID ${id}`;
}

export function formatPdf(pdf, fallback) {
    if (fallback) return fallback;
    if (!pdf) return 'N/A';
    if (pdf.group === 0 && pdf.set === 0) return 'built-in / sum-of-weights';
    return `LHAPDF group ${pdf.group}, set ${pdf.set}`;
}

export function formatCrossSection(xsec, err) {
    if (xsec == null || Number.isNaN(xsec)) return 'N/A';
    const val = xsec.toExponential(4);
    if (err != null && !Number.isNaN(err)) return `${val} ± ${err.toExponential(2)} pb`;
    return `${val} pb`;
}

export function kinematicEta(p) {
    const pt = Math.hypot(p.px, p.py);
    if (pt < 1e-12) return p.pz >= 0 ? Infinity : -Infinity;
    return Math.asinh(p.pz / pt);
}

export function kinematicPhi(p) {
    return Math.atan2(p.py, p.px);
}

// =============================================================================
// Three.js visualization (shared by LHE and HepMC)
// =============================================================================

let scene, camera, renderer, labelRenderer, controls, viewportEl;
let currentEventGroup = null;
let coordinateAxesGroup = null;
let hitTargets = [];
const _labelWorldPos = new THREE.Vector3();
let currentView = '3d';
let showAxes = false;
let showKinematics = false;
let showParticleCoords = false;

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

function addAxisLabel(group, position, text, color, fontSize = '14px') {
    const div = document.createElement('div');
    div.style.color = color;
    div.style.fontWeight = '500';
    div.style.fontSize = fontSize;
    div.style.opacity = '0.95';
    div.style.textShadow = '0 0 6px rgba(0,0,0,1)';
    div.textContent = text;
    const label = new CSS2DObject(div);
    label.position.copy(position);
    group.add(label);
}

function buildCoordinateAxes() {
    if (coordinateAxesGroup) {
        scene.remove(coordinateAxesGroup);
        coordinateAxesGroup.traverse(obj => {
            if (obj.isCSS2DObject && obj.element?.parentNode) obj.element.remove();
        });
    }
    
    if (!showAxes) {
        return;
    }
    
    const axisLength = 6;
    coordinateAxesGroup = new THREE.Group();
    // Reset axes position to origin before shifting

    if (currentView === '3d') {
        // Z-axis (beam direction, blue)
        const zMat = new THREE.LineBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.5 });
        const zPoints = [new THREE.Vector3(0, 0, -axisLength), new THREE.Vector3(0, 0, axisLength)];
        const zLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(zPoints), zMat);
        coordinateAxesGroup.add(zLine);
        
        // X-axis (towards LHC ring center, red)
        const xMat = new THREE.LineBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.5 });
        const xPoints = [new THREE.Vector3(-axisLength, 0, 0), new THREE.Vector3(axisLength, 0, 0)];
        const xLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(xPoints), xMat);
        coordinateAxesGroup.add(xLine);
        
        // Y-axis (upwards, green)
        const yMat = new THREE.LineBasicMaterial({ color: 0x44ff44, transparent: true, opacity: 0.5 });
        const yPoints = [new THREE.Vector3(0, -axisLength, 0), new THREE.Vector3(0, axisLength, 0)];
        const yLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(yPoints), yMat);
        coordinateAxesGroup.add(yLine);
        
        addAxisLabel(coordinateAxesGroup, new THREE.Vector3(axisLength + 0.6, 0, 0), '+x (towards LHC ring center)', '#ff4444');
        addAxisLabel(coordinateAxesGroup, new THREE.Vector3(0, axisLength + 0.6, 0), '+y (up)', '#44ff44');
        addAxisLabel(coordinateAxesGroup, new THREE.Vector3(0, 0, axisLength + 0.6), '+z (beam)', '#4488ff');
        addAxisLabel(coordinateAxesGroup, new THREE.Vector3(0, 0, -axisLength - 0.6), '-z', '#4488ff');
    } else if (currentView === 'transverse') {
        // X-axis (red)
        const xMat = new THREE.LineBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.6 });
        const xPoints = [new THREE.Vector3(-axisLength, 0, 0), new THREE.Vector3(axisLength, 0, 0)];
        const xLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(xPoints), xMat);
        coordinateAxesGroup.add(xLine);
        
        // Y-axis (green)
        const yMat = new THREE.LineBasicMaterial({ color: 0x44ff44, transparent: true, opacity: 0.6 });
        const yPoints = [new THREE.Vector3(0, -axisLength, 0), new THREE.Vector3(0, axisLength, 0)];
        const yLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(yPoints), yMat);
        coordinateAxesGroup.add(yLine);
        
        addAxisLabel(coordinateAxesGroup, new THREE.Vector3(axisLength + 0.6, 0, 0), '+x', '#ff4444');
        addAxisLabel(coordinateAxesGroup, new THREE.Vector3(0, axisLength + 0.6, 0), '+y', '#44ff44');
    } else if (currentView === 'longitudinal') {
        // Z-axis (blue, beam)
        const zMat = new THREE.LineBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.6 });
        const zPoints = [new THREE.Vector3(0, 0, -axisLength), new THREE.Vector3(0, 0, axisLength)];
        const zLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(zPoints), zMat);
        coordinateAxesGroup.add(zLine);
        
        // Y-axis (green)
        const yMat = new THREE.LineBasicMaterial({ color: 0x44ff44, transparent: true, opacity: 0.6 });
        const yPoints = [new THREE.Vector3(0, -axisLength, 0), new THREE.Vector3(0, axisLength, 0)];
        const yLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(yPoints), yMat);
        coordinateAxesGroup.add(yLine);
        
        addAxisLabel(coordinateAxesGroup, new THREE.Vector3(0, axisLength + 0.6, 0), '+y (up)', '#44ff44');
        addAxisLabel(coordinateAxesGroup, new THREE.Vector3(0, 0, axisLength + 0.6), '+z (beam)', '#4488ff');
        addAxisLabel(coordinateAxesGroup, new THREE.Vector3(0, 0, -axisLength - 0.6), '-z', '#4488ff');
    }
    
    scene.add(coordinateAxesGroup);
}

function setViewCamera(view) {
    currentView = view;
    const distance = 12;
    
    if (view === '3d') {
        camera.position.set(6, 5, 9);
        camera.up.set(0, 1, 0);
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
    } else if (view === 'transverse') {
        camera.position.set(0, 0, distance);
        camera.up.set(0, 1, 0);
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
    } else if (view === 'longitudinal') {
        camera.position.set(-distance, 0, 0);  // Look along negative x-axis to get z-y plane
        camera.up.set(0, 1, 0);
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
    }
    
    buildCoordinateAxes();
    if (activeHandler?.hasVisual()) {
        loadEventByNumber(currentEventNumber);
    }
}

export function initThree() {
    viewportEl = document.getElementById('viewport');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050b1a);
    scene.fog = new THREE.FogExp2(0x050b1a, 0.006);

    const { w, h } = viewportSize();
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 500);

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

    setViewCamera('3d');

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

export function getRenderer() {
    return renderer;
}

export function cleanupEventVisual() {
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
    
    // Also clean up coordinate axes
    if (coordinateAxesGroup) {
        coordinateAxesGroup.traverse(obj => {
            if (obj.isCSS2DObject && obj.element?.parentNode) obj.element.remove();
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
        scene.remove(coordinateAxesGroup);
        coordinateAxesGroup = null;
    }
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




function deltaPhi(phi1, phi2) {
    let dphi = phi1 - phi2;
    while (dphi > Math.PI) dphi -= 2 * Math.PI;
    while (dphi < -Math.PI) dphi += 2 * Math.PI;
    return Math.abs(dphi);
}



function calculatePt(particle) {
    return Math.hypot(particle.px, particle.py);
}

function calculatePhi(particle) {
    return Math.atan2(particle.py, particle.px);
}

function addParticleTrack(group, start, dir, length, color, particle, info, lineRadius = 0.016, sphereRadius = 0.085, arrowLength = 0.15, arrowRadius = 0.04) {
    const col = hexColor(color);
    const end = start.clone().add(dir.clone().multiplyScalar(length));

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

    const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(arrowRadius, arrowLength, 12),
        trackMat
    );
    arrow.position.copy(end.clone().sub(dir.clone().multiplyScalar(arrowLength * 0.5)));
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    group.add(arrow);

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

    // Keep particle name label on the sphere
    addSphereLabel(group, end, info.latex || info.name);
    
    if (showParticleCoords) {
        // Add compact, stacked (pT, phi, eta) label with units, on the left
        const pT = calculatePt(particle);
        const phi = calculatePhi(particle);
        const eta = kinematicEta(particle);
        const kinematicsDiv = document.createElement('div');
        kinematicsDiv.style.color = '#94a3b8';
        kinematicsDiv.style.fontSize = '9px';
        kinematicsDiv.style.fontFamily = 'Consolas, monospace';
        kinematicsDiv.style.textShadow = '0 0 3px rgba(0,0,0,1)';
        kinematicsDiv.style.background = 'rgba(5,11,26,0.9)';
        kinematicsDiv.style.padding = '2px 4px';
        kinematicsDiv.style.borderRadius = '3px';
        kinematicsDiv.style.lineHeight = '1.2';
        kinematicsDiv.style.display = 'flex';
        kinematicsDiv.style.flexDirection = 'column';
        kinematicsDiv.style.alignItems = 'flex-start';
        
        // Create stacked spans
        const ptSpan = document.createElement('span');
        ptSpan.textContent = `pT: ${pT.toFixed(2)} GeV`;
        
        const phiSpan = document.createElement('span');
        phiSpan.textContent = `φ: ${phi.toFixed(3)}`;
        
        const etaSpan = document.createElement('span');
        etaSpan.textContent = `η: ${eta.toFixed(3)}`;
        
        kinematicsDiv.appendChild(ptSpan);
        kinematicsDiv.appendChild(phiSpan);
        kinematicsDiv.appendChild(etaSpan);
        
        const kinematicsLabel = new CSS2DObject(kinematicsDiv);
                    // Position labels so they don't cover the particle name
                    if (currentView === 'transverse') {
                        kinematicsLabel.position.copy(end.clone().add(new THREE.Vector3(-0.15, 0, 0)));
                    } else if (currentView === 'longitudinal') {
                        kinematicsLabel.position.copy(end.clone().add(new THREE.Vector3(0, 0.15, 0))); // above particle in y-z plane
                    } else { // 3D view
                        kinematicsLabel.position.copy(end.clone().add(new THREE.Vector3(-0.15, 0, 0)));
                    }
        group.add(kinematicsLabel);
    }
}

function calculateTheta(particle) {
    const pT = calculatePt(particle);
    const pz = particle.pz;
    return Math.atan2(pT, pz);
}

function calculateDeltaR(particle1, particle2) {
    const dphi = deltaPhi(calculatePhi(particle1), calculatePhi(particle2));
    const deta = kinematicEta(particle1) - kinematicEta(particle2);
    return Math.sqrt(dphi * dphi + deta * deta);
}

function addDeltaArcs(group, daughterPairs, decayVertices, view, roots, origin) {
    if (!showKinematics) return;

    for (const { motherIdx, daughters } of daughterPairs) {
        const vertex = decayVertices.get(motherIdx);
        if (!vertex) continue;
        
        // Get all pairwise combinations of daughters
        for (let i = 0; i < daughters.length; i++) {
            for (let j = i + 1; j < daughters.length; j++) {
                const d1 = daughters[i];
                const d2 = daughters[j];
                
                let labelText;
                
                if (view === '3d') {
                    // Calculate ΔR for 3D view
                    const deltaR = calculateDeltaR(d1.p, d2.p);
                    labelText = `ΔR = ${deltaR.toFixed(3)}`;
                } else if (view === 'transverse') {
                    // Calculate Δφ for transverse view
                    const angle1 = Math.atan2(d1.p.py, d1.p.px);
                    const angle2 = Math.atan2(d2.p.py, d2.p.px);
                    const delta = deltaPhi(angle1, angle2);
                    labelText = `Δφ = ${delta.toFixed(3)}`;
                } else { // longitudinal
                    // Calculate both Δη and Δθ for longitudinal view
                    const eta1 = kinematicEta(d1.p);
                    const eta2 = kinematicEta(d2.p);
                    const deta = Math.abs(eta1 - eta2);
                    const theta1 = calculateTheta(d1.p);
                    const theta2 = calculateTheta(d2.p);
                    let dtheta = Math.abs(theta1 - theta2);
                    if (dtheta > Math.PI) dtheta = 2 * Math.PI - dtheta;
                    labelText = `Δη = ${deta.toFixed(3)}\nΔθ = ${dtheta.toFixed(3)}`;
                }
                
                // For 3D, let's just add a label at the vertex since drawing an arc in 3D is tricky
                if (view === '3d') {
                    const labelDiv = document.createElement('div');
                    labelDiv.style.color = '#66d9e8';
                    labelDiv.style.fontWeight = 'bold';
                    labelDiv.style.fontSize = '12px';
                    labelDiv.style.textShadow = '0 0 5px rgba(0,0,0,1)';
                    labelDiv.style.background = 'rgba(5,11,26,0.8)';
                    labelDiv.style.padding = '3px 6px';
                    labelDiv.style.borderRadius = '4px';
                    labelDiv.style.whiteSpace = 'pre-line'; // for newlines
                    labelDiv.textContent = labelText;
                    const label = new CSS2DObject(labelDiv);
                    label.position.copy(vertex.clone().add(new THREE.Vector3(0, 0.2, 0)));
                    group.add(label);
                } else {
                    let angle1, angle2;
                    if (view === 'transverse') {
                        angle1 = Math.atan2(d1.p.py, d1.p.px);
                        angle2 = Math.atan2(d2.p.py, d2.p.px);
                    } else {
                        // For longitudinal view: angle based on z (beam) and y axes
                        angle1 = Math.atan2(d1.p.py, d1.p.pz); // theta in y-z plane
                        angle2 = Math.atan2(d2.p.py, d2.p.pz);
                    }
                    
                    // Draw arc centered at decay vertex
                    const arcRadius = 0.6; // Smaller for decay vertices
                    const arcPoints = [];
                    const steps = 40;
                    
                    let startAngle = Math.min(angle1, angle2);
                    let endAngle = Math.max(angle1, angle2);
                    if (endAngle - startAngle > Math.PI) {
                        [startAngle, endAngle] = [endAngle, startAngle];
                        startAngle -= 2 * Math.PI;
                    }
                    
                    for (let s = 0; s <= steps; s++) {
                        const t = startAngle + (endAngle - startAngle) * (s / steps);
                        if (view === 'transverse') {
                            arcPoints.push(
                                new THREE.Vector3(
                                    vertex.x + Math.cos(t) * arcRadius,
                                    vertex.y + Math.sin(t) * arcRadius,
                                    vertex.z
                                )
                            );
                        } else {
                            // Longitudinal: y-z plane
                            arcPoints.push(
                                new THREE.Vector3(
                                    vertex.x,
                                    vertex.y + Math.sin(t) * arcRadius,
                                    vertex.z + Math.cos(t) * arcRadius
                                )
                            );
                        }
                    }
                    
                    const arcMat = new THREE.LineBasicMaterial({
                        color: 0x66d9e8,
                        transparent: true,
                        opacity: 0.7
                    });
                    const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
                    const arc = new THREE.Line(arcGeo, arcMat);
                    group.add(arc);
                    
                    // Add label
                    const midAngle = (startAngle + endAngle) / 2;
                    const labelOffset = arcRadius + 0.2;
                    let labelPos;
                    if (view === 'transverse') {
                        labelPos = new THREE.Vector3(
                            vertex.x + Math.cos(midAngle) * labelOffset,
                            vertex.y + Math.sin(midAngle) * labelOffset,
                            vertex.z
                        );
                    } else {
                        labelPos = new THREE.Vector3(
                            vertex.x,
                            vertex.y + Math.sin(midAngle) * labelOffset,
                            vertex.z + Math.cos(midAngle) * labelOffset
                        );
                    }
                    
                    const dLabelDiv = document.createElement('div');
                    dLabelDiv.style.color = '#66d9e8';
                    dLabelDiv.style.fontWeight = 'bold';
                    dLabelDiv.style.fontSize = '12px';
                    dLabelDiv.style.textShadow = '0 0 5px rgba(0,0,0,1)';
                    dLabelDiv.style.background = 'rgba(5,11,26,0.8)';
                    dLabelDiv.style.padding = '3px 6px';
                    dLabelDiv.style.borderRadius = '4px';
                    dLabelDiv.style.whiteSpace = 'pre-line';
                    dLabelDiv.textContent = labelText;
                    const dLabel = new CSS2DObject(dLabelDiv);
                    dLabel.position.copy(labelPos);
                    group.add(dLabel);
                }
            }
        }
    }
}

export function renderEvent(particles) {
    cleanupEventVisual();
    if (!particles.length) return;

    const group = new THREE.Group();
    const origin = new THREE.Vector3(0, 0, 0);
    const childrenMap = buildChildrenMap(particles);
    const maxP = Math.max(...particles.map(p => Math.hypot(p.px, p.py, p.pz)), 1e-6);
    const maxPt = Math.max(...particles.map(p => Math.hypot(p.px, p.py)), 1e-6);

    const drawn = new Set();
    const finalStateParticles = [];
    const roots = findRootIndices(particles);
    
    // Track decay vertices and direct daughters
    const decayVertices = new Map(); // key: particleIdx, value: position
    const daughterPairs = []; // Array of { motherIdx, daughters: [{ p, info, endPos }] }
    const allParticlePositions = []; // Collect all particle sphere positions for centering
    
    // Add initial collision particles as a daughter pair with mother at origin
    if (roots.length >= 2) {
        const initialDaughters = roots.map(idx => ({
            p: particles[idx - 1],
            info: getParticleInfo(particles[idx - 1].idup)
        }));
        daughterPairs.push({ motherIdx: 0, daughters: initialDaughters });
        decayVertices.set(0, origin.clone());
    }

    if (currentView === '3d') {
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

            addParticleTrack(group, startPos, dir, len, info.color, p, info);

            // Collect particle position for centering
            allParticlePositions.push(end.clone());
            
            const childList = childrenMap.get(particleIdx) || [];
            const hasOutgoingDaughters = childList.some(idx => !isIncoming(particles[idx - 1]));
            
            // Track decay vertex and daughters
            if (hasOutgoingDaughters && childList.length >= 2) {
                const daughters = [];
                decayVertices.set(particleIdx, end.clone());
                for (const childIdx of childList) {
                    if (isIncoming(particles[childIdx - 1])) continue;
                    daughters.push({ 
                        p: particles[childIdx - 1], 
                        info: getParticleInfo(particles[childIdx - 1].idup) 
                    });
                }
                if (daughters.length >= 2) {
                    daughterPairs.push({ motherIdx: particleIdx, daughters });
                }
            }
            
            if (!hasOutgoingDaughters) {
                finalStateParticles.push({ p, info, idx: particleIdx });
            }

            for (const childIdx of childList) {
                if (isIncoming(particles[childIdx - 1])) continue;
                drawBranch(childIdx, end);
            }
        }

        for (const rootIdx of roots) drawBranch(rootIdx, origin);

        particles.forEach((p, i) => {
            const idx = i + 1;
            if (isIncoming(p) || drawn.has(idx)) return;
            drawBranch(idx, origin);
        });
        
        // Add delta R labels for 3D view
        addDeltaArcs(group, daughterPairs, decayVertices, currentView, roots, origin);
    } else {
        const finalProjs = [];

        function draw2DBranch(particleIdx, startPos) {
            if (drawn.has(particleIdx)) return;
            const p = particles[particleIdx - 1];
            if (!p || isIncoming(p)) return;
            drawn.add(particleIdx);

            const info = getParticleInfo(p.idup);
            let px, py, pz;
            let lengthScale;
            let endPosition;
            const scaleFactor = 0.25; // Even shorter arrows
            
            if (currentView === 'transverse') {
                px = p.px;
                py = p.py;
                pz = 0;
                const pt = Math.hypot(px, py);
                lengthScale = scaleFactor + (pt / maxPt) * 1.0;
                const dir = new THREE.Vector3(px, py, 0).normalize();
                endPosition = startPos.clone().add(dir.clone().multiplyScalar(lengthScale));
            } else { // longitudinal
                px = 0;
                py = p.py;
                pz = p.pz;
                const pl = Math.hypot(py, pz);
                lengthScale = scaleFactor + (pl / maxPt) * 1.0;
                const dir = new THREE.Vector3(0, py, pz).normalize();
                endPosition = startPos.clone().add(dir.clone().multiplyScalar(lengthScale));
            }
            
            // Now draw the particle track with thick cylinder, arrow, sphere, and tooltip!
            const dirVec = new THREE.Vector3(px, py, pz).normalize();
            addParticleTrack(group, startPos, dirVec, lengthScale, info.color, p, info, 
                0.03, // Thicker line
                0.12, // Thicker sphere
                0.18, // Longer arrow
                0.06  // Thicker arrow
            );
            
            // Collect particle position for centering
            allParticlePositions.push(endPosition.clone());
            
            const childList = childrenMap.get(particleIdx) || [];
            const hasOutgoingDaughters = childList.some(idx => !isIncoming(particles[idx - 1]));
            
            // Track decay vertex and daughters
            if (hasOutgoingDaughters && childList.length >= 2) {
                const daughters = [];
                decayVertices.set(particleIdx, endPosition.clone());
                for (const childIdx of childList) {
                    if (isIncoming(particles[childIdx - 1])) continue;
                    daughters.push({ 
                        p: particles[childIdx - 1], 
                        info: getParticleInfo(particles[childIdx - 1].idup) 
                    });
                }
                if (daughters.length >= 2) {
                    daughterPairs.push({ motherIdx: particleIdx, daughters });
                }
            }
            
            if (!hasOutgoingDaughters) {
                finalStateParticles.push({ p, info, idx: particleIdx });
                finalProjs.push({ p, info, idx: particleIdx, px, py, endPos: endPosition });
            }
            
            for (const childIdx of childList) {
                if (isIncoming(particles[childIdx - 1])) continue;
                draw2DBranch(childIdx, endPosition);
            }
        }

        for (const rootIdx of roots) draw2DBranch(rootIdx, origin);

        particles.forEach((p, i) => {
            const idx = i + 1;
            if (isIncoming(p) || drawn.has(idx)) return;
            draw2DBranch(idx, origin);
        });

        // Add MET only in transverse view
        if (currentView === 'transverse') {
            let metX = 0, metY = 0;
            finalStateParticles.forEach(({ p }) => {
                metX -= p.px;
                metY -= p.py;
            });
            
            const met = Math.hypot(metX, metY);
            
            if (met > 1e-3) {
                const metVec = new THREE.Vector3(metX, metY, 0);
                const metDir = metVec.clone().normalize();
                const metLen = 0.3 + (met / maxPt) * 1.2;
                const metEnd = origin.clone().add(metDir.clone().multiplyScalar(metLen));
                
                // Draw MET track with dashed line
                const metGeo = new THREE.CylinderGeometry(0.03, 0.03, metLen, 12);
                const metMat = new THREE.MeshStandardMaterial({
                    color: 0xff6b6b,
                    emissive: 0xff6b6b,
                    emissiveIntensity: 0.3,
                    metalness: 0.12,
                    roughness: 0.5
                });
                const metTrack = new THREE.Mesh(metGeo, metMat);
                metTrack.position.copy(origin.clone().add(metDir.clone().multiplyScalar(metLen / 2)));
                metTrack.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), metDir);
                group.add(metTrack);
                
                // Dashed line to indicate MET
                const dashedMat = new THREE.LineDashedMaterial({
                    color: 0xff6b6b,
                    dashSize: 0.1,
                    gapSize: 0.1,
                    transparent: true,
                    opacity: 0.6
                });
                const dashedGeo = new THREE.BufferGeometry().setFromPoints([origin, metEnd]);
                const dashedLine = new THREE.Line(dashedGeo, dashedMat);
                dashedLine.computeLineDistances();
                group.add(dashedLine);
                
                // MET arrow
                const metArrowGeom = new THREE.ConeGeometry(0.06, 0.18, 12);
                const metArrow = new THREE.Mesh(metArrowGeom, metMat);
                metArrow.position.copy(metEnd.clone().sub(metDir.clone().multiplyScalar(0.09)));
                metArrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), metDir);
                group.add(metArrow);
                
                // MET label
                const metDiv = document.createElement('div');
                metDiv.style.color = '#ff6b6b';
                metDiv.style.fontWeight = 'bold';
                metDiv.style.fontSize = '13px';
                metDiv.style.textShadow = '0 0 5px rgba(0,0,0,1)';
                metDiv.style.background = 'rgba(5,11,26,0.85)';
                metDiv.style.padding = '4px 8px';
                metDiv.style.borderRadius = '6px';
                metDiv.textContent = `p_{T}^{miss} = ${met.toFixed(2)} GeV`;
                const metLabel = new CSS2DObject(metDiv);
                metLabel.position.copy(metEnd.clone().add(new THREE.Vector3(0, 0.2, 0)));
                group.add(metLabel);
            }
        }
        
        // Add Δφ or Δη arcs
    addDeltaArcs(group, daughterPairs, decayVertices, currentView, roots, origin);
    }

    // First build coordinate axes (so it exists before centering)
    buildCoordinateAxes();

    // Calculate center of all particle positions and shift both event and axes to center the view
    if (allParticlePositions.length > 0) {
        const center = new THREE.Vector3(0, 0, 0);
        allParticlePositions.forEach(pos => center.add(pos));
        center.divideScalar(allParticlePositions.length);
        // Shift everything by negative of the center
        group.position.sub(center);
        // Also shift coordinate axes to follow the event (since it's now built)
        if (coordinateAxesGroup) {
            coordinateAxesGroup.position.sub(center);
        }
        // Also adjust decay vertices for delta arcs (only for 2D views, since 3D delta is label only)
        if (currentView !== '3d') {
            decayVertices.forEach((pos, key) => {
                pos.sub(center);
            });
        }
    }

    currentEventGroup = group;
    scene.add(group);
}

// =============================================================================
// File type detection
// =============================================================================

export function detectFileType(file, headText = '') {
    const name = file.name.toLowerCase();
    if (name.endsWith('.hepmc') || name.endsWith('.hepmc.gz')) return 'hepmc';
    if (name.endsWith('.lhe') || name.endsWith('.lhe.gz') || name.endsWith('.gz')) return 'lhe';
    if (headText.includes('HepMC::') || headText.startsWith('E ')) return 'hepmc';
    if (headText.includes('<event>')) return 'lhe';
    return null;
}

// =============================================================================
// App state & UI
// =============================================================================

const $ = id => document.getElementById(id);

let activeHandler = null;
let currentEventNumber = 1;

const handlerDeps = { $, renderEvent, cleanupEventVisual, formatBeam, formatPdf, formatCrossSection };
const lheHandler = createLheHandler(handlerDeps);
const hepmcHandler = createHepmcHandler(handlerDeps);

function renderFileInfo() {
    if (!activeHandler) return;
    $('fileInfo').innerHTML = activeHandler.renderFileInfoHtml();
}

async function loadEventByNumber(eventNum) {
    if (!activeHandler) return false;
    return activeHandler.loadEventByNumber(eventNum);
}

function setEventNumber(num) {
    if (!activeHandler?.getTotalEvents()) return;
    const total = activeHandler.getTotalEvents();
    num = Math.min(total, Math.max(1, Math.trunc(num) || 1));
    if (num === currentEventNumber && activeHandler.hasVisual()) return;
    currentEventNumber = num;
    $('eventNumberInput').value = num;
    loadEventByNumber(num);
}

// Progress UI helpers
function showProgress() {
    $('uploadProgress').style.display = 'flex';
    updateProgress(0);
}

function hideProgress() {
    $('uploadProgress').style.display = 'none';
}

function updateProgress(percent, label = null) {
    $('progressFill').style.width = `${percent}%`;
    $('progressText').textContent = `${Math.round(percent)}%`;
    if (label) {
        $('progressLabel').textContent = label;
    }
}

async function handleFile(file, isBuiltIn = false) {
    $('warningMsg').textContent = '';
    $('fileName').textContent = file.name;
    showProgress();

    const headSize = Math.min(file.size, 8192);
    const headText = await file.slice(0, headSize).text();
    updateProgress(5);

    if (file.name.endsWith('.gz') || file.name.endsWith('.lhe.gz') || file.name.endsWith('.hepmc.gz')) {
        const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
        if (head[0] === 0x1f && head[1] === 0x8b) {
            $('warningMsg').textContent = 'Compressed file detected. Please gunzip and upload the raw file.';
            $('fileInfo').innerHTML = '<span class="status error">Cannot read gzip-compressed files directly.</span>';
            $('eventControlPanel').hidden = true;
            cleanupEventVisual();
            activeHandler = null;
            hideProgress();
            return;
        }
    }

    const fileType = detectFileType(file, headText);
    if (!fileType) {
        $('fileInfo').innerHTML = '<span class="status error">Unrecognized file format. Expected .lhe or HepMC.</span>';
        $('eventControlPanel').hidden = true;
        cleanupEventVisual();
        activeHandler = null;
        hideProgress();
        return;
    }

    activeHandler = fileType === 'hepmc' ? hepmcHandler : lheHandler;
    const ok = await activeHandler.loadFile(file, updateProgress);

    if (!ok) {
        $('eventControlPanel').hidden = true;
        hideProgress();
        return;
    }

    renderFileInfo();
    $('eventControlPanel').hidden = false;
    $('eventNumberInput').max = activeHandler.getTotalEvents();
    currentEventNumber = 1;
    $('eventNumberInput').value = 1;
    await loadEventByNumber(1);

    hideProgress();
    if (!isBuiltIn) addUserLoadedSample(file, fileType);
}

// =============================================================================
// Samples management
// =============================================================================

let builtInSamples = [];
let userLoadedSamples = [];

async function loadBuiltInSamples() {
    try {
        const response = await fetch('samples/samples.json');
        if (!response.ok) throw new Error('Failed to load samples manifest');
        builtInSamples = await response.json();
    } catch (e) {
        console.warn('Could not load built-in samples:', e.message);
        builtInSamples = [];
    }
    if (builtInSamples.length > 0) {
        renderSamplesList();
        $('samplesPanel').hidden = false;
    }
}

function sampleTypeLabel(type) {
    if (type === 'hepmc') return 'HEPMC';
    return 'LHE';
}

function renderSamplesList() {
    const container = $('samplesList');
    container.innerHTML = '';

    const hasBuiltIn = builtInSamples.length > 0;
    const hasUserLoaded = userLoadedSamples.length > 0;

    if (!hasBuiltIn && !hasUserLoaded) {
        $('samplesPanel').hidden = true;
        return;
    }

    $('samplesPanel').hidden = false;

    for (const sample of builtInSamples) {
        const type = sample.type || (sample.filename.endsWith('.hepmc') ? 'hepmc' : 'lhe');
        const item = document.createElement('div');
        item.className = 'sample-item builtin';
        item.innerHTML = `
            <span>${sample.name}</span>
            <span class="sample-badge">${sampleTypeLabel(type)}</span>
        `;
        item.addEventListener('click', () => loadSampleByPath(`samples/${sample.filename}`));
        container.appendChild(item);
    }

    for (const sample of userLoadedSamples) {
        const item = document.createElement('div');
        item.className = 'sample-item user-loaded';
        item.innerHTML = `
            <span>${sample.name}</span>
            <span class="sample-badge">${sampleTypeLabel(sample.type)}</span>
        `;
        item.addEventListener('click', () => loadSampleFromFile(sample));
        container.appendChild(item);
    }
}

async function loadSampleByPath(filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error('Failed to load sample file');
        const blob = await response.blob();
        const file = new File([blob], filePath.split('/').pop(), { type: 'text/plain' });
        await handleFile(file, true);
    } catch (e) {
        $('fileInfo').innerHTML = `<span class="status error">Failed to load sample: ${e.message}</span>`;
    }
}

async function loadSampleFromFile(sample) {
    if (sample.fileObject) {
        await handleFile(sample.fileObject);
    }
}

function addUserLoadedSample(file, fileType) {
    const sampleName = file.name.replace(/\.(lhe|hepmc)(\.gz)?$/i, '').replace(/\.gz$/, '');
    const existingIndex = userLoadedSamples.findIndex(s => s.name === sampleName);

    const entry = { name: sampleName, fileObject: file, type: fileType };
    if (existingIndex !== -1) {
        userLoadedSamples[existingIndex] = entry;
    } else {
        userLoadedSamples.push(entry);
    }

    renderSamplesList();
}

// =============================================================================
// Tooltip
// =============================================================================

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
    const theta = calculateTheta(p);
    const etaStr = Number.isFinite(eta) ? eta.toFixed(3) : (eta > 0 ? '+\\infty' : '-\\infty');

    renderLatex(tooltipName, info.latex || info.name, true);
    tooltipPid.textContent = `PID ${p.idup}  ·  Q = ${formatCharge(info.charge)}`;

    tooltipBody.innerHTML = '';
    const thetaDeg = theta * (180 / Math.PI);
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
        ['\\theta', `${theta.toFixed(3)}\\;\\mathrm{rad}\\;(${thetaDeg.toFixed(1)}°)`],
        ['\\cos\\theta', `${Math.cos(theta).toFixed(4)}`],
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
    const renderer = getRenderer();
    if (!renderer || !hitTargets.length) {
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

function setViewButtonState(activeBtnId) {
    ['view3dBtn', 'viewTransverseBtn', 'viewLongitudinalBtn'].forEach(id => {
        const btn = $(id);
        btn.classList.toggle('active', id === activeBtnId);
    });
}

function updateVisualization() {
    buildCoordinateAxes();
    if (activeHandler?.hasVisual()) {
        loadEventByNumber(currentEventNumber);
    }
}

function initUi() {
    $('navHome').addEventListener('click', e => { e.preventDefault(); showHome(); });
    $('navViewer').addEventListener('click', e => { e.preventDefault(); showViewer(); });
    $('closeHome').addEventListener('click', showViewer);
    homeOverlay.addEventListener('click', e => { if (e.target === homeOverlay) showViewer(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') showViewer(); });

    $('uploadBtn').addEventListener('click', () => $('eventFileInput').click());
    $('eventFileInput').addEventListener('change', e => {
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

    $('view3dBtn').addEventListener('click', () => {
        setViewButtonState('view3dBtn');
        setViewCamera('3d');
    });
    $('viewTransverseBtn').addEventListener('click', () => {
        setViewButtonState('viewTransverseBtn');
        setViewCamera('transverse');
    });
    $('viewLongitudinalBtn').addEventListener('click', () => {
        setViewButtonState('viewLongitudinalBtn');
        setViewCamera('longitudinal');
    });

    // Add event listeners for the new checkboxes
    $('showAxesCheckbox').addEventListener('change', (e) => {
        showAxes = e.target.checked;
        updateVisualization();
    });

    $('showKinematicsCheckbox').addEventListener('change', (e) => {
        showKinematics = e.target.checked;
        updateVisualization();
    });
    
    $('showParticleCoordsCheckbox').addEventListener('change', (e) => {
        showParticleCoords = e.target.checked;
        updateVisualization();
    });
}

window.addEventListener('DOMContentLoaded', () => {
    initThree();
    initUi();
    loadBuiltInSamples();
});
