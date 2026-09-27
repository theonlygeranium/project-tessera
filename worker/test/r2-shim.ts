// An in-memory stand-in for the R2 bucket binding, covering what the Worker uses:
// put, get (with a Range header), list by prefix, and delete.
type Value = string | ArrayBuffer | ArrayBufferView | ReadableStream | Blob | null;

async function bytesOf(value: Value): Promise<Uint8Array> {
  if (value === null) return new Uint8Array();
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  return new Uint8Array(await new Response(value as BodyInit).arrayBuffer());
}

export function createTestBucket() {
  const store = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  const bucket = {
    store,
    async put(key: string, value: Value, options?: { httpMetadata?: { contentType?: string } }) {
      store.set(key, { bytes: await bytesOf(value), contentType: options?.httpMetadata?.contentType });
      return { key };
    },
    async get(key: string, options?: { range?: Headers }) {
      const item = store.get(key);
      if (!item) return null;
      let offset = 0, length = item.bytes.length, range: { offset: number; length: number } | undefined;
      const header = options?.range?.get('range');
      const m = header ? /bytes=(\d*)-(\d*)/.exec(header) : null;
      if (m) {
        offset = m[1] ? Number(m[1]) : Math.max(0, item.bytes.length - Number(m[2]));
        const end = m[1] && m[2] ? Math.min(Number(m[2]), item.bytes.length - 1) : item.bytes.length - 1;
        length = end - offset + 1;
        range = { offset, length };
      }
      const slice = item.bytes.slice(offset, offset + length);
      return {
        key, size: item.bytes.length, range,
        httpMetadata: { contentType: item.contentType },
        body: new Response(slice).body,
        arrayBuffer: async () => slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength),
        text: async () => new TextDecoder().decode(slice),
      };
    },
    async list(options?: { prefix?: string; cursor?: string }) {
      const objects = [...store.keys()].filter((k) => k.startsWith(options?.prefix ?? '')).sort().map((key) => ({ key, size: store.get(key)!.bytes.length }));
      return { objects, truncated: false as const, cursor: undefined, delimitedPrefixes: [] };
    },
    async delete(keys: string | string[]) {
      for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k);
    },
  };
  return bucket;
}
