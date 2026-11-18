const MAGIC = 0x504c5450;
const VERSION = 1;
const HEADER_BYTES = 16;
const BLOCK_BYTES = 512;

export const PUBLICATION_PACKET_MIME = 'application/vnd.plot.page';
export const PUBLICATION_DOCUMENT_MAX_BYTES = 12 * 1024 * 1024;
export const PUBLICATION_METADATA_MAX_BYTES = 64 * 1024;
export const PUBLICATION_PACKET_MAX_BYTES = PUBLICATION_DOCUMENT_MAX_BYTES + 64 * 1024 + HEADER_BYTES;
const METADATA_LENGTH_BYTES = 4;
const decoder = new TextDecoder('utf-8', { fatal: true });

function wordGenerator(seed, salt) {
  let state = (seed ^ salt) >>> 0 || salt;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

function shuffledBlocks(length, seed) {
  const blockCount = Math.ceil(length / BLOCK_BYTES);
  const order = Uint32Array.from({ length: blockCount }, (_, index) => index);
  const next = wordGenerator(seed, 0x95a17b43);
  for (let index = blockCount - 1; index > 0; index--) {
    const swap = next() % (index + 1);
    const previous = order[index];
    order[index] = order[swap];
    order[swap] = previous;
  }
  return order;
}

function transform(input, output, seed, unpacking) {
  const order = shuffledBlocks(input.length, seed);
  const nextMask = wordGenerator(seed, 0xb13cd6e7);
  let packedOffset = 0;

  for (const block of order) {
    const originalOffset = block * BLOCK_BYTES;
    const blockLength = Math.min(BLOCK_BYTES, input.length - originalOffset);
    const readOffset = unpacking ? packedOffset : originalOffset;
    const writeOffset = unpacking ? originalOffset : packedOffset;
    let mask = 0;

    for (let index = 0; index < blockLength; index++) {
      if ((index & 3) === 0) mask = nextMask();
      output[writeOffset + index] = input[readOffset + index] ^ (mask & 255);
      mask >>>= 8;
    }
    packedOffset += blockLength;
  }
}

export function packPublicationPacket(compressed, seed) {
  if (!(compressed instanceof Uint8Array) || compressed.length > PUBLICATION_PACKET_MAX_BYTES - HEADER_BYTES) {
    throw new RangeError('Invalid publication payload length.');
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('Invalid publication packet seed.');
  }

  const packet = new Uint8Array(HEADER_BYTES + compressed.length);
  const header = new DataView(packet.buffer);
  header.setUint32(0, MAGIC);
  header.setUint32(4, VERSION);
  header.setUint32(8, compressed.length);
  header.setUint32(12, seed);
  transform(compressed, packet.subarray(HEADER_BYTES), seed, false);
  return packet;
}

export function unpackPublicationPacket(packet) {
  if (!(packet instanceof Uint8Array) ||
      packet.length < HEADER_BYTES || packet.length > PUBLICATION_PACKET_MAX_BYTES) {
    throw new RangeError('Invalid publication packet length.');
  }

  const header = new DataView(packet.buffer, packet.byteOffset, HEADER_BYTES);
  const length = header.getUint32(8);
  if (header.getUint32(0) !== MAGIC || header.getUint32(4) !== VERSION || length !== packet.length - HEADER_BYTES) {
    throw new Error('Invalid publication packet header.');
  }

  const compressed = new Uint8Array(length);
  transform(packet.subarray(HEADER_BYTES), compressed, header.getUint32(12), true);
  return compressed;
}

export function readPublicationDocument(bytes) {
  if (!(bytes instanceof Uint8Array) ||
      bytes.length <= METADATA_LENGTH_BYTES || bytes.length > PUBLICATION_DOCUMENT_MAX_BYTES) {
    throw new RangeError('Invalid publication document length.');
  }

  const header = new DataView(bytes.buffer, bytes.byteOffset, METADATA_LENGTH_BYTES);
  const metadataLength = header.getUint32(0, true);
  const documentOffset = METADATA_LENGTH_BYTES + metadataLength;
  if (!metadataLength || metadataLength > PUBLICATION_METADATA_MAX_BYTES || documentOffset >= bytes.length) {
    throw new RangeError('Invalid publication metadata length.');
  }

  const metadata = JSON.parse(decoder.decode(bytes.subarray(METADATA_LENGTH_BYTES, documentOffset)));
  const { title, slug } = metadata ?? {};
  if (typeof title !== 'string' || typeof slug !== 'string' || !slug || /[^a-z0-9-]/.test(slug)) {
    throw new Error('Invalid publication metadata.');
  }

  const document = decoder.decode(bytes.subarray(documentOffset));
  return { title, slug, document };
}
