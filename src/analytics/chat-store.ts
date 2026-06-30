import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadMediaRecords, type MediaRecord } from "../admin/settings.js";

export type ChatDirection = "inbound" | "outbound";

export interface ChatMessageRecord {
  id: string;
  userId: string;
  direction: ChatDirection;
  text: string;
  agent?: string;
  contextToken?: string;
  messageType: string;
  mediaIds: string[];
  mediaTypes: string[];
  createdAt: string;
}

export interface KeywordStat {
  word: string;
  count: number;
}

export interface ResourceStats {
  total: number;
  totalBytes: number;
  byType: Record<string, number>;
  publicUrlCount: number;
}

export interface DailyStat {
  date: string;
  inbound: number;
  outbound: number;
  resources: number;
}

export interface ChatInsights {
  messages: ChatMessageRecord[];
  keywords: KeywordStat[];
  resources: ResourceStats;
  daily: DailyStat[];
  summary: string[];
  totals: {
    messages: number;
    inbound: number;
    outbound: number;
    users: number;
  };
}

const CHAT_INDEX_FILE = "chat-index.json";
const MAX_CHAT_RECORDS = 2000;

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "your", "you", "are",
  "我", "你", "他", "她", "它", "我们", "你们", "他们", "这个", "那个", "一个",
  "可以", "一下", "就是", "然后", "因为", "所以", "如果", "不是", "没有", "什么",
  "怎么", "为什么", "帮我", "请问", "收到", "保存", "本地",
]);

export function chatIndexPath(storageDir: string): string {
  return path.join(storageDir, CHAT_INDEX_FILE);
}

export function loadChatRecords(storageDir: string): ChatMessageRecord[] {
  const filePath = chatIndexPath(storageDir);
  if (!fs.existsSync(filePath)) return [];

  try {
    const records = JSON.parse(fs.readFileSync(filePath, "utf-8")) as ChatMessageRecord[];
    if (!Array.isArray(records)) return [];
    return records;
  } catch {
    return [];
  }
}

export async function appendChatRecord(
  storageDir: string,
  record: Omit<ChatMessageRecord, "id" | "createdAt"> & Partial<Pick<ChatMessageRecord, "id" | "createdAt">>,
): Promise<ChatMessageRecord> {
  await fs.promises.mkdir(storageDir, { recursive: true });
  const saved: ChatMessageRecord = {
    id: record.id ?? crypto.randomUUID(),
    userId: record.userId,
    direction: record.direction,
    text: record.text,
    agent: record.agent,
    contextToken: record.contextToken,
    messageType: record.messageType,
    mediaIds: record.mediaIds,
    mediaTypes: record.mediaTypes,
    createdAt: record.createdAt ?? new Date().toISOString(),
  };

  const records = loadChatRecords(storageDir);
  records.unshift(saved);
  await fs.promises.writeFile(
    chatIndexPath(storageDir),
    JSON.stringify(records.slice(0, MAX_CHAT_RECORDS), null, 2),
    "utf-8",
  );
  return saved;
}

export function buildChatInsights(storageDir: string): ChatInsights {
  const messages = loadChatRecords(storageDir);
  const mediaRecords = loadMediaRecords(storageDir);
  const inbound = messages.filter((item) => item.direction === "inbound").length;
  const outbound = messages.filter((item) => item.direction === "outbound").length;
  const users = new Set(messages.map((item) => item.userId)).size;
  const keywords = topKeywords(messages);
  const resources = resourceStats(mediaRecords);
  const daily = dailyStats(messages, mediaRecords);

  return {
    messages,
    keywords,
    resources,
    daily,
    summary: buildSummary(messages, keywords, resources),
    totals: {
      messages: messages.length,
      inbound,
      outbound,
      users,
    },
  };
}

function topKeywords(messages: ChatMessageRecord[]): KeywordStat[] {
  const counts = new Map<string, number>();

  for (const message of messages) {
    for (const word of tokenize(message.text)) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((left, right) => right.count - left.count || left.word.localeCompare(right.word))
    .slice(0, 30);
}

function tokenize(text: string): string[] {
  const normalized = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/file:\/\/\S+/g, " ")
    .toLowerCase();
  const matches = normalized.match(/[\p{Script=Han}A-Za-z0-9_]+/gu) ?? [];
  const words: string[] = [];

  for (const token of matches) {
    if (/^\d+$/.test(token)) continue;
    if (/^[a-z0-9_]+$/i.test(token)) {
      if (token.length >= 3 && !STOP_WORDS.has(token)) words.push(token);
      continue;
    }

    if (STOP_WORDS.has(token)) continue;
    if (token.length >= 2 && token.length <= 8) {
      words.push(token);
      continue;
    }

    for (let i = 0; i < token.length - 1; i++) {
      const slice = token.slice(i, i + 2);
      if (!STOP_WORDS.has(slice)) words.push(slice);
    }
  }

  return words;
}

function resourceStats(records: MediaRecord[]): ResourceStats {
  const byType: Record<string, number> = {};
  let totalBytes = 0;
  let publicUrlCount = 0;

  for (const record of records) {
    byType[record.type] = (byType[record.type] ?? 0) + 1;
    totalBytes += record.size;
    if (record.publicUrl) publicUrlCount++;
  }

  return {
    total: records.length,
    totalBytes,
    byType,
    publicUrlCount,
  };
}

function dailyStats(messages: ChatMessageRecord[], records: MediaRecord[]): DailyStat[] {
  const map = new Map<string, DailyStat>();

  function ensure(date: string): DailyStat {
    const existing = map.get(date);
    if (existing) return existing;
    const created = { date, inbound: 0, outbound: 0, resources: 0 };
    map.set(date, created);
    return created;
  }

  for (const message of messages) {
    const date = message.createdAt.slice(0, 10);
    const stat = ensure(date);
    if (message.direction === "inbound") stat.inbound++;
    else stat.outbound++;
  }

  for (const record of records) {
    ensure(record.createdAt.slice(0, 10)).resources++;
  }

  return [...map.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-14);
}

function buildSummary(
  messages: ChatMessageRecord[],
  keywords: KeywordStat[],
  resources: ResourceStats,
): string[] {
  if (!messages.length) {
    return ["还没有聊天记录，收到微信消息并产生回复后会开始分析。"];
  }

  const top = keywords.slice(0, 5).map((item) => item.word).join("、") || "暂无明显关键词";
  const latest = messages[0];
  const dominantResource = Object.entries(resources.byType)
    .sort((left, right) => right[1] - left[1])[0]?.[0];

  return [
    `当前共记录 ${messages.length} 条消息，最近一次对话发生在 ${new Date(latest.createdAt).toLocaleString()}.`,
    `近期高频词集中在：${top}.`,
    dominantResource
      ? `资源里最多的是 ${dominantResource}，累计保存 ${resources.total} 个媒体文件。`
      : "目前还没有保存媒体资源。",
  ];
}
