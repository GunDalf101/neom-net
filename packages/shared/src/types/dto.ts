import type {
  AttributeKey,
  AugmentationSlot,
  AutomationMode,
  DamageType,
  EquipmentSlot,
  ItemCategory,
  ItemStatus,
  Rarity,
  RollCategory,
  RollVisibility,
  SkillKey,
  SpecialSkillKey,
} from "../constants.js";
import type { CampaignRuleSettings, DerivedStats } from "../mechanics/derived.js";
import type { RollResult } from "../mechanics/dice.js";
import type { ProficiencyMultiplier } from "../mechanics/formulas.js";
import type { InstantEffect, PassiveEffect, Requirement } from "../rules/effects.js";
import type { RuleExecutionResult } from "../rules/engine.js";
import type { GraphValidation, RuleGraph } from "../rules/graph.js";

export type CampaignRole = "DM" | "PLAYER";

export interface UserDto {
  id: string;
  email: string;
  username: string;
  createdAt: string;
}

export interface CampaignMemberDto {
  userId: string;
  username: string;
  role: CampaignRole;
  joinedAt: string;
  online?: boolean;
}

export interface CampaignSummaryDto {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  role: CampaignRole;
  memberCount: number;
  characterCount: number;
  createdAt: string;
  liveSessionId: string | null;
}

export interface CampaignDto extends CampaignSummaryDto {
  settings: CampaignRuleSettings;
  members: CampaignMemberDto[];
  /** Only sent to the DM. */
  inviteCode?: string;
  activeEncounterId: string | null;
}

