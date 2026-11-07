import type {
  AbilityDto,
  AbilityInput,
  AddParticipantInput,
  ApplyConditionInput,
  CampaignDto,
  CampaignEventDto,
  CampaignSummaryDto,
  CharacterSummaryDto,
  CharacterView,
  ConditionDefinitionDto,
  ConditionDefinitionInput,
  CreateCharacterInput,
  DiceRollDto,
  DmDashboardDto,
  EncounterAction,
  EncounterDto,
  GrantItemInput,
  HpActionInput,
  ItemActionInput,
  ItemDefinitionDto,
  ItemDefinitionInput,
  JournalEntryDto,
  JournalInput,
  LiveSessionDto,
  MessageDto,
  MissionDto,
  MissionInput,
  NpcDto,
  NpcInput,
  OverrideDto,
  OverrideInput,
  PendingActionDto,
  RollRequestDto,
  RollRequestInput,
  RuleDefinitionDto,
  RuleDefinitionInput,
  RuleTraceDto,
  RuleVersionDto,
  SimulateRuleInput,
  SkillTreeDto,
  SkillTreeInput,
  UpdateCampaignInput,
  UpdateCharacterInput,
  UserDto,
  SharedSheetDto,
  RuleExecutionResult,
  GraphValidation,
  RuleCharacterState,
} from "@neom/shared";
import { useMutation, useQuery, useQueryClient, type UseMutationOptions } from "@tanstack/react-query";
import { api, errorMessage } from "./client";
import { subscribePush, unsubscribePush } from "@/lib/push";
import { toast } from "@/store/ui";

export const qk = {
  me: ["me"] as const,
  campaigns: ["campaigns"] as const,
  campaign: (id: string) => ["campaign", id] as const,
  characters: (cid: string) => ["characters", cid] as const,
  character: (id: string) => ["character", id] as const,
  events: (cid: string) => ["events", cid] as const,
  rolls: (cid: string) => ["rolls", cid] as const,
  items: (cid: string) => ["items", cid] as const,
  conditions: (cid: string) => ["conditions", cid] as const,
  rules: (cid: string) => ["rules", cid] as const,
  ruleVersions: (cid: string, rid: string) => ["ruleVersions", cid, rid] as const,
  traces: (cid: string) => ["traces", cid] as const,
  pending: (cid: string) => ["pending", cid] as const,
  encounters: (cid: string) => ["encounters", cid] as const,
  encounter: (cid: string, eid: string) => ["encounter", cid, eid] as const,
  npcs: (cid: string) => ["npcs", cid] as const,
  missions: (cid: string) => ["missions", cid] as const,
  journal: (cid: string) => ["journal", cid] as const,
  skillTrees: (cid: string) => ["skillTrees", cid] as const,
  abilities: (cid: string) => ["abilities", cid] as const,
  dashboard: (cid: string) => ["dashboard", cid] as const,
  rollRequests: (cid: string) => ["rollRequests", cid] as const,
  messages: (cid: string) => ["messages", cid] as const,
  session: (cid: string) => ["session", cid] as const,
  overrides: (cid: string) => ["overrides", cid] as const,
  pushConfig: ["push", "config"] as const,
  shared: (token: string) => ["shared", token] as const,
};

function withToast<TData, TVars>(opts?: UseMutationOptions<TData, Error, TVars>): UseMutationOptions<TData, Error, TVars> {
  return {
    ...opts,
    onError: (...args) => {
      toast("error", "Operation failed", errorMessage(args[0]));
      (opts?.onError as ((...a: unknown[]) => unknown) | undefined)?.(...args);
    },
  };
}

// ---------- Auth ----------
export const useMe = () =>
  useQuery({
    queryKey: qk.me,
    queryFn: async () => (await api.get<{ user: UserDto }>("/auth/me")).user,
    retry: false,
    staleTime: 5 * 60_000,
  });

