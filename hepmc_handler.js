// =============================================================================
// HepMC2 ASCII format helpers
// =============================================================================

function parseFortranFloat(s) {
    return parseFloat(String(s).replace(/[dD](?=[+-]?\d)/, 'E'));
}

const INCOMING_HEPMC_STATUS = new Set([4, 21, 71, 72, 73]);

function parseQuotedStrings(line) {
    const names = [];
    const re = /"([^"]*)"/g;
    let m;
    while ((m = re.exec(line)) !== null) names.push(m[1]);
    return names;
}

function parseHepmcHeader(text) {
    const meta = {
        hepmcVersion: '',
        generator: 'Unknown',
        generatorVersion: '',
        process: 'N/A',
        signalProcessId: null,
        crossSection: null,
        crossSectionErr: null,
        units: { momentum: 'GeV', length: 'mm' },
        weightNames: [],
        pdfSets: [],
        tuneParameters: {},
        scale: null,
        mpi: null,
    };

    const versionMatch = text.match(/^HepMC::Version\s+(\S+)/m);
    if (versionMatch) meta.hepmcVersion = versionMatch[1];

    const firstEvent = text.match(/^E\s+(.+)$/m);
    if (firstEvent) {
        const eInfo = parseEventLine(firstEvent[1]);
        Object.assign(meta, {
            signalProcessId: eInfo.signalProcessId,
            scale: eInfo.scale,
            mpi: eInfo.mpi,
            eventWeight: eInfo.eventWeight,
        });
        if (eInfo.signalProcessId != null && eInfo.signalProcessId > 0) {
            meta.process = `Signal process ID ${eInfo.signalProcessId}`;
        }
    }

    const cMatch = text.match(/^C\s+(\S+)\s+(\S+)/m);
    if (cMatch) {
        meta.crossSection = parseFortranFloat(cMatch[1]);
        meta.crossSectionErr = parseFortranFloat(cMatch[2]);
    }

    const uMatch = text.match(/^U\s+(\S+)\s+(\S+)/m);
    if (uMatch) {
        meta.units = { momentum: uMatch[1], length: uMatch[2] };
    }

    const nMatch = text.match(/^N\s+(\d+)\s+(.+)$/m);
    if (nMatch) {
        meta.weightNames = parseQuotedStrings(nMatch[0]);
        extractWeightMetadata(meta);
    }

    return meta;
}

function extractWeightMetadata(meta) {
    const pdfIds = new Set();
    const tune = {};

    for (const name of meta.weightNames) {
        if (name === 'Weight' || name.startsWith('AUX_')) continue;

        const pdfMatch = name.match(/PDF=(\d+)/);
        if (pdfMatch) pdfIds.add(pdfMatch[1]);

        for (const key of ['MUF', 'MUR', 'MERGING', 'DYN_SCALE']) {
            const re = new RegExp(`${key}=([^_]+)`);
            const m = name.match(re);
            if (m) {
                if (!tune[key]) tune[key] = new Set();
                tune[key].add(m[1]);
            }
        }
    }

    meta.pdfSets = [...pdfIds].sort((a, b) => Number(a) - Number(b));

    for (const [key, values] of Object.entries(tune)) {
        const arr = [...values];
        meta.tuneParameters[key] = arr.length <= 4 ? arr.join(', ') : `${arr.slice(0, 3).join(', ')} … (${arr.length} values)`;
    }

    if (meta.pdfSets.length === 1) {
        meta.pdfInfoText = `LHAPDF set ${meta.pdfSets[0]}`;
    } else if (meta.pdfSets.length > 1) {
        meta.pdfInfoText = `LHAPDF sets ${meta.pdfSets[0]}–${meta.pdfSets[meta.pdfSets.length - 1]} (${meta.pdfSets.length} variations)`;
    }
}

