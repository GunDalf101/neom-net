import sys, json, re
sys.path.insert(0, sys.argv[1])
from dump import xlsx, docx
W = xlsx(sys.argv[2]); A = xlsx(sys.argv[3]); H = docx(sys.argv[4]); AR = xlsx(sys.argv[5])
def rows(sheet, src): 
    r = src[sheet]; head = r[0]; return [dict(zip(head, x + [""] * (len(head) - len(x)))) for x in r[1:] if any(str(c).strip() for c in x)]
def num(s):
    s = str(s).strip().replace(",", "")
    return int(float(s)) if re.fullmatch(r"-?\d+(\.\d+)?", s) else None
tier = {"Common": "common", "Uncommon": "uncommon", "Rare": "rare", "Very Rare": "veryRare", "Epic": "epic", "Legendary": "legendary"}
SLOT = {"Brain": "brain", "Eyes": "eyes", "Ears": "ears", "Mouth": "mouth", "Hands": "hands", "Arms": "arms", "Torso": "torso", "Back": "back", "Legs": "legs", "Feet": "feet"}
SKILLS = {"athletics":"athletics","acrobatics":"acrobatics","sleight of hand":"sleightOfHand","stealth":"stealth","arcana":"arcana","history":"history","investigation":"investigation","nature":"nature","religion":"religion","animal handling":"animalHandling","insight":"insight","medicine":"medicine","perception":"perception","survival":"survival","deception":"deception","intimidation":"intimidation","performance":"performance","persuasion":"persuasion"}
SPECIAL = {"hacking":"hacking","reflex":"reflex","adaptability":"adaptability","augmentation":"augmentation","sanity":"sanity","aura":"aura"}
ATTR = {"strength":"str","str":"str","dexterity":"dex","dex":"dex","constitution":"con","con":"con","intelligence":"int","int":"int","wisdom":"wis","wis":"wis","charisma":"cha","cha":"cha"}
def mod(target, value, label): return {"kind": "modifier", "target": target, "value": value, "op": "add", "label": label}
def ft_to_m(ft): return max(1, round(ft / 3.3))
def parse_effects(name, bonus, text):
    """Pull the mechanical parts we can model out of the free text; everything else stays a trait."""
    eff = []; src = f"{bonus}. {text}"
    for m in re.finditer(r"([+-]\d+)\s*(?:to\s+)?([A-Za-z ]+?)(?:\s+checks)?(?=[,;.)]|$| and | while | when | against | involving | relying | made | on )", src):
        val = int(m.group(1)); what = m.group(2).strip().lower()
        if what in SKILLS: eff.append(mod(f"skill.{SKILLS[what]}", val, name))
        elif what in SPECIAL: eff.append(mod(f"special.{SPECIAL[what]}", val, name))
        elif what == "ac": eff.append(mod("ac", val, name))
        elif what in ("initiative", "initiative rolls"): eff.append(mod("initiative", val, name))
        else:
            sm = re.fullmatch(r"(strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha) saves?", what)
            if sm: eff.append(mod(f"save.{ATTR[sm.group(1)]}", val, name))
    for m in re.finditer(r"(?:ground |walking )?speed\s*(increases by|\+|-)\s*(\d+)\s*(?:ft|feet)", src, re.I):
        sign = -1 if m.group(1) == "-" else 1
        eff.append(mod("speed", sign * ft_to_m(int(m.group(2))), name))
    m = re.search(r"maximum HP -(\d+)", src)
    if m: eff.append(mod("maxHp", -int(m.group(1)), f"{name} (Shimmer strain)"))
    if re.search(r"thermal vision|heat signatures", src, re.I): eff.append({"kind": "sense", "name": "Thermal vision", "rangeMeters": 18})
    if re.search(r"low-light|dim light within 60 feet as bright", src, re.I): eff.append({"kind": "sense", "name": "Low-light vision", "rangeMeters": 18})
    if re.search(r"resistance to bludgeoning, piercing, and slashing", src, re.I): eff.append({"kind": "resistance", "damageType": "physical", "level": "resistance"})
    if re.search(r"vulnerability to lightning", src, re.I): eff.append({"kind": "resistance", "damageType": "lightning", "level": "vulnerability"})
    if re.search(r"advantage on initiative", src, re.I): eff.append({"kind": "advantage", "on": "initiative", "mode": "advantage", "note": name})
    if re.search(r"advantage on Constitution saves", src, re.I): eff.append({"kind": "advantage", "on": "save.con", "mode": "advantage", "note": name})
    if re.search(r"disadvantage on Wisdom saves", src, re.I): eff.append({"kind": "advantage", "on": "save.wis", "mode": "disadvantage", "note": name})
    if re.search(r"disadvantage on Sleight of Hand", src, re.I): eff.append({"kind": "advantage", "on": "skill.sleightOfHand", "mode": "disadvantage", "note": name})
    # de-duplicate identical modifiers
    seen = set(); out = []
    for e in eff:
        k = json.dumps(e, sort_keys=True)
        if k not in seen: seen.add(k); out.append(e)
    # the rule text itself always rides along as a trait so the sheet shows it
    out.append({"kind": "trait", "name": name, "description": text[:500]})
    return out
