import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDxf } from '../src/cad/dxf.js';
import { binaryDxfToText, isBinaryDxf, readDxfFile } from '../src/cad/dxf-binary.js';

const SENTINEL = 'AutoCAD Binary DXF\r\n\x1a\0';
const latin1 = (text) => Uint8Array.from(text, (c) => c.charCodeAt(0));
const utf8 = (text) => new TextEncoder().encode(text);

// '日本語' em shift_jis (ANSI_932), '中文' em big5 (ANSI_950), 'ç' em windows-1252.
const SJIS_NIHONGO = Uint8Array.of(0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea);
const BIG5_ZHONGWEN = Uint8Array.of(0xa4, 0xa4, 0xa4, 0xe5);

function typedValue(code, value) {
    const number = (size, write) => {
        const view = new DataView(new ArrayBuffer(size));
        write(view);
        return new Uint8Array(view.buffer);
    };
    if ((code >= 10 && code <= 59) || (code >= 110 && code <= 149) || (code >= 210 && code <= 239) || (code >= 1010 && code <= 1059)) {
        return number(8, (v) => v.setFloat64(0, Number(value), true));
    }
    if (code === 1071 || (code >= 90 && code <= 99) || (code >= 420 && code <= 429) || (code >= 440 && code <= 459)) {
        return number(4, (v) => v.setInt32(0, Number(value), true));
    }
    if ((code >= 60 && code <= 79) || (code >= 170 && code <= 179) || (code >= 270 && code <= 289) || (code >= 370 && code <= 389)) {
        return number(2, (v) => v.setInt16(0, Number(value), true));
    }
    return null;
}

// Codifica pares código/valor no formato binário (códigos de 2 bytes). Um valor Uint8Array
// entra como bytes crus de string (terminados em NUL), para simular outras codepages.
function encode(pairs, { encodeText = utf8 } = {}) {
    const parts = [latin1(SENTINEL)];
    for (const [code, value] of pairs) {
        parts.push(new Uint8Array(new Int16Array([code]).buffer));
        if (value instanceof Uint8Array) parts.push(value, Uint8Array.of(0));
        else if (code >= 290 && code <= 299) parts.push(Uint8Array.of(Number(value)));
        else if ((code >= 310 && code <= 319) || code === 1004) parts.push(Uint8Array.of(value.length), Uint8Array.from(value));
        else if (code >= 160 && code <= 169) parts.push(new Uint8Array(new BigInt64Array([BigInt(value)]).buffer));
        else parts.push(typedValue(code, value) ?? Uint8Array.of(...encodeText(String(value)), 0));
    }
    const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

function pairsOf(text) {
    const lines = text.split(/\r?\n/);
    const pairs = [];
    for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i].trim()), lines[i + 1].trim()]);
    return pairs;
}

const header = (version, codepage) => [
    [0, 'SECTION'], [2, 'HEADER'],
    [9, '$ACADVER'], [1, version],
    [9, '$DWGCODEPAGE'], [3, codepage],
    [0, 'ENDSEC'],
];
const textEntity = (value) => [[0, 'SECTION'], [2, 'ENTITIES'], [0, 'TEXT'], [1, value], [0, 'ENDSEC'], [0, 'EOF']];

test('AC1021+ impõe UTF-8 mesmo com $DWGCODEPAGE no arquivo', () => {
    // Os bytes UTF-8 de '日本語' virariam lixo se ANSI_932 (shift_jis) fosse aplicada depois.
    const bytes = encode([...header('AC1021', 'ANSI_932'), ...textEntity('日本語 Peça')]);
    assert.match(binaryDxfToText(bytes), /\n日本語 Peça\n/);
});

test('AC1021+ impõe UTF-8 mesmo quando $DWGCODEPAGE aparece antes de $ACADVER', () => {
    const bytes = encode([
        [0, 'SECTION'], [2, 'HEADER'],
        [9, '$DWGCODEPAGE'], [3, 'ANSI_932'],
        [9, '$ACADVER'], [1, 'AC1024'],
        [0, 'ENDSEC'],
        ...textEntity('日本語'),
    ]);
    assert.match(binaryDxfToText(bytes), /\n日本語\n/);
});

