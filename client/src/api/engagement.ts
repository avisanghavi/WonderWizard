/**
 * Typed fetch wrappers for gamification, notebook, and engagement endpoints.
 *
 * All endpoints are relative — the Vite dev server / reverse proxy forwards
 * `/api/*` to the Express backend.
 */

import type {
  XPStats,
  Streak,
  EarnedBadge,
  XPEvent,
  Badge,
  NotebookEntry,
} from '../../../shared/types';

// ---------- Response shapes ----------

export interface GamificationStatsResponse {
  stats: XPStats;
  streak: Streak;
  earnedBadges: EarnedBadge[];
  recentEvents: XPEvent[];
}

export interface AwardXPResponse {
  event: XPEvent;
  stats: XPStats;
  newBadges: EarnedBadge[];
}

export interface CheckInResponse {
  streak: Streak;
  xpAwarded: number;
  stats: XPStats;
}

// ---------- Helpers ----------

async function jsonRequest<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Request to ${url} failed with ${res.status}${body ? `: ${body}` : ''}`,
    );
  }
  return res.json() as Promise<T>;
}

// ---------- Gamification ----------

export async function fetchGamificationStats(
  childId: string,
): Promise<GamificationStatsResponse> {
  return jsonRequest<GamificationStatsResponse>(
    `/api/gamification/${encodeURIComponent(childId)}/stats`,
  );
}

export async function fetchBadgeCatalog(): Promise<Badge[]> {
  return jsonRequest<Badge[]>('/api/gamification/badges');
}

export async function awardXP(
  childId: string,
  type: string,
  metadata?: Record<string, string | number>,
): Promise<AwardXPResponse> {
  return jsonRequest<AwardXPResponse>(
    `/api/gamification/${encodeURIComponent(childId)}/award`,
    {
      method: 'POST',
      body: JSON.stringify({ type, metadata }),
    },
  );
}

export async function checkIn(childId: string): Promise<CheckInResponse> {
  return jsonRequest<CheckInResponse>(
    `/api/gamification/${encodeURIComponent(childId)}/checkin`,
    { method: 'POST' },
  );
}

// ---------- Lab Notebook ----------

export async function fetchNotebookEntries(
  childId: string,
): Promise<NotebookEntry[]> {
  return jsonRequest<NotebookEntry[]>(
    `/api/notebook/${encodeURIComponent(childId)}`,
  );
}

export async function fetchNotebookEntry(id: string): Promise<NotebookEntry> {
  return jsonRequest<NotebookEntry>(
    `/api/notebook/entry/${encodeURIComponent(id)}`,
  );
}

export type CreateNotebookEntryInput = Partial<NotebookEntry> & {
  childId: string;
  experimentTitle: string;
  experimentCategory: string;
  observation: string;
};

export async function createNotebookEntry(
  data: CreateNotebookEntryInput,
): Promise<NotebookEntry> {
  return jsonRequest<NotebookEntry>('/api/notebook', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateNotebookEntry(
  id: string,
  updates: Partial<NotebookEntry>,
): Promise<NotebookEntry> {
  return jsonRequest<NotebookEntry>(
    `/api/notebook/entry/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    },
  );
}

export async function deleteNotebookEntry(id: string): Promise<void> {
  const res = await fetch(`/api/notebook/entry/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Failed to delete notebook entry: ${res.status}`);
  }
}

export async function uploadNotebookPhoto(
  id: string,
  file: File,
): Promise<NotebookEntry> {
  const formData = new FormData();
  formData.append('photo', file);

  const res = await fetch(
    `/api/notebook/entry/${encodeURIComponent(id)}/photo`,
    {
      method: 'POST',
      body: formData,
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Photo upload failed with ${res.status}${body ? `: ${body}` : ''}`,
    );
  }
  return res.json() as Promise<NotebookEntry>;
}