weapons = []
for r in rows("Weapons", W):
    cls = r["Weapon Class"]; cat = r["Weapon Category"]
    weight = {"Pistol": 1, "Smart Pistol": 1, "SMG": 3, "Assault Rifle": 4, "Sniper Rifle": 5, "Shotgun": 4, "Melee": 1}.get(cls, 2)
    weapons.append({
        "name": r["Weapon"], "rarity": tier[r["Tier"]], "price": num(r["Base Price (Kamas)"]), "weight": weight,
        "description": f"{r['Description / Notes']}. {r['Damage Rule']}.",
        "damage": r["Damage (campaign baseline)"], "icon": "sword" if cls == "Melee" else "crosshair",
        "tags": sorted({cls, cat.split(" / ")[0], *[t.strip() for t in r["Compatibility Tags"].split(";")]}),
        "meta": {"weaponClass": cls, "weaponCategory": cat, "ammoType": r["Ammo Type"], "rangeFt": num(r["Range (ft)"]), "fireMode": r["Fire Mode"], "magazine": num(r["Magazine"]),
                 "attachmentSlots": num(r["Attachment Slot Count"]), "maxAttachmentTier": tier[r["Maximum Attachment Tier"]], "slotTypes": [s.strip() for s in r["Available Slot Types"].split(";")], "compatTags": [t.strip() for t in r["Compatibility Tags"].split(";")]},
    })
attachments = []
for r in rows("Attachments", A if False else W):
    attachments.append({
        "name": r["Attachment"] if r["Attachment"] != "Smart Link" else f"Smart Link ({r['Tier']})", "rarity": tier[r["Tier"]], "price": num(r["Price (Kamas)"]), "weight": 0.5,
        "description": re.sub(r"^Rules: ", "", r["Effect / Notes"]).replace(" This attachment grants no additional benefit beyond the effect described.", ""),
        "icon": "puzzle", "tags": ["attachment", r["Attachment Type"], *[t.strip() for t in r["Compatible Weapon Tags"].split(";")]],
        "meta": {"attachmentType": r["Attachment Type"], "compatTags": [t.strip() for t in r["Compatible Weapon Tags"].split(";")]},
    })
ammo = []
for r in rows("Ammunition", W):
    p = r["Price per magazine (Kamas)"]; mult = None
    if isinstance(p, str) and p.lower().startswith("x"): mult = num(p[1:]); price = mult * 100
    else: price = num(p)
    ammo.append({"name": r["Ammo Type"].strip().replace("Inciendry", "Incendiary").title() if r["Ammo Type"].strip().lower() in ("inciendry ammo", "cryo ammo", "electrocute ammo", "shimmer ammo") else r["Ammo Type"].strip() + (" magazine" if mult is None else ""),
                 "rarity": "rare" if mult else "common", "price": price, "weight": 0.3, "description": f"{r['Typical Use'].strip()}. {r['Notes']}" + (f" Priced at ×{mult} of a 100 K standard magazine; the DM may adjust." if mult else ""),
                 "icon": "circle-dot", "tags": ["ammo", r["Typical Use"].strip()], "meta": {"ammoType": r["Ammo Type"].strip(), "perMagazine": True, **({"priceMultiplier": mult, "special": True} if mult else {})}})
