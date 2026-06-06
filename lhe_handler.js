// =============================================================================
// LHE parser
// =============================================================================

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

async function buildEventIndex(file, onProgress) {
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
        
        // Update progress
        if (onProgress) {
            const progress = 5 + Math.min(90, (bytePos / file.size) * 85);
            onProgress(progress, `Indexing events: ${offsets.length} found`);
        }
    }

    return offsets;
}

// =============================================================================
// LHE handler factory
// =============================================================================

export function createLheHandler({ $, renderEvent, cleanupEventVisual, formatBeam, formatPdf, formatCrossSection }) {
    let sourceFile = null;
    let eventOffsets = [];
    let totalEvents = 0;
    let fileMeta = null;
    let hasVisual = false;

    function renderFileInfoHtml() {
        const m = fileMeta;
        const lines = [
            `<span class="meta-row"><span class="meta-label">Format:</span> LHE</span>`,
            `<span class="meta-row"><span class="meta-label">Generator:</span> ${m.generator}</span>`,
            `<span class="meta-row"><span class="meta-label">Process:</span> ${m.process}</span>`,
            `<span class="meta-row"><span class="meta-label">Cross section:</span> ${formatCrossSection(m.crossSection, m.crossSectionErr)}</span>`,
        ];
        if (m.beam1 != null) {
            lines.push(`<span class="meta-row"><span class="meta-label">Beams:</span> ${formatBeam(m.beam1)} × ${formatBeam(m.beam2)} @ ${m.energy1} / ${m.energy2} GeV</span>`);
        }
        lines.push(`<span class="meta-row"><span class="meta-label">PDF:</span> ${formatPdf(m.pdf1, m.pdfInfoText)} / ${formatPdf(m.pdf2, null)}</span>`);
        lines.push(`<span class="meta-row"><span class="meta-label">Events:</span> ${totalEvents.toLocaleString()}</span>`);
        return lines.join('');
    }

    async function loadEventByNumber(eventNum) {
        if (!sourceFile || !eventOffsets.length) return false;
        if (eventNum < 1 || eventNum > totalEvents) return false;

        const { start, end } = eventOffsets[eventNum - 1];
        const text = await sourceFile.slice(start, end).text();
        const particles = parseEventBlock(text);

        renderEvent(particles);
        hasVisual = particles.length > 0;
        const outgoing = particles.filter(p => !isIncoming(p)).length;
        $('eventStats').textContent = `Event ${eventNum} of ${totalEvents} — ${particles.length} entries (${outgoing} outgoing)`;
        return true;
    }

    async function loadFile(file, onProgress) {
        cleanupEventVisual();
        hasVisual = false;

        if (onProgress) onProgress(10, 'Reading header...');
        const headerText = await readHeader(file);
        
        if (onProgress) onProgress(15, 'Validating file...');
        const validation = validateLheStructure(headerText);
        if (!validation.ok) {
            $('fileInfo').innerHTML = `<span class="status error">${validation.reason}</span>`;
            return false;
        }

        fileMeta = parseMetadata(headerText);
        
        if (onProgress) onProgress(20, 'Indexing events...');
        eventOffsets = await buildEventIndex(file, onProgress);
        totalEvents = eventOffsets.length;
        sourceFile = file;
        
        if (onProgress) onProgress(100, 'Complete!');

        if (totalEvents === 0) {
            $('fileInfo').innerHTML = '<span class="status error">No parseable events found.</span>';
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