export function useLogin() {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: (body: { identifier: string; password: string }) => api.post<{ user: UserDto }>("/auth/login", body),
      onSuccess: (d) => qc.setQueryData(qk.me, d.user),
    }),
  );
}
export function useRegister() {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: (body: { email: string; username?: string; password: string }) => api.post<{ user: UserDto }>("/auth/register", body),
      onSuccess: (d) => qc.setQueryData(qk.me, d.user),
    }),
  );
}
export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => {
      qc.clear();
    },
  });
}

// ---------- Campaigns ----------
export const useCampaigns = () => useQuery({ queryKey: qk.campaigns, queryFn: () => api.get<CampaignSummaryDto[]>("/campaigns") });
export const useCampaign = (id: string | undefined) =>
  useQuery({ queryKey: qk.campaign(id ?? ""), queryFn: () => api.get<CampaignDto>(`/campaigns/${id}`), enabled: Boolean(id) });

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation(withToast({ mutationFn: (body: { name: string; description: string }) => api.post<CampaignDto>("/campaigns", body), onSuccess: () => qc.invalidateQueries({ queryKey: qk.campaigns }) }));
}
export function useJoinCampaign() {
  const qc = useQueryClient();
  return useMutation(withToast({ mutationFn: (inviteCode: string) => api.post<CampaignDto>("/campaigns/join", { inviteCode }), onSuccess: () => qc.invalidateQueries({ queryKey: qk.campaigns }) }));
}
export function useUpdateCampaign(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: (body: UpdateCampaignInput) => api.patch<CampaignDto>(`/campaigns/${cid}`, body),
      onSuccess: (d) => {
        qc.setQueryData(qk.campaign(cid), d);
        toast("success", "Campaign updated");
      },
    }),
  );
}
export function useRegenerateInvite(cid: string) {
  const qc = useQueryClient();
  return useMutation(withToast({ mutationFn: () => api.post<CampaignDto>(`/campaigns/${cid}/invite/regenerate`), onSuccess: (d) => qc.setQueryData(qk.campaign(cid), d) }));
}

export const useSession = (cid: string) => useQuery({ queryKey: qk.session(cid), queryFn: () => api.get<LiveSessionDto | null>(`/campaigns/${cid}/session`) });
export function useSessionControl(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: (op: "start" | "end") => api.post(`/campaigns/${cid}/session/${op}`),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: qk.session(cid) });
        qc.invalidateQueries({ queryKey: qk.dashboard(cid) });
        qc.invalidateQueries({ queryKey: qk.campaign(cid) });
      },
    }),
  );
}

// ---------- Characters ----------
export const useCharacters = (cid: string | undefined) =>
  useQuery({ queryKey: qk.characters(cid ?? ""), queryFn: () => api.get<CharacterSummaryDto[]>(`/campaigns/${cid}/characters`), enabled: Boolean(cid) });
export const useCharacter = (id: string | undefined) =>
  useQuery({ queryKey: qk.character(id ?? ""), queryFn: () => api.get<CharacterView>(`/characters/${id}`), enabled: Boolean(id) });

function characterMutation<TVars>(id: string, fn: (vars: TVars) => Promise<CharacterView>, successMsg?: string) {
  return function useIt() {
    const qc = useQueryClient();
    return useMutation(
      withToast({
        mutationFn: fn,
        onSuccess: (view) => {
          qc.setQueryData(qk.character(id), view);
          qc.invalidateQueries({ queryKey: qk.characters(view.character.campaignId) });
          if (successMsg) toast("success", successMsg);
        },
      }),
    );
  };
}