export interface CharacterCore {
  id: string;
  campaignId: string;
  ownerUserId: string;
  name: string;
  species: string;
  characterClass: string;
  subclass: string;
  level: number;
  xp: number;
  faction: string;
  alignment: string;
  background: string;
  biography: string;
  portraitUrl: string | null;
  attributes: Record<AttributeKey, number>;
  saveProficiencies: Record<AttributeKey, boolean>;
  skills: Record<SkillKey, ProficiencyMultiplier>;
  specialSkills: Record<SpecialSkillKey, { rank: number; proficiency: ProficiencyMultiplier }>;
  hpCurrent: number;
  hpMaxBase: number;
  hpTemp: number;
  baseSpeed: number | null;
  acBase: number;
  acBonus: number;
  hitDieSize: number;
  hitDiceUsed: number;
  inspiration: boolean;
  deathSaveSuccess: number;
  deathSaveFailure: number;
  credits: number;
  progressionPoints: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ItemDefinitionDto {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  icon: string;
  imageUrl: string | null;
  category: ItemCategory;
  rarity: Rarity;
  price: number;
  weight: number;
  requirements: Requirement[];
  effects: PassiveEffect[];
  useEffects: InstantEffect[];
  augmentationSlot: AugmentationSlot | null;
  equipmentSlot: EquipmentSlot | null;
  capacityCost: number;
  stackable: boolean;
  maxCharges: number | null;
  damage: string | null;
  damageType: DamageType | null;
  ruleIds: string[];
  tags: string[];
  visibleToPlayers: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ItemInstanceDto {
  id: string;
  characterId: string;
  definitionId: string;
  definition: ItemDefinitionDto;
  quantity: number;
  charges: number | null;
  status: ItemStatus;
  equippedSlot: EquipmentSlot | null;
  installedSlot: AugmentationSlot | null;
  customName: string | null;
  customEffects: PassiveEffect[] | null;
  container: string;
  createdAt: string;
}

export interface ConditionDefinitionDto {
  id: string;
  campaignId: string | null;
  key: string;
  name: string;
  description: string;
  color: string;
  effects: PassiveEffect[];
  ruleIds: string[];
  builtin: boolean;
}

export interface CharacterConditionDto {
  id: string;
  key: string;
  name: string;
  color: string;
  description: string;
  effects: PassiveEffect[];
  durationTurns: number | null;
  remainingTurns: number | null;
  level: number | null;
  note: string | null;
  sourceLabel: string | null;
  appliedAt: string;
}

export interface ActiveEffectDto {
  id: string;
  label: string;
  sourceType: string;
  sourceId: string | null;
  effects: PassiveEffect[];
  durationTurns: number | null;
  remainingTurns: number | null;
  onExpiry: InstantEffect[];
  createdAt: string;
}

export interface OverrideDto {
  id: string;
  campaignId: string;
  characterId: string;
  target: string;
  value: number;
  reason: string | null;
  durationTurns: number | null;
  remainingTurns: number | null;
  active: boolean;
  originalValue: number;
  createdByName: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface CharacterUnlockDto {
  nodeId: string;
  nodeKey: string;
  treeId: string;
  rank: number;
}

export interface CharacterView {
  character: CharacterCore;
  ownerUsername: string;
  derived: DerivedStats;
  items: ItemInstanceDto[];
  conditions: CharacterConditionDto[];
  activeEffects: ActiveEffectDto[];
  overrides: OverrideDto[];
  unlocks: CharacterUnlockDto[];
  abilities: AbilityDto[];
  /** Active share-link token (`/s/<token>`); only sent to the owner and the DM. */
  shareToken: string | null;
  /** Single-use hand-off token; only the DM receives it. */
  claimToken: string | null;
  permissions: {
    canEdit: boolean;
    canEditAttributes: boolean;
    canInstallCyberware: boolean;
    canLevelUp: boolean;
    /** Equip / unequip / use / drop / rename own items. True for owners even in read-only mode when the campaign allows it. */
    canManageInventory: boolean;
    /** Upload / clear the portrait. True for owners in read-only mode when the campaign allows it. */
    canChangePortrait: boolean;
    /** Create, copy or revoke the read-only share link (owner or DM). */
    canShare: boolean;
    isDm: boolean;
    isOwner: boolean;
    /** True for players when the campaign's "players are read-only" rule is on. */
    readOnly: boolean;
  };
}

export interface CharacterSummaryDto {
  id: string;
  campaignId: string;
  ownerUserId: string;
  ownerUsername: string;
  name: string;
  species: string;
  characterClass: string;
  level: number;
  portraitUrl: string | null;
  hpCurrent: number;
  hpMax: number;
  hpTemp: number;
  ac: number;
  conditions: string[];
  capacityUsed: number;
  capacity: number;
  overrideCount: number;
  online?: boolean;
}

export interface DiceRollDto {
  id: string;
  campaignId: string;
  characterId: string | null;
  characterName: string | null;
  userId: string;
  username: string;
  expression: string;
  category: RollCategory;
  label: string;
  mode: "normal" | "advantage" | "disadvantage";
  result: RollResult;
  total: number;
  visibility: RollVisibility;
  dc: number | null;
  success: boolean | null;
  createdAt: string;
}

/** One field-level change recorded in a `character.updated` event payload (`payload.changes`). */
export interface SheetChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface CampaignEventDto {
  id: string;
  campaignId: string;
  type: string;
  actorUserId: string | null;
  actorName: string | null;
  characterId: string | null;
  characterName: string | null;
  summary: string;
  payload: Record<string, unknown>;
  visibility: "public" | "dm" | "owner";
  reversesEventId: string | null;
  createdAt: string;
}

export interface RuleDefinitionDto {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  automationMode: AutomationMode | null;
  enabled: boolean;
  scope: "campaign" | "attached";
  graph: RuleGraph;
  validation: GraphValidation;
  draftVersion: number;
  publishedVersion: number | null;
  publishedGraph: RuleGraph | null;
  createdAt: string;
  updatedAt: string;
}

export interface RuleVersionDto {
  id: string;
  ruleId: string;
  version: number;
  graph: RuleGraph;
  note: string | null;
  createdAt: string;
}

export interface RuleTraceDto {
  id: string;
  campaignId: string;
  ruleId: string | null;
  ruleName: string;
  characterId: string;
  characterName: string;
  eventType: string;
  result: RuleExecutionResult;
  status: "applied" | "pending" | "approved" | "rejected" | "modified" | "manual" | "noop";
  automationMode: AutomationMode;
  createdAt: string;
}

export interface PendingActionDto {
  id: string;
  campaignId: string;
  characterId: string;
  characterName: string;
  ruleId: string | null;
  ruleName: string;
  traceId: string;
  actions: unknown[];
  status: "pending" | "approved" | "rejected" | "modified";
  note: string | null;
  createdAt: string;
}

export interface EncounterParticipantDto {
  id: string;
  encounterId: string;
  characterId: string | null;
  npcId: string | null;
  name: string;
  portraitUrl: string | null;
  initiative: number | null;
  hpCurrent: number;
  hpMax: number;
  ac: number;
  conditions: string[];
  hidden: boolean;
  isNpc: boolean;
  sortOrder: number;
  /** DM-only notes about the participant. */
  notes?: string;
}

export interface EncounterDto {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  status: "planned" | "active" | "ended";
  round: number;
  turnIndex: number;
  participants: EncounterParticipantDto[];
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface NpcDto {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  portraitUrl: string | null;
  faction: string;
  attributes: Record<AttributeKey, number>;
  hpMax: number;
  ac: number;
  speed: number;
  abilities: { name: string; description: string; effects: InstantEffect[] }[];
  effects: PassiveEffect[];
  ruleIds: string[];
  visibleToPlayers: boolean;
  isEnemy: boolean;
  createdAt: string;
}

export interface MissionDto {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  objectives: { id: string; text: string; done: boolean }[];
  status: "available" | "active" | "completed" | "failed";
  rewards: { xp: number; credits: number; progressionPoints: number; itemDefinitionIds: string[] };
  assignedCharacterIds: string[];
  visibleToPlayers: boolean;
  rewardsGrantedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntryDto {
  id: string;
  campaignId: string;
  authorUserId: string;
  authorName: string;
  characterId: string | null;
  title: string;
  body: string;
  visibility: "private" | "campaign" | "dm";
  isLore: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SkillTreeNodeDto {
  id: string;
  treeId: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  maxRank: number;
  cost: number;
  parentKeys: string[];
  requirements: Requirement[];
  effects: PassiveEffect[];
  ruleIds: string[];
  position: { x: number; y: number };
  tier: number;
}

export interface SkillTreeDto {
  id: string;
  campaignId: string;
  branch: SpecialSkillKey;
  name: string;
  description: string;
  nodes: SkillTreeNodeDto[];
}

export interface AbilityDto {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  icon: string;
  actionType: "action" | "bonus" | "reaction" | "free" | "passive";
  cost: { resource: string; amount: number };
  usesPer: "turn" | "encounter" | "rest" | "session" | "unlimited";
  maxUses: number;
  effects: InstantEffect[];
  passiveEffects: PassiveEffect[];
  ruleIds: string[];
  /** Where the character got it from (set in CharacterView). */
  grantedBy?: string;
}

export interface RollRequestDto {
  id: string;
  campaignId: string;
  characterId: string;
  characterName: string;
  target: string | null;
  expression: string | null;
  label: string;
  dc: number | null;
  visibility: RollVisibility;
  status: "pending" | "fulfilled" | "cancelled";
  resultRollId: string | null;
  createdAt: string;
}

export interface MessageDto {
  id: string;
  campaignId: string;
  fromUserId: string;
  fromName: string;
  toUserId: string | null;
  characterId: string | null;
  kind: "whisper" | "reveal" | "broadcast";
  body: string;
  createdAt: string;
}

export interface LiveSessionDto {
  id: string;
  campaignId: string;
  startedAt: string;
  endedAt: string | null;
  startedByName: string;
}

export interface DmDashboardDto {
  campaign: CampaignDto;
  characters: CharacterSummaryDto[];
  activeEncounter: EncounterDto | null;
  recentRolls: DiceRollDto[];
  recentEvents: CampaignEventDto[];
  pendingActions: PendingActionDto[];
  pendingRollRequests: RollRequestDto[];
  liveSession: LiveSessionDto | null;
  onlineUserIds: string[];
}

/** A sheet opened through its share link. `isMember` means the viewer can open the live HUD instead. */
export interface SharedSheetDto {
  campaignId: string;
  campaignName: string;
  characterId: string;
  ownerUsername: string;
  isMember: boolean;
  /** Calculated on the server so the read-only view shows the same numbers as the HUD (G1). */
  derived: DerivedStats;
  sheet: {
    format: "neom-net/character";
    version: 1;
    exportedAt: string;
    character: CharacterCore & {
      items: { definitionName: string; definitionId: string; quantity: number; status: string; installedSlot: string | null; equippedSlot: string | null; charges: number | null; customName: string | null }[];
      conditions: { key: string; level: number | null; note: string | null }[];
      unlocks: { nodeKey: string; rank: number }[];
    };
  };
}

/** What a signed-in user sees before taking a sheet through a hand-off link (`/claim/<token>`). */
export interface ClaimInfoDto {
  campaignId: string;
  campaignName: string;
  characterId: string;
  characterName: string;
  characterClass: string;
  level: number;
  portraitUrl: string | null;
  currentOwner: string;
  offeredBy: string;
  /** The viewer already owns it (link opened twice): just go to the HUD. */
  alreadyYours: boolean;
  isMember: boolean;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

/** Socket.IO event payloads (server → client). */
export interface ServerToClientEvents {
  "character.updated": (payload: { campaignId: string; characterId: string }) => void;
  "character.deleted": (payload: { campaignId: string; characterId: string }) => void;
  "campaign.updated": (payload: { campaignId: string }) => void;
  "event.created": (event: CampaignEventDto) => void;
  "roll.created": (roll: DiceRollDto) => void;
  "encounter.updated": (payload: { campaignId: string; encounterId: string }) => void;
  "rules.traced": (trace: RuleTraceDto) => void;
  "pending.updated": (payload: { campaignId: string }) => void;
  "rollRequest.created": (req: RollRequestDto) => void;
  "rollRequest.updated": (req: RollRequestDto) => void;
  "message.created": (msg: MessageDto) => void;
  "presence.updated": (payload: { campaignId: string; onlineUserIds: string[] }) => void;
  "session.updated": (payload: { campaignId: string; session: LiveSessionDto | null }) => void;
  "content.updated": (payload: { campaignId: string; kind: string }) => void;
  /** The DM handed a character sheet to this user. */
  "sheet.sent": (payload: { campaignId: string; characterId: string; characterName: string; fromName: string }) => void;
}

export interface ClientToServerEvents {
  "campaign.join": (campaignId: string, ack: (ok: boolean, error?: string) => void) => void;
  "campaign.leave": (campaignId: string) => void;
}