function parseEventLine(body) {
    const tokens = body.trim().split(/\s+/).map(t => parseFortranFloat(t));
    const info = {
        eventNumber: Math.trunc(tokens[0]),
        eventWeight: tokens[1],
        mpi: null,
        signalProcessId: null,
        random1: null,
        random2: null,
        scale: null,
        numVertices: null,
        numBeam: null,
        numParticles: null,
        numFlows: null,
        numWeights: null,
        attributeValues: [],
    };

    if (tokens.length < 13) return info;

    // Tail layout: ... signal random1 num_vertices num_beam num_particles num_flows num_attributes [attributes]
    let attrIdx = -1;
    for (let i = 11; i < Math.min(tokens.length, 24); i++) {
        const n = Math.trunc(tokens[i]);
        if (n > 0 && i + n <= tokens.length) {
            attrIdx = i;
            break;
        }
    }

    if (attrIdx >= 11) {
        const numAttributes = Math.trunc(tokens[attrIdx]);
        info.numFlows = Math.trunc(tokens[attrIdx - 1]);
        info.numParticles = Math.trunc(tokens[attrIdx - 2]);
        info.numBeam = Math.trunc(tokens[attrIdx - 3]);
        info.numVertices = Math.trunc(tokens[attrIdx - 4]);
        info.random1 = tokens[attrIdx - 5];
        info.signalProcessId = Math.trunc(tokens[attrIdx - 6]);
        info.mpi = Math.trunc(tokens[2]);
        info.attributeValues = tokens.slice(attrIdx + 1, attrIdx + 1 + numAttributes);
    } else {
        info.mpi = Math.trunc(tokens[2]);
        info.signalProcessId = Math.trunc(tokens[3]);
        info.random1 = tokens[4];
        info.random2 = tokens[5];
        info.scale = tokens[6];
        info.numVertices = Math.trunc(tokens[7]);
        info.numBeam = Math.trunc(tokens[8]);
        info.numParticles = Math.trunc(tokens[9]);
        info.numFlows = Math.trunc(tokens[10]);
        info.numWeights = Math.trunc(tokens[11]);
    }

    return info;
}

function parseHepmcEventBlock(text) {
    const lines = text.split(/\r?\n/);
    const vertices = new Map();
    const rawParticles = [];
    let eventInfo = null;
    let crossSection = null;
    let crossSectionErr = null;
    let weightNames = [];

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;

        const kind = line[0];
        const body = line.slice(2).trim();

        if (kind === 'E') {
            eventInfo = parseEventLine(body);
        } else if (kind === 'N') {
            weightNames = parseQuotedStrings(line);
        } else if (kind === 'C') {
            const parts = body.split(/\s+/);
            if (parts.length >= 2) {
                crossSection = parseFortranFloat(parts[0]);
                crossSectionErr = parseFortranFloat(parts[1]);
            }
        } else if (kind === 'V') {
            const v = parseVertexLine(body);
            if (v) vertices.set(v.barcode, v);
        }
    }

    let currentProdVtx = 0;
    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;

        if (line[0] === 'V') {
            const v = parseVertexLine(line.slice(2).trim());
            currentProdVtx = v ? v.barcode : 0;
            continue;
        }

        if (line[0] !== 'P') continue;
        const p = parseParticleLine(line.slice(2).trim(), vertices);
        if (!p) continue;
        if (!p.prodVtx && currentProdVtx) p.prodVtx = currentProdVtx;
        rawParticles.push(p);
    }

    return {
        eventInfo,
        crossSection,
        crossSectionErr,
        weightNames,
        particles: buildLheLikeParticles(rawParticles, vertices),
    };
}

function parseVertexLine(body) {
    const parts = body.split(/\s+/).map(parseFortranFloat);
    if (parts.length < 8) return null;
    return {
        barcode: Math.trunc(parts[0]),
        status: Math.trunc(parts[1]),
        x: parts[2], y: parts[3], z: parts[4], t: parts[5],
    };
}

function parseParticleLine(body, vertices = new Map()) {
    const parts = body.split(/\s+/).map(parseFortranFloat);
    if (parts.length < 8) return null;

    const p = {
        barcode: Math.trunc(parts[0]),
        pdgId: Math.trunc(parts[1]),
        px: parts[2], py: parts[3], pz: parts[4],
        e: parts[5], m: parts[6],
        status: Math.trunc(parts[7]),
        prodVtx: 0,
        endVtx: 0,
    };

    const tail = parts.slice(8).map(v => Math.trunc(v));
    const vtxBarcodes = tail.filter(v => vertices.has(v));
    if (vtxBarcodes.length >= 2) {
        p.endVtx = vtxBarcodes[vtxBarcodes.length - 2];
        p.prodVtx = vtxBarcodes[vtxBarcodes.length - 1];
    } else if (vtxBarcodes.length === 1) {
        const vtx = vtxBarcodes[0];
        if (INCOMING_HEPMC_STATUS.has(p.status)) {
            p.endVtx = vtx;
        } else if (p.status === 2 || p.status === 22 || (p.status >= 44 && p.status <= 72)) {
            p.endVtx = vtx;
        } else {
            p.prodVtx = vtx;
        }
    }

    return p;
}

function isHepmcIncoming(p) {
    if (p.status === 3) return false;
    return INCOMING_HEPMC_STATUS.has(p.status);
}