export function useCreateCharacter() {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: (body: CreateCharacterInput) => api.post<CharacterView>("/characters", body),
      onSuccess: (v) => {
        qc.setQueryData(qk.character(v.character.id), v);
        qc.invalidateQueries({ queryKey: qk.characters(v.character.campaignId) });
      },
    }),
  );
}
export const useUpdateCharacter = (id: string) => characterMutation<UpdateCharacterInput>(id, (body) => api.patch(`/characters/${id}`, body))();
export const useHpAction = (id: string) => characterMutation<HpActionInput>(id, (body) => api.post(`/characters/${id}/hp`, body))();
export const useApplyCondition = (id: string) => characterMutation<ApplyConditionInput>(id, (body) => api.post(`/characters/${id}/conditions`, body))();
export const useRemoveCondition = (id: string) => characterMutation<string>(id, (condId) => api.delete(`/characters/${id}/conditions/${condId}`))();
export const useItemAction = (id: string) => characterMutation<{ itemId: string; action: ItemActionInput }>(id, ({ itemId, action }) => api.post(`/characters/${id}/items/${itemId}/action`, action))();
export const useUnlockNode = (id: string) => characterMutation<string>(id, (nodeId) => api.post(`/characters/${id}/unlock`, { nodeId }), "Node unlocked")();
export const useUseAbility = (id: string) => characterMutation<string>(id, (abilityId) => api.post(`/characters/${id}/abilities/${abilityId}/use`))();
export const useClearEffect = (id: string) => characterMutation<string>(id, (effectId) => api.delete(`/characters/${id}/effects/${effectId}`))();
export const useResetCharacter = (id: string) => characterMutation<void>(id, () => api.post(`/characters/${id}/reset`, { confirm: true }), "Character reset")();
/** DM hands the sheet to another campaign member (ownership transfer + notification). */
export const useAssignCharacter = (id: string) => characterMutation<string>(id, (userId) => api.post(`/characters/${id}/assign`, { userId }), "Sheet sent")();
/** Portrait-only update; works for owners in DM-controlled mode when the campaign allows it. */
export const useSetPortrait = (id: string) => characterMutation<string | null>(id, (portraitUrl) => api.put(`/characters/${id}/portrait`, { portraitUrl }), "Portrait updated")();
export const useShareLink = (id: string) => characterMutation<{ rotate?: boolean }>(id, (body) => api.post(`/characters/${id}/share`, body))();
export const useRevokeShareLink = (id: string) => characterMutation<void>(id, () => api.delete(`/characters/${id}/share`), "Share link revoked")();
export const useSharedSheet = (token: string) => useQuery({ queryKey: qk.shared(token), queryFn: () => api.get<SharedSheetDto>(`/shared/${token}`), enabled: Boolean(token) });

// ---------- Push notifications ----------
export interface PushConfigDto {
  enabled: boolean;
  publicKey: string | null;
  devices: number;
}
export const usePushConfig = () => useQuery({ queryKey: qk.pushConfig, queryFn: () => api.get<PushConfigDto>("/push/config"), staleTime: 60_000 });
export function usePushSubscribe() {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: async (publicKey: string) => {
        const sub = await subscribePush(publicKey);
        return api.post<{ ok: true; devices: number }>("/push/subscribe", sub);
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: qk.pushConfig });
        toast("success", "Notifications enabled on this device");
      },
    }),
  );
}
export function usePushUnsubscribe() {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: async () => {
        const endpoint = await unsubscribePush();
        if (endpoint) await api.post("/push/unsubscribe", { endpoint });
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: qk.pushConfig });
        toast("info", "Notifications turned off on this device");
      },
    }),
  );
}
export function usePushTest() {
  return useMutation(
    withToast({
      mutationFn: () => api.post<{ delivered: number }>("/push/test"),
      onSuccess: (d) => toast(d.delivered ? "success" : "error", d.delivered ? `Test notification sent to ${d.delivered} device${d.delivered === 1 ? "" : "s"}` : "No device received it", d.delivered ? undefined : "Re-enable notifications on this device and try again."),
    }),
  );
}

export const useImportCharacter = (id: string) => characterMutation<unknown>(id, (payload) => api.post(`/characters/${id}/import`, payload), "Character imported")();

export function useDeleteCharacter() {
  const qc = useQueryClient();
  return useMutation(withToast({ mutationFn: ({ id }: { id: string; campaignId: string }) => api.delete(`/characters/${id}`), onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: qk.characters(v.campaignId) }) }));
}

