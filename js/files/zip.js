/* ZIP-Erzeugung ohne Bibliothek (ohne Kompression, "Stored") */
(function (G) {
  'use strict';
  const KON = G.KON = G.KON || {};

  const TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function u16(v) { return [v & 255, (v >>> 8) & 255]; }
  function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }

  /* files: [{name, content}] -> Blob */
  KON.makeZip = function (files, folder) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const chunks = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode((folder ? folder + '/' : '') + f.name);
      const data = enc.encode(f.content);
      const crc = crc32(data);
      const local = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 8, 0, 0, ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), 0, 0]);
      chunks.push(local, name, data);
      central.push({ name, crc, size: data.length, offset });
      offset += local.length + name.length + data.length;
    }
    const cdStart = offset;
    for (const c of central) {
      const rec = new Uint8Array([0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, 0, 8, 0, 0, ...u16(dosTime), ...u16(dosDate), ...u32(c.crc), ...u32(c.size), ...u32(c.size),
        ...u16(c.name.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(c.offset)]);
      chunks.push(rec, c.name);
      offset += rec.length + c.name.length;
    }
    const end = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, ...u16(central.length), ...u16(central.length), ...u32(offset - cdStart), ...u32(cdStart), 0, 0]);
    chunks.push(end);
    return new Blob(chunks, { type: 'application/zip' });
  };
  /* Mehrere Projekte in ein ZIP: jedes Projekt bekommt einen Ordner mit seinem Namen */
  KON.makeProjectsZip = function (projects) {
    const files = [];
    for (const p of projects) for (const f of p.files) files.push({ name: p.name + '/' + f.name, content: f.content });
    return KON.makeZip(files, '');
  };
  KON.crc32 = crc32;
})(window);
