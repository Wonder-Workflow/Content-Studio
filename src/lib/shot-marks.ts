export function parseShotMarks(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const ids = parsed.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
    return [...new Set(ids)].sort();
  } catch {
    return [];
  }
}

export function serializeShotMarks(ids: Iterable<string>): string {
  const unique = [...new Set(ids)].filter((id) => id.length > 0).sort();
  return JSON.stringify(unique);
}

export function toggleShotMark(raw: string, id: string): string {
  const marks = new Set(parseShotMarks(raw));
  if (marks.has(id)) marks.delete(id);
  else marks.add(id);
  return serializeShotMarks(marks);
}

export function clearShotMarks(raw: string, ids: readonly string[]): string {
  const drop = new Set(ids);
  return serializeShotMarks(parseShotMarks(raw).filter((id) => !drop.has(id)));
}