// ---------- Dice ----------
export const useRolls = (cid: string) => useQuery({ queryKey: qk.rolls(cid), queryFn: () => api.get<DiceRollDto[]>(`/campaigns/${cid}/rolls?limit=40`) });
export function useRoll(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: (body: Partial<RollRequestInput> & { category: RollRequestInput["category"] }) => api.post<DiceRollDto>(`/campaigns/${cid}/rolls`, body),
      onSuccess: (roll) => {
        qc.setQueryData<DiceRollDto[]>(qk.rolls(cid), (old) => (old?.some((r) => r.id === roll.id) ? old : [roll, ...(old ?? [])].slice(0, 60)));
        qc.invalidateQueries({ queryKey: qk.rollRequests(cid) });
        const nat = roll.result.isNat20 ? "  NAT 20" : roll.result.isNat1 ? "  NAT 1" : "";
        toast("roll", `${roll.label}: ${roll.total}${nat}`, roll.result.expression);
      },
    }),
  );
}

// ---------- Events ----------
export const useEvents = (cid: string, characterId?: string) =>
  useQuery({
    queryKey: characterId ? [...qk.events(cid), characterId] : qk.events(cid),
    queryFn: () => api.get<CampaignEventDto[]>(`/campaigns/${cid}/events?limit=80${characterId ? `&characterId=${characterId}` : ""}`),
  });

// ---------- Content ----------
export const useItemDefinitions = (cid: string) => useQuery({ queryKey: qk.items(cid), queryFn: () => api.get<ItemDefinitionDto[]>(`/campaigns/${cid}/items`) });
export const useConditionDefinitions = (cid: string) => useQuery({ queryKey: qk.conditions(cid), queryFn: () => api.get<ConditionDefinitionDto[]>(`/campaigns/${cid}/conditions`) });
export const useSkillTrees = (cid: string) => useQuery({ queryKey: qk.skillTrees(cid), queryFn: () => api.get<SkillTreeDto[]>(`/campaigns/${cid}/skill-trees`) });
export const useAbilities = (cid: string) => useQuery({ queryKey: qk.abilities(cid), queryFn: () => api.get<AbilityDto[]>(`/campaigns/${cid}/abilities`) });

