// Mu-law to PCM 16-bit conversion table and logic
// Simplified implementation for G.711 mu-law

const muLawToPcmMap = new Int16Array(256);
const pcmToMuLawMap = new Int16Array(65536);

// Initialize tables
for (let i = 0; i < 256; i++) {
    let mu = ~i;
    let sign = (mu & 0x80) >> 7;
    let exponent = (mu & 0x70) >> 4;
    let mantissa = mu & 0x0F;
    let sample = ((mantissa << 3) + 0x84) << exponent;
    sample -= 0x84;
    if (sign !== 0) sample = -sample;
    muLawToPcmMap[i] = sample;
}

for (let i = -32768; i <= 32767; i++) {
    let sign = (i < 0) ? 0x80 : 0;
    let sample = (i < 0) ? -i : i;
    sample += 0x84;
    if (sample > 32635) sample = 32635;
    let exponent = 7;
    let mantissa = 0;
    for (let j = 0; j < 8; j++) {
        if (sample < (1 << (j + 6))) {
            exponent = j;
            break;
        }
    }
    mantissa = (sample >> (exponent + 3)) & 0x0F;
    let mu = ~(sign | (exponent << 4) | mantissa);
    pcmToMuLawMap[i & 0xFFFF] = mu;
}

export function decodeMulaw(buffer: Buffer): Buffer {
    const len = buffer.length;
    const out = Buffer.alloc(len * 2);
    for (let i = 0; i < len; i++) {
        const pcm = muLawToPcmMap[buffer[i]];
        out.writeInt16LE(pcm, i * 2);
    }
    return out;
}

export function encodeMulaw(buffer: Buffer): Buffer {
    const len = buffer.length / 2;
    const out = Buffer.alloc(len);
    for (let i = 0; i < len; i++) {
        const pcm = buffer.readInt16LE(i * 2);
        out[i] = pcmToMuLawMap[pcm & 0xFFFF];
    }
    return out;
}

// Downsample PCM 24k -> 8k (naive)
export function downsampleTo8k(buffer: Buffer, inRate: number = 24000): Buffer {
    if (inRate === 8000) return buffer;

    // Naive decimator
    const ratio = inRate / 8000;
    const inputSamples = buffer.length / 2;
    const outputSamples = Math.floor(inputSamples / ratio);
    const out = Buffer.alloc(outputSamples * 2);

    for (let i = 0; i < outputSamples; i++) {
        const inIndex = Math.floor(i * ratio);
        const val = buffer.readInt16LE(inIndex * 2);
        out.writeInt16LE(val, i * 2);
    }
    return out;
}

// Upsample PCM 8k -> 16k (naive validation duplication)
// Gemini supports 16k or 24k input. 16k is cleaner for 8k source.
export function upsampleTo16k(buffer: Buffer): Buffer {
    const inputSamples = buffer.length / 2;
    const out = Buffer.alloc(inputSamples * 4); // 2x samples * 2 bytes

    for (let i = 0; i < inputSamples; i++) {
        const val = buffer.readInt16LE(i * 2);
        out.writeInt16LE(val, i * 4);
        out.writeInt16LE(val, i * 4 + 2);
    }
    return out;
}

export function upsample8kTo24k(buffer: Buffer): Buffer {
    const inputSamples = buffer.length / 2;
    const out = Buffer.alloc(inputSamples * 6); // 3x samples * 2 bytes = 6 bytes

    for (let i = 0; i < inputSamples; i++) {
        const val = buffer.readInt16LE(i * 2);
        out.writeInt16LE(val, i * 6);
        out.writeInt16LE(val, i * 6 + 2);
        out.writeInt16LE(val, i * 6 + 4);
    }
    return out;
}

export function upsample16kTo24k(buffer: Buffer): Buffer {
    const inputSamples = buffer.length / 2;
    const numPairs = Math.floor(inputSamples / 2);
    const out = Buffer.alloc(numPairs * 6);

    for (let i = 0; i < numPairs; i++) {
        const a = buffer.readInt16LE(i * 4);
        const b = buffer.readInt16LE(i * 4 + 2);
        out.writeInt16LE(a, i * 6);
        out.writeInt16LE(Math.floor((a + b) / 2), i * 6 + 2);
        out.writeInt16LE(b, i * 6 + 4);
    }
    return out;
}

