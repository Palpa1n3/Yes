/** API key storage, encrypted with the OS keychain (Electron safeStorage: DPAPI on
 *  Windows, Keychain on macOS, libsecret on Linux). The plaintext key only ever lives
 *  in main-process memory; it is never sent to the renderer or written unencrypted. */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Encryptor {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(plain: string): Promise<Buffer>;
  decryptStringAsync(encrypted: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>;
}

export class SecretStore {
  private cache: string | null | undefined;

  constructor(
    private readonly file: string,
    private readonly crypto: Encryptor,
  ) {}

  encryptionAvailable(): Promise<boolean> {
    return this.crypto.isAsyncEncryptionAvailable().catch(() => false);
  }

  has(): boolean {
    return this.cache ? true : existsSync(this.file);
  }

  async get(): Promise<string | null> {
    if (this.cache !== undefined) return this.cache;
    try {
      if (!existsSync(this.file)) return (this.cache = null);
      const { result, shouldReEncrypt } = await this.crypto.decryptStringAsync(
        readFileSync(this.file),
      );
      if (shouldReEncrypt) await this.set(result);
      return (this.cache = result);
    } catch {
      return (this.cache = null); // unreadable (e.g. copied from another PC): treat as no key
    }
  }

  async set(key: string): Promise<void> {
    if (!(await this.encryptionAvailable()))
      throw new Error('This system cannot encrypt secrets, so the key was not saved.');
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, await this.crypto.encryptStringAsync(key));
    renameSync(tmp, this.file);
    this.cache = key;
  }

  clear(): void {
    rmSync(this.file, { force: true });
    this.cache = null;
  }
}
