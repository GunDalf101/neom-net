import type { CampaignEventDto, ClientToServerEvents, DiceRollDto, ServerToClientEvents } from "@neom/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { qk } from "@/api/hooks";
import { toast } from "@/store/ui";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | undefined;

export function getSocket(): AppSocket {
  if (!socket) {
    socket = io({ path: "/socket.io", withCredentials: true, autoConnect: true, reconnection: true, reconnectionDelayMax: 5000 });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = undefined;
}

/**
 * Joins the campaign room and translates server pushes into query cache updates.
 * State recovery after reconnect = refetch everything for the campaign.
 */
export function useCampaignRealtime(campaignId: string | undefined, currentUserId: string | undefined) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState<string[]>([]);

  useEffect(() => {
    if (!campaignId || !currentUserId) return;
    const s = getSocket();

    const join = () => {
      s.emit("campaign.join", campaignId, (ok) => {
        setConnected(ok);
        if (ok) {
          qc.invalidateQueries({ predicate: (q) => (q.queryKey as unknown[]).includes(campaignId) });
        }
      });
    };
    if (s.connected) join();
    s.on("connect", join);
    s.on("disconnect", () => setConnected(false));

    const invalidate = (key: readonly unknown[]) => qc.invalidateQueries({ queryKey: key });

    const onCharacter: ServerToClientEvents["character.updated"] = ({ characterId }) => {
      invalidate(qk.character(characterId));
      invalidate(qk.characters(campaignId));
      invalidate(qk.dashboard(campaignId));
    };
    const onCampaign: ServerToClientEvents["campaign.updated"] = () => {
      invalidate(qk.campaign(campaignId));
      invalidate(qk.campaigns);
    };
    const onEvent: ServerToClientEvents["event.created"] = (event: CampaignEventDto) => {
      qc.setQueryData<CampaignEventDto[]>(qk.events(campaignId), (old) => (old ? [event, ...old.filter((e) => e.id !== event.id)].slice(0, 120) : old));
      qc.invalidateQueries({ queryKey: qk.events(campaignId), exact: false, refetchType: "none" });
      if (event.characterId) {
        qc.setQueryData<CampaignEventDto[]>([...qk.events(campaignId), event.characterId], (old) => (old ? [event, ...old.filter((e) => e.id !== event.id)].slice(0, 120) : old));
      }
      if (event.type === "notify" || event.type === "rule.applied" || event.type === "rule.pending") {
        toast("info", event.summary);
      }
    };
    const onRoll: ServerToClientEvents["roll.created"] = (roll: DiceRollDto) => {
      qc.setQueryData<DiceRollDto[]>(qk.rolls(campaignId), (old) => (old ? [roll, ...old.filter((r) => r.id !== roll.id)].slice(0, 60) : old));
      if (roll.userId !== currentUserId) {
        const nat = roll.result.isNat20 ? " · NAT 20" : roll.result.isNat1 ? " · NAT 1" : "";
        toast("roll", `${roll.characterName ?? roll.username}: ${roll.label} = ${roll.total}${nat}`);
      }
    };
    const onEncounter: ServerToClientEvents["encounter.updated"] = ({ encounterId }) => {
      invalidate(qk.encounter(campaignId, encounterId));
      invalidate(qk.encounters(campaignId));
      invalidate(qk.campaign(campaignId));
      invalidate(qk.dashboard(campaignId));
    };
    const onTrace: ServerToClientEvents["rules.traced"] = () => {
      invalidate(qk.traces(campaignId));
      invalidate(qk.pending(campaignId));
    };
    const onPending: ServerToClientEvents["pending.updated"] = () => {
      invalidate(qk.pending(campaignId));
      invalidate(qk.dashboard(campaignId));
    };
    const onRollRequest: ServerToClientEvents["rollRequest.created"] = (req) => {
      invalidate(qk.rollRequests(campaignId));
      toast("info", `DM requests: ${req.label}`, req.dc ? `DC ${req.dc}` : undefined);
    };
    const onRollRequestUpdated: ServerToClientEvents["rollRequest.updated"] = () => {
      invalidate(qk.rollRequests(campaignId));
      invalidate(qk.dashboard(campaignId));
    };
    const onMessage: ServerToClientEvents["message.created"] = (msg) => {
      invalidate(qk.messages(campaignId));
      if (msg.fromUserId !== currentUserId) toast("info", `${msg.fromName} (${msg.kind})`, msg.body);
    };
    const onPresence: ServerToClientEvents["presence.updated"] = ({ onlineUserIds }) => {
      setOnline(onlineUserIds);
      invalidate(qk.campaign(campaignId));
    };
    const onSession: ServerToClientEvents["session.updated"] = ({ session }) => {
      qc.setQueryData(qk.session(campaignId), session);
      invalidate(qk.campaign(campaignId));
      invalidate(qk.dashboard(campaignId));
      toast("info", session ? "Live session started" : "Live session ended");
    };
    const onContent: ServerToClientEvents["content.updated"] = ({ kind }) => {
      const map: Record<string, readonly unknown[]> = {
        items: qk.items(campaignId),
        conditions: qk.conditions(campaignId),
        rules: qk.rules(campaignId),
        skillTrees: qk.skillTrees(campaignId),
        abilities: qk.abilities(campaignId),
        npcs: qk.npcs(campaignId),
        missions: qk.missions(campaignId),
        journal: qk.journal(campaignId),
      };
      const key = map[kind];
      if (key) invalidate(key);
    };

    s.on("character.updated", onCharacter);
    s.on("character.deleted", onCharacter);
    s.on("campaign.updated", onCampaign);
    s.on("event.created", onEvent);
    s.on("roll.created", onRoll);
    s.on("encounter.updated", onEncounter);
    s.on("rules.traced", onTrace);
    s.on("pending.updated", onPending);
    s.on("rollRequest.created", onRollRequest);
    s.on("rollRequest.updated", onRollRequestUpdated);
    s.on("message.created", onMessage);
    s.on("presence.updated", onPresence);
    s.on("session.updated", onSession);
    s.on("content.updated", onContent);

    return () => {
      s.emit("campaign.leave", campaignId);
      s.off("connect", join);
      s.off("character.updated", onCharacter);
      s.off("character.deleted", onCharacter);
      s.off("campaign.updated", onCampaign);
      s.off("event.created", onEvent);
      s.off("roll.created", onRoll);
      s.off("encounter.updated", onEncounter);
      s.off("rules.traced", onTrace);
      s.off("pending.updated", onPending);
      s.off("rollRequest.created", onRollRequest);
      s.off("rollRequest.updated", onRollRequestUpdated);
      s.off("message.created", onMessage);
      s.off("presence.updated", onPresence);
      s.off("session.updated", onSession);
      s.off("content.updated", onContent);
    };
  }, [campaignId, currentUserId, qc]);

  return { connected, online };
}