export function useSaveItemDefinition(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: ({ id, body }: { id?: string; body: ItemDefinitionInput }) => (id ? api.put<ItemDefinitionDto>(`/campaigns/${cid}/items/${id}`, body) : api.post<ItemDefinitionDto>(`/campaigns/${cid}/items`, body)),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: qk.items(cid) });
        toast("success", "Item definition saved");
      },
    }),
  );
}
export function useDeleteItemDefinition(cid: string) {
  const qc = useQueryClient();
  return useMutation(withToast({ mutationFn: (id: string) => api.delete(`/campaigns/${cid}/items/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: qk.items(cid) }) }));
}
export function useGrantItem(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: (body: GrantItemInput) => api.post<CharacterView>(`/campaigns/${cid}/items/grant`, body),
      onSuccess: (v) => {
        qc.setQueryData(qk.character(v.character.id), v);
        toast("success", `Granted to ${v.character.name}`);
      },
    }),
  );
}
export function useSaveCondition(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: ({ id, body }: { id?: string; body: ConditionDefinitionInput }) => (id ? api.put(`/campaigns/${cid}/conditions/${id}`, body) : api.post(`/campaigns/${cid}/conditions`, body)),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: qk.conditions(cid) });
        toast("success", "Condition saved");
      },
    }),
  );
}
export function useDeleteCondition(cid: string) {
  const qc = useQueryClient();
  return useMutation(withToast({ mutationFn: (id: string) => api.delete(`/campaigns/${cid}/conditions/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: qk.conditions(cid) }) }));
}
export function useSaveSkillTree(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: (body: SkillTreeInput) => api.put<SkillTreeDto>(`/campaigns/${cid}/skill-trees`, body),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: qk.skillTrees(cid) });
        toast("success", "Skill tree saved");
      },
    }),
  );
}
export function useSaveAbility(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: ({ id, body }: { id?: string; body: AbilityInput }) => (id ? api.put(`/campaigns/${cid}/abilities/${id}`, body) : api.post(`/campaigns/${cid}/abilities`, body)),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: qk.abilities(cid) });
        toast("success", "Ability saved");
      },
    }),
  );
}
export function useDeleteAbility(cid: string) {
  const qc = useQueryClient();
  return useMutation(withToast({ mutationFn: (id: string) => api.delete(`/campaigns/${cid}/abilities/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: qk.abilities(cid) }) }));
}

// ---------- Rules ----------
export const useRules = (cid: string) => useQuery({ queryKey: qk.rules(cid), queryFn: () => api.get<RuleDefinitionDto[]>(`/campaigns/${cid}/rules`) });
export const useRuleVersions = (cid: string, rid: string) => useQuery({ queryKey: qk.ruleVersions(cid, rid), queryFn: () => api.get<RuleVersionDto[]>(`/campaigns/${cid}/rules/${rid}/versions`) });
export const useTraces = (cid: string) => useQuery({ queryKey: qk.traces(cid), queryFn: () => api.get<RuleTraceDto[]>(`/campaigns/${cid}/traces?limit=60`) });
export const usePending = (cid: string) => useQuery({ queryKey: qk.pending(cid), queryFn: () => api.get<PendingActionDto[]>(`/campaigns/${cid}/pending`) });

export function useSaveRule(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: ({ id, body }: { id?: string; body: Partial<RuleDefinitionInput> }) => (id ? api.put<RuleDefinitionDto>(`/campaigns/${cid}/rules/${id}`, body) : api.post<RuleDefinitionDto>(`/campaigns/${cid}/rules`, body)),
      onSuccess: () => qc.invalidateQueries({ queryKey: qk.rules(cid) }),
    }),
  );
}
export function useRuleOp(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: ({ id, op, version }: { id: string; op: "publish" | "duplicate" | "delete" | "restore"; version?: number }) => {
        if (op === "delete") return api.delete(`/campaigns/${cid}/rules/${id}`);
        if (op === "restore") return api.post(`/campaigns/${cid}/rules/${id}/versions/${version}/restore`);
        return api.post<RuleDefinitionDto>(`/campaigns/${cid}/rules/${id}/${op}`);
      },
      onSuccess: (_d, v) => {
        qc.invalidateQueries({ queryKey: qk.rules(cid) });
        qc.invalidateQueries({ queryKey: qk.ruleVersions(cid, v.id) });
        toast("success", v.op === "publish" ? "Rule published" : v.op === "duplicate" ? "Rule duplicated" : v.op === "restore" ? "Version restored to draft" : "Rule deleted");
      },
    }),
  );
}
export function useSimulateRule(cid: string) {
  return useMutation(withToast({ mutationFn: (body: SimulateRuleInput) => api.post<{ validation: GraphValidation; result: RuleExecutionResult | null; state: RuleCharacterState }>(`/campaigns/${cid}/rules/simulate`, body) }));
}
export function useResolvePending(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: ({ id, decision, note }: { id: string; decision: "approve" | "reject"; note?: string }) => api.post(`/campaigns/${cid}/pending/${id}/resolve`, { decision, note }),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: qk.pending(cid) });
        qc.invalidateQueries({ queryKey: qk.dashboard(cid) });
      },
    }),
  );
}
export function useTriggerRule(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: (body: { characterId: string; ruleId: string }) => api.post<RuleTraceDto[]>(`/campaigns/${cid}/rules/trigger`, body),
      onSuccess: (traces) => {
        qc.invalidateQueries({ queryKey: qk.traces(cid) });
        const t = traces[0];
        toast(t?.result.fired ? "success" : "info", t?.result.fired ? "Rule fired" : "Rule did not fire", t ? `${t.result.trace.length} trace steps` : undefined);
      },
    }),
  );
}

// ---------- DM ----------
export const useDashboard = (cid: string) => useQuery({ queryKey: qk.dashboard(cid), queryFn: () => api.get<DmDashboardDto>(`/campaigns/${cid}/dashboard`), refetchInterval: 30_000 });
export const useOverrides = (cid: string) => useQuery({ queryKey: qk.overrides(cid), queryFn: () => api.get<OverrideDto[]>(`/campaigns/${cid}/overrides`) });
export function useCreateOverride(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: (body: OverrideInput) => api.post<OverrideDto>(`/campaigns/${cid}/overrides`, body),
      onSuccess: (o) => {
        qc.invalidateQueries({ queryKey: qk.overrides(cid) });
        qc.invalidateQueries({ queryKey: qk.character(o.characterId) });
        toast("success", "Override applied");
      },
    }),
  );
}
export function useRevokeOverride(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: (id: string) => api.delete<OverrideDto>(`/campaigns/${cid}/overrides/${id}`),
      onSuccess: (o) => {
        qc.invalidateQueries({ queryKey: qk.overrides(cid) });
        qc.invalidateQueries({ queryKey: qk.character(o.characterId) });
      },
    }),
  );
}
export function useDmGrant(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: (body: { characterId: string; resource: "xp" | "progressionPoints" | "credits"; amount: number; note?: string }) => api.post(`/campaigns/${cid}/dm/grant`, body),
      onSuccess: (_d, v) => {
        qc.invalidateQueries({ queryKey: qk.character(v.characterId) });
        qc.invalidateQueries({ queryKey: qk.dashboard(cid) });
        toast("success", "Granted");
      },
    }),
  );
}
export const useMessages = (cid: string) => useQuery({ queryKey: qk.messages(cid), queryFn: () => api.get<MessageDto[]>(`/campaigns/${cid}/messages`) });
export function useSendMessage(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: (body: { characterId?: string; userId?: string; message: string; kind: "whisper" | "reveal" | "broadcast" }) => api.post<MessageDto>(`/campaigns/${cid}/messages`, body),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: qk.messages(cid) });
        toast("success", "Sent");
      },
    }),
  );
}
export const useRollRequests = (cid: string) => useQuery({ queryKey: qk.rollRequests(cid), queryFn: () => api.get<RollRequestDto[]>(`/campaigns/${cid}/roll-requests`) });
export function useCreateRollRequest(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: (body: { characterId: string; target?: string; expression?: string; label: string; dc?: number; visibility?: "public" | "private" | "whisper" }) => api.post<RollRequestDto>(`/campaigns/${cid}/roll-requests`, body),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: qk.rollRequests(cid) });
        toast("success", "Roll requested");
      },
    }),
  );
}
export function useCancelRollRequest(cid: string) {
  const qc = useQueryClient();
  return useMutation(withToast({ mutationFn: (id: string) => api.delete(`/campaigns/${cid}/roll-requests/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: qk.rollRequests(cid) }) }));
}

