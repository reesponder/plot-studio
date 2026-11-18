import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const marker = Buffer.from('PLOTPS1\0');
const ivLength = 12;
const tagLength = 16;

export function deriveProjectStorageKey(purpose, encoded = process.env.PLOT_PROJECT_STORAGE_KEY || '') {
  const key = Buffer.from(encoded, 'base64url');
  if (key.length !== 32 || key.toString('base64url') !== encoded) {
    throw new Error('PLOT_PROJECT_STORAGE_KEY must contain 32 bytes encoded as unpadded base64url.');
  }
  return createHmac('sha256', key).update(`PLOT private storage v1\0${purpose}`).digest();
}

export function createPrivateProjectStorage(namespace = '') {
  const key = deriveProjectStorageKey(namespace ? `hosted-snapshots:${namespace}` : 'hosted-snapshots');
  const aad = scope => Buffer.concat([marker, Buffer.from(scope)]);
  const isSealed = value => Buffer.isBuffer(value) && value.subarray(0, marker.length).equals(marker);

  return {
    isSealed,
    seal(value, scope) {
      const iv = randomBytes(ivLength);
      const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: tagLength });
      cipher.setAAD(aad(scope));
      return Buffer.concat([marker, iv, cipher.update(value), cipher.final(), cipher.getAuthTag()]);
    },
    open(value, scope) {
      if (!isSealed(value) || value.length < marker.length + ivLength + tagLength) {
        throw new Error('Invalid encrypted project record.');
      }
      const offset = marker.length + ivLength;
      const iv = value.subarray(marker.length, offset);
      const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: tagLength });
      decipher.setAAD(aad(scope));
      decipher.setAuthTag(value.subarray(-tagLength));
      return Buffer.concat([decipher.update(value.subarray(offset, -tagLength)), decipher.final()]);
    },
  };
}