test('ANSI_932 decodifica shift_jis em versões anteriores ao AC1021', () => {
    const bytes = encode([...header('AC1018', 'ANSI_932'), ...textEntity(SJIS_NIHONGO)]);
    const text = binaryDxfToText(bytes);
    assert.match(text, /\n日本語\n/);
    assert.equal(parseDxf(text).entities[0].text, '日本語');
});

test('ANSI_950 decodifica big5 em versões anteriores ao AC1021', () => {
    const bytes = encode([...header('AC1015', 'ANSI_950'), ...textEntity(BIG5_ZHONGWEN)]);
    assert.match(binaryDxfToText(bytes), /\n中文\n/);
});

test('codepage ANSI_<n> sem suporte cai para windows-1252 em vez de falhar', () => {
    const bytes = encode([...header('AC1015', 'ANSI_999'), ...textEntity(Uint8Array.of(0xe7))]);
    assert.match(binaryDxfToText(bytes), /\nç\n/);
});

test('quebra de linha dentro de um valor vira espaço e os pares continuam alinhados', () => {
    const text = binaryDxfToText(encode([[0, 'TEXT'], [1, 'a\r\nb\rc\nd'], [8, '0'], [0, 'EOF']]));
    assert.deepEqual(pairsOf(text), [[0, 'TEXT'], [1, 'a b c d'], [8, '0'], [0, 'EOF']]);
});

test('arquivo truncado falha com o byte do erro, sem devolver texto pela metade', () => {
    const sentinelOnly = latin1(SENTINEL);
    assert.throws(() => binaryDxfToText(sentinelOnly), /truncado no byte 22/);
    const semEof = encode([[0, 'SECTION'], [2, 'HEADER'], [0, 'ENDSEC']]);
    assert.throws(() => binaryDxfToText(semEof), /truncado no byte \d+/);
    const completo = encode([[0, 'SECTION'], [10, 1.5], [0, 'EOF']]);
    assert.throws(() => binaryDxfToText(completo.subarray(0, completo.length - 5)), /truncado no byte \d+/);
    // String sem o NUL terminador.
    const semNul = completo.subarray(0, 22 + 2 + 3); // sentinela + código 0 + 'SEC'
    assert.throws(() => binaryDxfToText(semNul), /truncado no byte \d+/);
});

test('código de grupo desconhecido falha com o código e o byte', () => {
    const bytes = encode([[0, 'SECTION'], [2000, 'x'], [0, 'EOF']]);
    assert.throws(() => binaryDxfToText(bytes), /Código de grupo 2000 desconhecido no byte \d+/);
});

test('entrada que não é DXF binário falha indicando onde a sentinela diverge', () => {
    assert.equal(isBinaryDxf(utf8('0\nSECTION\n')), false);
    assert.throws(() => binaryDxfToText(utf8('0\nSECTION\n')), /não é DXF binário.*byte 0/);
    assert.throws(() => binaryDxfToText(utf8('AutoCAD Binary DXF\r\n')), /não é DXF binário.*byte \d+/);
});

test('readDxfFile despacha File binário e File ASCII para o caminho certo', async () => {
    const ascii = '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n1\n20\n2\n11\n3\n21\n4\n0\nENDSEC\n0\nEOF\n';
    assert.equal(await readDxfFile(new File([ascii], 'a.dxf')), ascii);
    const binary = encode([[0, 'SECTION'], [2, 'ENTITIES'], [0, 'LINE'], [8, '0'], [10, 1], [20, 2], [11, 3], [21, 4], [0, 'ENDSEC'], [0, 'EOF']]);
    assert.equal(isBinaryDxf(binary), true);
    const text = await readDxfFile(new File([binary], 'b.dxf'));
    assert.deepEqual(parseDxf(text).entities[0].start, { x: 1, y: 2 });
    // Sem arrayBuffer (ambiente antigo), cai no text() do arquivo.
    assert.equal(await readDxfFile({ text: async () => ascii }), ascii);
});