// ---------- Encounters ----------
export const useEncounters = (cid: string) => useQuery({ queryKey: qk.encounters(cid), queryFn: () => api.get<EncounterDto[]>(`/campaigns/${cid}/encounters`) });
export const useEncounter = (cid: string, eid: string | null | undefined) =>
  useQuery({ queryKey: qk.encounter(cid, eid ?? ""), queryFn: () => api.get<EncounterDto>(`/campaigns/${cid}/encounters/${eid}`), enabled: Boolean(eid) });
export function useCreateEncounter(cid: string) {
  const qc = useQueryClient();
  return useMutation(withToast({ mutationFn: (body: { name: string; description: string }) => api.post<EncounterDto>(`/campaigns/${cid}/encounters`, body), onSuccess: () => qc.invalidateQueries({ queryKey: qk.encounters(cid) }) }));
}
export function useEncounterAction(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: ({ eid, action }: { eid: string; action: EncounterAction }) => api.post<EncounterDto>(`/campaigns/${cid}/encounters/${eid}/action`, action),
      onSuccess: (e) => {
        qc.setQueryData(qk.encounter(cid, e.id), e);
        qc.invalidateQueries({ queryKey: qk.encounters(cid) });
        qc.invalidateQueries({ queryKey: qk.campaign(cid) });
        qc.invalidateQueries({ queryKey: qk.dashboard(cid) });
      },
    }),
  );
}
export function useAddParticipant(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: ({ eid, body }: { eid: string; body: AddParticipantInput }) => api.post<EncounterDto>(`/campaigns/${cid}/encounters/${eid}/participants`, body),
      onSuccess: (e) => {
        qc.setQueryData(qk.encounter(cid, e.id), e);
        qc.invalidateQueries({ queryKey: qk.encounters(cid) });
      },
    }),
  );
}
export function useDeleteEncounter(cid: string) {
  const qc = useQueryClient();
  return useMutation(withToast({ mutationFn: (eid: string) => api.delete(`/campaigns/${cid}/encounters/${eid}`), onSuccess: () => qc.invalidateQueries({ queryKey: qk.encounters(cid) }) }));
}

