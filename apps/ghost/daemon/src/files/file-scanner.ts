import fg from 'fast-glob';
import fs from 'node:fs';
import path from 'node:path';
import type { FileMetadata } from '../types';

export interface ScanOptions {
  maxDepth?: number;
  includeExtensions?: string[];
  excludePatterns?: string[];
  limit?: number;
  /**
   * When true (default), return cached results if they match the last scan.
   */
  useCache?: boolean;
  /**
   * Force a fresh scan even if cache is present.
   */
  forceRescan?: boolean;
}

/**
 * Scans the filesystem for files to index as memories.
 */
export class FileScanner {
  private cacheKey?: string;
  private cache: FileMetadata[] = [];
  private latest: FileMetadata[] = [];
  private randomSample: FileMetadata[] = [];
  private lastScanAt?: number;

  async scan(directories: string[], options: ScanOptions = {}): Promise<FileMetadata[]> {
    const cacheKey = this.buildCacheKey(directories, options);
    const useCache = options.useCache ?? true;
    if (!options.forceRescan && useCache && this.cacheKey === cacheKey && this.cache.length > 0) {
      return this.applyLimit(this.cache, options.limit);
    }

    const roots = directories
      .map((dir) => this.expandHome(dir))
      .map((dir) => (dir ? path.resolve(dir) : null))
      .filter((dir): dir is string => Boolean(dir && fs.existsSync(dir)));

    if (roots.length === 0) {
      console.warn('No scan directories found; skipping file scan.');
      return [];
    }

    const patterns = roots.map((dir) => path.join(dir, '**/*'));
    const entries = await fg(patterns, {
      dot: false,
      onlyFiles: true,
      deep: options.maxDepth ?? 3,
      ignore: options.excludePatterns ?? ['**/node_modules/**', '**/.git/**'],
    });

    const limit = options.limit ?? 1000;
    const filtered = entries
      .filter((file) => this.allowExtension(file, options.includeExtensions))
      .slice(0, limit);

    const files = filtered.map((file) => {
      const stats = fs.statSync(file);
      return {
        path: file,
        name: path.basename(file),
        modified: stats.mtime.toISOString(),
        size: stats.size,
      };
    });

    // Prime cache and precomputed candidates for quick lookups.
    this.cacheKey = cacheKey;
    this.cache = files;
    this.latest = this.computeLatest(files);
    this.randomSample = this.computeRandomSample(files, 24);
    this.lastScanAt = Date.now();

    return this.applyLimit(files, limit);
  }

  getCachedFiles(limit?: number): FileMetadata[] {
    if (!this.cache.length) return [];
    return this.applyLimit(this.cache, limit);
  }

  getLatest(count = 5): FileMetadata[] {
    if (!this.latest.length) return [];
    return this.latest.slice(0, count);
  }

  getRandom(count = 1): FileMetadata[] {
    if (!this.randomSample.length) return [];
    const pool = [...this.randomSample];
    return pool.slice(0, Math.min(count, pool.length));
  }

  getCacheStats(): { count: number; lastScanAt?: string } {
    return {
      count: this.cache.length,
      lastScanAt: this.lastScanAt ? new Date(this.lastScanAt).toISOString() : undefined,
    };
  }

  private allowExtension(file: string, allow?: string[]): boolean {
    if (!allow || allow.length === 0) return true;
    const ext = path.extname(file).replace('.', '').toLowerCase();
    return allow.includes(ext);
  }

  private buildCacheKey(directories: string[], options: ScanOptions): string {
    return JSON.stringify({
      roots: directories.map((dir) => this.expandHome(dir)).map((dir) => (dir ? path.resolve(dir) : '')),
      include: options.includeExtensions ?? null,
      exclude: options.excludePatterns ?? null,
      maxDepth: options.maxDepth ?? 3,
    });
  }

  private applyLimit(list: FileMetadata[], limit?: number): FileMetadata[] {
    return list.slice(0, limit ?? list.length);
  }

  private computeLatest(files: FileMetadata[]): FileMetadata[] {
    return [...files].sort(
      (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
    );
  }

  private computeRandomSample(files: FileMetadata[], desiredSize: number): FileMetadata[] {
    const sampleSize = Math.min(desiredSize, files.length);
    const pool = [...files];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, sampleSize);
  }

  private expandHome(dir: string): string {
    if (dir.startsWith('~/')) {
      const home = process.env.HOME || '';
      return path.join(home, dir.slice(2));
    }
    if (dir === '~') {
      return process.env.HOME || dir;
    }
    return dir;
  }
}

export const fileScanner = new FileScanner();
