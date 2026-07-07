import { DataAdapter } from "obsidian";

// Snapshots taken before every external change is applied, stored inside the
// plugin's config folder so they never clutter the vault's note space.

export interface SnapshotInfo {
  ts: number;
  storagePath: string;
}

export class SnapshotStore {
  private adapter: DataAdapter;
  private dir: string;
  private limit: number;

  constructor(adapter: DataAdapter, pluginDir: string, limit: number) {
    this.adapter = adapter;
    this.dir = `${pluginDir}/snapshots`;
    this.limit = limit;
  }

  setLimit(limit: number) {
    this.limit = limit;
  }

  private slug(filePath: string): string {
    return filePath.replace(/[/\\]/g, "__");
  }

  async save(filePath: string, content: string): Promise<void> {
    if (!(await this.adapter.exists(this.dir))) {
      await this.adapter.mkdir(this.dir);
    }
    const ts = Date.now();
    await this.adapter.write(
      `${this.dir}/${this.slug(filePath)}@${ts}.md`,
      content
    );
    await this.prune(filePath);
  }

  async list(filePath: string): Promise<SnapshotInfo[]> {
    if (!(await this.adapter.exists(this.dir))) return [];
    const prefix = `${this.dir}/${this.slug(filePath)}@`;
    const listing = await this.adapter.list(this.dir);
    const out: SnapshotInfo[] = [];
    for (const f of listing.files) {
      if (!f.startsWith(prefix)) continue;
      const ts = parseInt(f.slice(prefix.length).replace(/\.md$/, ""), 10);
      if (!Number.isNaN(ts)) out.push({ ts, storagePath: f });
    }
    out.sort((a, b) => b.ts - a.ts);
    return out;
  }

  async read(info: SnapshotInfo): Promise<string> {
    return this.adapter.read(info.storagePath);
  }

  private async prune(filePath: string): Promise<void> {
    const snaps = await this.list(filePath);
    for (let i = this.limit; i < snaps.length; i++) {
      await this.adapter.remove(snaps[i].storagePath);
    }
  }
}