function buildLheLikeParticles(rawParticles, vertices) {
    const visible = rawParticles.filter(p => p.status !== 3);
    if (!visible.length) return [];

    const vtxToParticles = new Map();
    const endVtxToParents = new Map();

    for (const p of visible) {
        if (p.prodVtx) {
            if (!vtxToParticles.has(p.prodVtx)) vtxToParticles.set(p.prodVtx, []);
            vtxToParticles.get(p.prodVtx).push(p.barcode);
        }
        if (p.endVtx) {
            if (!endVtxToParents.has(p.endVtx)) endVtxToParents.set(p.endVtx, []);
            endVtxToParents.get(p.endVtx).push(p.barcode);
        }
    }

    const barcodeToIndex = new Map();
    const particles = visible.map((p, i) => {
        barcodeToIndex.set(p.barcode, i + 1);
        return {
            idup: p.pdgId,
            istup: isHepmcIncoming(p) ? -1 : (p.status === 1 ? 1 : 2),
            moth1: 0,
            moth2: 0,
            px: p.px, py: p.py, pz: p.pz,
            e: p.e, m: p.m,
            _barcode: p.barcode,
            _prodVtx: p.prodVtx,
            _endVtx: p.endVtx,
            _hepmcStatus: p.status,
        };
    });

    const barcodeToParticle = new Map();
    visible.forEach(p => barcodeToParticle.set(p.barcode, p));

    for (const p of particles) {
        if (!p._prodVtx) continue;
        const parents = endVtxToParents.get(p._prodVtx) || [];
        if (parents[0] && barcodeToIndex.has(parents[0])) {
            p.moth1 = barcodeToIndex.get(parents[0]);
        }
        if (parents[1] && barcodeToIndex.has(parents[1])) {
            p.moth2 = barcodeToIndex.get(parents[1]);
        }
    }

    for (const p of particles) {
        delete p._barcode;
        delete p._prodVtx;
        delete p._endVtx;
        delete p._hepmcStatus;
    }

    return particles;
}

function validateHepmcStructure(text) {
    if (!text.includes('HepMC::') && !/^E\s/m.test(text)) {
        return { ok: false, reason: 'Not a recognized HepMC ASCII file.' };
    }
    if (!/^E\s/m.test(text)) {
        return { ok: false, reason: 'No HepMC events found.' };
    }
    return { ok: true };
}

async function readHeader(file) {
    const size = Math.min(file.size, 512 * 1024);
    let text = await file.slice(0, size).text();

    if (!text.includes('\nE ') && file.size > size) {
        text = await file.slice(0, Math.min(file.size, 2 * 1024 * 1024)).text();
    }
    return text;
}

async function buildEventIndex(file) {
    const offsets = [];
    const CHUNK = 512 * 1024;
    let bytePos = 0;
    let carry = '';
    let eventStarts = [];

    while (bytePos < file.size) {
        const chunk = await file.slice(bytePos, bytePos + CHUNK).text();
        const text = carry + chunk;

        let searchFrom = 0;
        while (searchFrom < text.length) {
            const relIdx = text.indexOf('\nE ', searchFrom);
            if (relIdx === -1) break;
            const absIdx = bytePos - carry.length + relIdx + 1;
            eventStarts.push(absIdx);
            searchFrom = relIdx + 3;
        }

        carry = text.slice(Math.max(0, text.length - 8));
        bytePos += CHUNK;
    }

    if (eventStarts.length === 0) {
        const head = await file.slice(0, Math.min(file.size, 64)).text();
        if (head.startsWith('E ')) eventStarts.push(0);
    }

    for (let i = 0; i < eventStarts.length; i++) {
        offsets.push({
            start: eventStarts[i],
            end: i + 1 < eventStarts.length ? eventStarts[i + 1] : file.size,
        });
    }

    const tail = await file.slice(Math.max(0, file.size - 128)).text();
    const endMarker = tail.indexOf('HepMC::IO_GenEvent-END_EVENT_LISTING');
    if (endMarker !== -1 && offsets.length) {
        const trimPos = file.size - (tail.length - endMarker);
        offsets[offsets.length - 1].end = trimPos;
    }

    return offsets;
}

// =============================================================================
// HepMC handler factory
// =============================================================================

