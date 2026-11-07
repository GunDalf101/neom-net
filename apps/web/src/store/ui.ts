import { create } from "zustand";

export interface Toast {
  id: number;
  kind: "info" | "success" | "error" | "roll";
  title: string;
  body?: string;
}

interface UiState {
  toasts: Toast[];
  pushToast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
  /** Character page mobile tab */
  mobileTab: "sheet" | "core" | "combat";
  setMobileTab: (t: UiState["mobileTab"]) => void;
  /** Dice panel pending situational modifier */
  rollMode: "normal" | "advantage" | "disadvantage";
  setRollMode: (m: UiState["rollMode"]) => void;
  rollVisibility: "public" | "private" | "whisper";
  setRollVisibility: (v: UiState["rollVisibility"]) => void;
  lastCharacterByCampaign: Record<string, string>;
  rememberCharacter: (campaignId: string, characterId: string) => void;
}

let toastId = 1;

function loadRemembered(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem("neom.lastCharacter") ?? "{}");
  } catch {
    return {};
  }
}

export const useUi = create<UiState>((set) => ({
  toasts: [],
  pushToast: (t) => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.kind === "error" ? 7000 : 4500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  mobileTab: "sheet",
  setMobileTab: (mobileTab) => set({ mobileTab }),
  rollMode: "normal",
  setRollMode: (rollMode) => set({ rollMode }),
  rollVisibility: "public",
  setRollVisibility: (rollVisibility) => set({ rollVisibility }),
  lastCharacterByCampaign: loadRemembered(),
  rememberCharacter: (campaignId, characterId) =>
    set((s) => {
      const next = { ...s.lastCharacterByCampaign, [campaignId]: characterId };
      try {
        localStorage.setItem("neom.lastCharacter", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return { lastCharacterByCampaign: next };
    }),
}));

export function toast(kind: Toast["kind"], title: string, body?: string) {
  useUi.getState().pushToast({ kind, title, body });
}