augments = []
for sheet, shimmer in (("Normal Augments", False), ("Shimmer Fused", True)):
    for r in rows(sheet, A):
        name = r["Augment"]; text = r["D&D Effect / Description"]
        # House rule: a Shimmer fusion costs twice the strain of a normal augment of the same tier (5 / 10 / 20 → 10 / 20 / 40).
        # DM's strain table by tier; the normal-augment column of the sheet already follows it.
        base_strain = {"common": 5, "uncommon": 10, "rare": 20, "veryRare": 35, "epic": 50, "legendary": 75}[tier[r["Tier"]]]
        strain = base_strain * 2 if shimmer else base_strain
        aug = {"name": name, "slot": SLOT[r["Body Slot"]], "rarity": tier[r["Tier"]], "price": num(r["Price (Kamas)"]), "weight": 0.5,
               "description": text, "capacityCost": strain, "icon": "cpu" if not shimmer else "sparkles",
               "tags": ["augment", "shimmer" if shimmer else "standard", r["Primary Stat"]],
               "meta": {"primaryStat": r["Primary Stat"], "bonus": str(r["Bonus"]), "permanentStrain": strain, "activationStrain": num(r["Activation Strain"]) or 0, "shimmer": shimmer,
                        **({"maxHpPenalty": num(r["Maximum HP Penalty"]), "penalty": r["Additional Penalty (non-HP)"]} if shimmer else {})},
               "effects": parse_effects(name, r["Bonus"], text)}
        augments.append(aug)
# ---- armor catalogue (Neon_City_Armor_Catalogue.xlsx: two title rows, then the header) ----
def armor_rows():
    r = AR["Armor Catalogue"]; hi = next(i for i, x in enumerate(r) if x and str(x[0]).strip() == "Armor")
    head = r[hi]; return [dict(zip(head, x + [""] * (len(head) - len(x)))) for x in r[hi + 1:] if any(str(c).strip() for c in x)]
def armor_effects(name, ac, perks, downsides):
    eff = []
    m = re.match(r"(\d+)(?:\s*\+\s*DEX modifier(?:\s*\(max \+(\d+)\))?)?", ac.strip())
    base = int(m.group(1)); dex_cap = None if m.group(2) is None and "+ DEX" in ac else (int(m.group(2)) if m.group(2) else 0)
    mod_ac = {"kind": "modifier", "target": "ac", "value": base, "op": "setBase", "stackGroup": "armor", "label": f"{name} (armor)"}
    if dex_cap is not None: mod_ac["dexCap"] = dex_cap
    eff.append(mod_ac)
    text = f"{perks} {downsides}"
    if re.search(r"Disadvantage on Stealth", text): eff.append({"kind": "advantage", "on": "skill.stealth", "mode": "disadvantage", "note": name})
    if re.search(r"Advantage on Stealth checks", text): eff.append({"kind": "advantage", "on": "skill.stealth", "mode": "advantage", "note": name})
    if re.search(r"Resistance to bludgeoning", text, re.I): eff.append({"kind": "resistance", "damageType": "bludgeoning", "level": "resistance"})
    m = re.search(r"movement speed reduced by (\d+) ft", text, re.I)
    if m: eff.append(mod("speed", -ft_to_m(int(m.group(1))), name))
    if perks and perks != "No additional protection.": eff.append({"kind": "trait", "name": f"{name}: perks", "description": perks[:500]})
    if downsides: eff.append({"kind": "trait", "name": f"{name}: downsides", "description": downsides[:500]})
    return eff
armor = []
for r in armor_rows():
    raw_tier = r["Rarity"]; parts = [p.strip() for p in raw_tier.split("•")]
    name = r["Armor"]; ac = r["Armor Class (AC)"]; req = r["Requirements / Limits"]
    reqs = []
    m = re.match(r"(STR|DEX|CON|INT|WIS|CHA) (\d+) required", req)
    if m: reqs.append({"kind": "attribute", "attribute": ATTR[m.group(1).lower()], "min": int(m.group(2))})
    heavy = "Heavy" in req or "+ DEX" not in ac
    armor.append({
        "name": name, "rarity": tier[parts[0]], "price": num(r["Price (Kamas)"]), "weight": 12 if heavy else 4,
        "description": f"AC {ac}. {r['Perks']} {r['Downsides']}".strip(),
        "icon": "shield", "tags": ["armor", "heavy" if heavy else "light", *(["anti-hacking"] if "Anti-Hacking" in raw_tier else [])],
        "requirements": reqs,
        "meta": {"acFormula": ac, "armorWeight": "heavy" if heavy else "light", "requirement": req if req != "None" else None, "perks": r["Perks"], "downsides": r["Downsides"], **({"antiHacking": True} if "Anti-Hacking" in raw_tier else {})},
        "effects": armor_effects(name, ac, r["Perks"], r["Downsides"]),
    })
