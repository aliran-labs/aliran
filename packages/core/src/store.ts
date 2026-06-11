import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  DbShape,
  DelegationRecord,
  TransactionRecord,
  TaskRecord,
  ReceiptRecord,
  ActivityEvent,
  AgentRunRecord,
} from './types';

/**
 * Demo-grade persistence: a single JSON file at the repo root (aliran.db.json).
 * Synchronous read/modify/write — fine for a single-process demo, zero native
 * deps (important on Windows), trivially inspectable, and easy to seed/reset.
 * If concurrency ever matters we swap this module for better-sqlite3; the
 * surface below is intentionally repository-shaped to make that swap local.
 */

const DB_PATH = resolve(process.cwd(), findRoot(), 'aliran.db.json');

function findRoot(): string {
  // Walk up to the dir containing pnpm-workspace.yaml so every app/package
  // shares one db file regardless of its cwd.
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const empty: DbShape = {
  delegations: [],
  transactions: [],
  tasks: [],
  receipts: [],
  activity: [],
  runs: [],
};

function read(): DbShape {
  if (!existsSync(DB_PATH)) return structuredClone(empty);
  try {
    const raw = readFileSync(DB_PATH, 'utf8');
    return { ...structuredClone(empty), ...(JSON.parse(raw) as Partial<DbShape>) };
  } catch {
    return structuredClone(empty);
  }
}

function write(db: DbShape): void {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export const store = {
  path: DB_PATH,
  read,
  write,

  reset(): void {
    write(structuredClone(empty));
  },

  // --- delegations ---------------------------------------------------------
  addDelegation(d: Omit<DelegationRecord, 'id' | 'createdAt'>): DelegationRecord {
    const db = read();
    const rec: DelegationRecord = { ...d, id: randomUUID(), createdAt: Date.now() };
    db.delegations.push(rec);
    write(db);
    return rec;
  },
  updateDelegation(id: string, patch: Partial<DelegationRecord>): void {
    const db = read();
    const i = db.delegations.findIndex((x) => x.id === id);
    if (i >= 0) {
      db.delegations[i] = { ...db.delegations[i]!, ...patch };
      write(db);
    }
  },

  // --- transactions --------------------------------------------------------
  addTransaction(t: Omit<TransactionRecord, 'id' | 'createdAt'>): TransactionRecord {
    const db = read();
    const rec: TransactionRecord = { ...t, id: randomUUID(), createdAt: Date.now() };
    db.transactions.push(rec);
    write(db);
    return rec;
  },

  // --- tasks ---------------------------------------------------------------
  addTask(t: Omit<TaskRecord, 'id' | 'createdAt'>): TaskRecord {
    const db = read();
    const rec: TaskRecord = { ...t, id: randomUUID(), createdAt: Date.now() };
    db.tasks.push(rec);
    write(db);
    return rec;
  },
  updateTask(id: string, patch: Partial<TaskRecord>): void {
    const db = read();
    const i = db.tasks.findIndex((x) => x.id === id);
    if (i >= 0) {
      db.tasks[i] = { ...db.tasks[i]!, ...patch };
      write(db);
    }
  },

  // --- receipts ------------------------------------------------------------
  addReceipt(r: Omit<ReceiptRecord, 'id' | 'createdAt'>): ReceiptRecord {
    const db = read();
    const rec: ReceiptRecord = { ...r, id: randomUUID(), createdAt: Date.now() };
    db.receipts.push(rec);
    write(db);
    return rec;
  },

  // --- activity feed -------------------------------------------------------
  emit(e: Omit<ActivityEvent, 'id' | 'timestamp'>): ActivityEvent {
    const db = read();
    const rec: ActivityEvent = { ...e, id: randomUUID(), timestamp: Date.now() };
    db.activity.push(rec);
    write(db);
    return rec;
  },

  // --- runs ----------------------------------------------------------------
  addRun(r: Omit<AgentRunRecord, 'id' | 'createdAt'>): AgentRunRecord {
    const db = read();
    const rec: AgentRunRecord = { ...r, id: randomUUID(), createdAt: Date.now() };
    db.runs.push(rec);
    write(db);
    return rec;
  },
  updateRun(id: string, patch: Partial<AgentRunRecord>): void {
    const db = read();
    const i = db.runs.findIndex((x) => x.id === id);
    if (i >= 0) {
      db.runs[i] = { ...db.runs[i]!, ...patch };
      write(db);
    }
  },
};
