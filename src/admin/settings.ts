import fs from "node:fs";
import path from "node:path";

export interface AdminSettings {
  media: {
    localDir: string;
    publicBaseUrl: string;
    ossProvider: string;
    ossBucket: string;
    ossEndpoint: string;
    ossPrefix: string;
    includePublicUrlInPrompt: boolean;
  };
}

export interface MediaRecord {
  id: string;
  type: "image" | "video" | "voice" | "file" | "media";
  fileName: string;
  localPath: string;
  publicUrl?: string;
  size: number;
  createdAt: string;
}

const SETTINGS_FILE = "admin-settings.json";
const MEDIA_INDEX_FILE = "media-index.json";
const MAX_MEDIA_RECORDS = 500;

export function defaultAdminSettings(): AdminSettings {
  return {
    media: {
      localDir: "",
      publicBaseUrl: "",
      ossProvider: "",
      ossBucket: "",
      ossEndpoint: "",
      ossPrefix: "",
      includePublicUrlInPrompt: true,
    },
  };
}

export function settingsPath(storageDir: string): string {
  return path.join(storageDir, SETTINGS_FILE);
}

export function mediaIndexPath(storageDir: string): string {
  return path.join(storageDir, MEDIA_INDEX_FILE);
}

export function loadAdminSettings(storageDir: string): AdminSettings {
  const defaults = defaultAdminSettings();
  const filePath = settingsPath(storageDir);
  if (!fs.existsSync(filePath)) return defaults;

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<AdminSettings>;
    return {
      media: {
        ...defaults.media,
        ...(parsed.media ?? {}),
      },
    };
  } catch {
    return defaults;
  }
}

export function saveAdminSettings(storageDir: string, settings: AdminSettings): void {
  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(settingsPath(storageDir), JSON.stringify(settings, null, 2), "utf-8");
}

export function resolveMediaRoot(storageDir: string, settings = loadAdminSettings(storageDir)): string {
  const configured = settings.media.localDir.trim();
  if (!configured) return path.join(storageDir, "media");
  return path.resolve(configured);
}

export function buildPublicMediaUrl(
  storageDir: string,
  datedFileName: string,
  settings = loadAdminSettings(storageDir),
): string | undefined {
  const base = settings.media.publicBaseUrl.trim().replace(/\/+$/, "");
  if (!base) return undefined;

  const prefix = settings.media.ossPrefix
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  const key = [prefix, datedFileName.replace(/^\/+/, "")]
    .filter(Boolean)
    .join("/");

  return `${base}/${key}`;
}

export function publicPromptLine(record: MediaRecord, settings: AdminSettings): string | null {
  if (!settings.media.includePublicUrlInPrompt || !record.publicUrl) return null;
  return `Public media URL: ${record.publicUrl}`;
}

export function loadMediaRecords(storageDir: string): MediaRecord[] {
  const filePath = mediaIndexPath(storageDir);
  if (!fs.existsSync(filePath)) return [];

  try {
    const records = JSON.parse(fs.readFileSync(filePath, "utf-8")) as MediaRecord[];
    if (!Array.isArray(records)) return [];
    return records;
  } catch {
    return [];
  }
}

export async function recordMedia(storageDir: string, record: MediaRecord): Promise<void> {
  await fs.promises.mkdir(storageDir, { recursive: true });
  const records = loadMediaRecords(storageDir);
  records.unshift(record);
  await fs.promises.writeFile(
    mediaIndexPath(storageDir),
    JSON.stringify(records.slice(0, MAX_MEDIA_RECORDS), null, 2),
    "utf-8",
  );
}