# ---- handbook plans ----
def table(heading):
    out = []; grab = False
    for l in H:
        if l.startswith("#Heading1: "): grab = l.endswith(heading); continue
        if grab and l.startswith("| "): out.append([c.strip() for c in l.strip("| ").split(" | ")])
    return out
def nightly(s):
    m = re.match(r"(\d+)\s*/\s*night", s); return int(m.group(1)) if m else None
plans = []
t = table("Housing")
for name, cost in t[1:]:
    n = nightly(cost); district = "nfc" if "NFC" in name else "wca" if "WCA" in name else "dogtown"
    plans.append({"kind": "housing", "name": name, "district": district, "monthlyCost": n * 30 if n else num(cost), "purchasePrice": 0,
                  "description": (f"{n} K per night, billed as 30 nights. No identity needed." if n and "no identity" in cost else f"{n} K per night, billed as 30 nights." if n else f"Monthly rent in {district.upper() if district != 'dogtown' else 'Dogtown'}."), "effects": []})
for name, cost, effect in table("Food Plans")[1:]:
    eff = [{"kind": "trait", "name": f"Diet: {name}", "description": effect}]
    plans.append({"kind": "food", "name": name, "monthlyCost": num(cost), "purchasePrice": 0, "description": effect, "effects": [] if effect == "No penalties" else eff})
for name, ins, fuel, total, price in table("Transportation")[1:]:
    plans.append({"kind": "transport", "name": name, "monthlyCost": num(total), "purchasePrice": num(price) or 0,
                  "description": ("Monthly pass." if num(price) is None else f"Buy once for {num(price)} K, then insurance {num(ins)} K + fuel {num(fuel)} K a month."), "effects": [{"kind": "trait", "name": name, "description": "Personal transport across the districts."}] if num(price) else []})
for name, cost, bonus in table("Connectivity")[1:]:
    v = int(re.search(r"([+-]\d+)", bonus).group(1))
    plans.append({"kind": "connectivity", "name": name, "monthlyCost": num(cost), "purchasePrice": 0, "description": f"{bonus} while the subscription is paid.", "effects": [mod("special.hacking", v, name)] if v else []})
for name, cost, effect in table("Antivirus")[1:]:
    plans.append({"kind": "antivirus", "name": name, "monthlyCost": num(cost), "purchasePrice": 0, "description": f"{effect} against hacking.", "effects": [{"kind": "trait", "name": f"ICE: {name}", "description": f"{effect} against hacking attempts."}]})
districts = {r[0].lower(): {"name": r[0], "tax": int(r[1].rstrip("%")), "benefits": r[2]} for r in table("Districts & Taxes")[1:]}
maintenance = {tier[r[0]]: num(r[1]) for r in table("Cyberware Maintenance")[1:]}
reference = {"missionPayouts": table("Mission Types"), "gangTreasury": table("Gang Treasury Rules")}
out = {"version": 2, "source": "NEOM_NET_Weapons_and_Attachments_Catalog_v4, NEOM_NET_Augments_and_Shimmer_Fusions_v5, NeoCity_GM_Economy_Handbook, Neon_City_Armor_Catalogue", "weapons": weapons, "attachments": attachments, "ammo": ammo, "armor": armor, "augments": augments, "plans": plans, "districts": districts, "maintenance": maintenance, "reference": reference}
json.dump(out, open(sys.argv[6], "w"), indent=1, ensure_ascii=False)
for a in armor: print(f"{a['name']:26} {a['rarity']:9} {a['price']:>6}  " + "; ".join(f"{e.get('target', e.get('on', e.get('damageType','')))}{(' base %d' % e['value']) if e.get('op')=='setBase' else ('%+d' % e['value']) if 'value' in e else ''}{(' dexCap %s' % e['dexCap']) if 'dexCap' in e else ''}" for e in a['effects'] if e['kind'] != 'trait') + (f"  req {a['requirements']}" if a['requirements'] else ""))
print({k: len(v) for k, v in out.items() if isinstance(v, list)})
for a in augments:
    mods = [e for e in a["effects"] if e["kind"] != "trait"]
    print(f"{a['name']:28} strain {a['capacityCost']:>3}  " + "; ".join(f"{e.get('target', e.get('name', e.get('on','')))}{('%+d' % e['value']) if 'value' in e else ''}" for e in mods))
print(json.dumps(ammo, indent=0)[:900]); print(json.dumps(plans[:3] + plans[14:19], indent=0)[:1500]); print(districts, maintenance)
