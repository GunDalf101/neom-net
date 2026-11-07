import { api } from "@/api/client";

export interface SheetFile {
  format: "neom-net/character";
  version: 1;
  exportedAt: string;
  character: Record<string, unknown>;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "character";

/** Downloads the server-side export of a character as a JSON file. */
export async function downloadSheet(characterId: string, name: string): Promise<void> {
  const data = await api.get<SheetFile>(`/characters/${characterId}/export`);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(name)}-${data.exportedAt.slice(0, 10)}.neom.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads and sanity-checks a sheet file before it is sent to the server (which validates it fully). */
export async function readSheetFile(file: File): Promise<SheetFile> {
  if (file.size > 2_000_000) throw new Error("File is too large to be a NEOM//NET sheet (max 2 MB)");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("Not a JSON file");
  }
  const f = parsed as Partial<SheetFile> | null;
  if (!f || f.format !== "neom-net/character" || f.version !== 1 || !f.character || typeof f.character !== "object") {
    throw new Error("Not a NEOM//NET character sheet (expected format neom-net/character v1)");
  }
  return f as SheetFile;
}