// ---------- Story ----------
export const useNpcs = (cid: string) => useQuery({ queryKey: qk.npcs(cid), queryFn: () => api.get<NpcDto[]>(`/campaigns/${cid}/npcs`) });
export function useSaveNpc(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: ({ id, body }: { id?: string; body: NpcInput }) => (id ? api.put<NpcDto>(`/campaigns/${cid}/npcs/${id}`, body) : api.post<NpcDto>(`/campaigns/${cid}/npcs`, body)),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: qk.npcs(cid) });
        toast("success", "NPC saved");
      },
    }),
  );
}
export function useDeleteNpc(cid: string) {
  const qc = useQueryClient();
  return useMutation(withToast({ mutationFn: (id: string) => api.delete(`/campaigns/${cid}/npcs/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: qk.npcs(cid) }) }));
}
export const useMissions = (cid: string) => useQuery({ queryKey: qk.missions(cid), queryFn: () => api.get<MissionDto[]>(`/campaigns/${cid}/missions`) });
export function useSaveMission(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: ({ id, body }: { id?: string; body: MissionInput }) => (id ? api.put<MissionDto>(`/campaigns/${cid}/missions/${id}`, body) : api.post<MissionDto>(`/campaigns/${cid}/missions`, body)),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: qk.missions(cid) });
        toast("success", "Mission saved");
      },
    }),
  );
}
export function useMissionOp(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: ({ id, op, objectiveId, done }: { id: string; op: "complete" | "delete" | "objective"; objectiveId?: string; done?: boolean }) => {
        if (op === "delete") return api.delete(`/campaigns/${cid}/missions/${id}`);
        if (op === "objective") return api.post(`/campaigns/${cid}/missions/${id}/objectives/${objectiveId}`, { done });
        return api.post(`/campaigns/${cid}/missions/${id}/complete`);
      },
      onSuccess: (_d, v) => {
        qc.invalidateQueries({ queryKey: qk.missions(cid) });
        if (v.op === "complete") toast("success", "Mission completed — rewards granted");
      },
    }),
  );
}
export const useJournal = (cid: string) => useQuery({ queryKey: qk.journal(cid), queryFn: () => api.get<JournalEntryDto[]>(`/campaigns/${cid}/journal`) });
export function useSaveJournal(cid: string) {
  const qc = useQueryClient();
  return useMutation(
    withToast({
      mutationFn: ({ id, body }: { id?: string; body: JournalInput }) => (id ? api.put<JournalEntryDto>(`/campaigns/${cid}/journal/${id}`, body) : api.post<JournalEntryDto>(`/campaigns/${cid}/journal`, body)),
      onSuccess: () => qc.invalidateQueries({ queryKey: qk.journal(cid) }),
    }),
  );
}
export function useDeleteJournal(cid: string) {
  const qc = useQueryClient();
  return useMutation(withToast({ mutationFn: (id: string) => api.delete(`/campaigns/${cid}/journal/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: qk.journal(cid) }) }));
}