export function createHepmcHandler({ $, renderEvent, cleanupEventVisual, formatCrossSection }) {
    let sourceFile = null;
    let eventOffsets = [];
    let totalEvents = 0;
    let fileMeta = null;
    let hasVisual = false;

    function renderFileInfoHtml() {
        const m = fileMeta;
        const lines = [
            `<span class="meta-row"><span class="meta-label">Format:</span> HepMC</span>`,
        ];

        if (m.hepmcVersion) {
            lines.push(`<span class="meta-row"><span class="meta-label">HepMC version:</span> ${m.hepmcVersion}</span>`);
        }
        lines.push(`<span class="meta-row"><span class="meta-label">Generator:</span> ${m.generator}</span>`);
        if (m.process !== 'N/A') {
            lines.push(`<span class="meta-row"><span class="meta-label">Process:</span> ${m.process}</span>`);
        }
        lines.push(`<span class="meta-row"><span class="meta-label">Cross section:</span> ${formatCrossSection(m.crossSection, m.crossSectionErr)}</span>`);

        if (m.scale != null && !Number.isNaN(m.scale) && m.scale !== 0) {
            lines.push(`<span class="meta-row"><span class="meta-label">Event scale:</span> ${m.scale} ${m.units.momentum}</span>`);
        }
        if (m.mpi != null && m.mpi >= 0) {
            lines.push(`<span class="meta-row"><span class="meta-label">MPI:</span> ${m.mpi}</span>`);
        }
        if (m.pdfInfoText) {
            lines.push(`<span class="meta-row"><span class="meta-label">PDF sets:</span> ${m.pdfInfoText}</span>`);
        } else if (m.pdfSets?.length) {
            lines.push(`<span class="meta-row"><span class="meta-label">PDF sets:</span> ${m.pdfSets.join(', ')}</span>`);
        }

        const tuneKeys = Object.keys(m.tuneParameters || {});
        if (tuneKeys.length) {
            for (const key of tuneKeys) {
                lines.push(`<span class="meta-row"><span class="meta-label">${key}:</span> ${m.tuneParameters[key]}</span>`);
            }
        }

        if (m.units) {
            lines.push(`<span class="meta-row"><span class="meta-label">Units:</span> ${m.units.momentum}, ${m.units.length}</span>`);
        }

        if (m.weightNames?.length) {
            const namedWeights = m.weightNames.filter(n => n !== 'Weight' && !n.startsWith('AUX_'));
            if (namedWeights.length) {
                const preview = namedWeights.length <= 3
                    ? namedWeights.join('; ')
                    : `${namedWeights.slice(0, 2).join('; ')} … (+${namedWeights.length - 2} more)`;
                lines.push(`<span class="meta-row"><span class="meta-label">Weight variations:</span> ${namedWeights.length} (${preview})</span>`);
            }
        }

        lines.push(`<span class="meta-row"><span class="meta-label">Events:</span> ${totalEvents.toLocaleString()}</span>`);
        return lines.join('');
    }

    async function loadEventByNumber(eventNum) {
        if (!sourceFile || !eventOffsets.length) return false;
        if (eventNum < 1 || eventNum > totalEvents) return false;

        const { start, end } = eventOffsets[eventNum - 1];
        const text = await sourceFile.slice(start, end).text();
        const parsed = parseHepmcEventBlock(text);

        renderEvent(parsed.particles);
        hasVisual = parsed.particles.length > 0;

        const outgoing = parsed.particles.filter(p => p.istup > 0).length;
        const incoming = parsed.particles.filter(p => p.istup < 0).length;
        let stats = `Event ${eventNum} of ${totalEvents} — ${parsed.particles.length} particles (${incoming} incoming, ${outgoing} outgoing)`;
        if (parsed.eventInfo?.numVertices) {
            stats += `, ${parsed.eventInfo.numVertices} vertices`;
        }
        $('eventStats').textContent = stats;
        return true;
    }

    async function loadFile(file) {
        cleanupEventVisual();
        hasVisual = false;

        const headerText = await readHeader(file);
        const validation = validateHepmcStructure(headerText);
        if (!validation.ok) {
            $('fileInfo').innerHTML = `<span class="status error">${validation.reason}</span>`;
            return false;
        }

        fileMeta = parseHepmcHeader(headerText);

        if (fileMeta.weightNames.length) {
            const hasPythiaWeights = fileMeta.weightNames.some(n => n.includes('MUF=') || n.includes('PDF='));
            if (hasPythiaWeights && fileMeta.generator === 'Unknown') {
                fileMeta.generator = 'Pythia8 (inferred from weight names)';
            }
        }

        eventOffsets = await buildEventIndex(file);
        totalEvents = eventOffsets.length;
        sourceFile = file;

        if (totalEvents === 0) {
            $('fileInfo').innerHTML = '<span class="status error">No parseable HepMC events found.</span>';
            return false;
        }

        return true;
    }

    return {
        loadFile,
        loadEventByNumber,
        renderFileInfoHtml,
        getTotalEvents: () => totalEvents,
        hasVisual: () => hasVisual,
    };
}

// Exported for testing
export {
    parseHepmcEventBlock,
    parseHepmcHeader,
    buildLheLikeParticles,
    validateHepmcStructure,
};
