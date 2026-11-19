import sys, zipfile, re, json
from xml.etree import ElementTree as ET
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main", "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships", "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
def col(ref):
    letters = re.match(r"[A-Z]+", ref).group(0); n = 0
    for ch in letters: n = n * 26 + ord(ch) - 64
    return n - 1
def xlsx(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    relmap = {r.get("Id"): r.get("Target") for r in rels}
    out = {}
    for sh in wb.find("m:sheets", NS):
        name = sh.get("name"); target = relmap[sh.get("{%s}id" % NS["r"])]
        target = target if target.startswith("xl/") else "xl/" + target.lstrip("/")
        root = ET.fromstring(z.read(target))
        rows = []
        for row in root.iter("{%s}row" % NS["m"]):
            cells = {}
            for c in row.findall("m:c", NS):
                v = c.find("m:v", NS); t = c.get("t")
                if t == "inlineStr":
                    val = "".join(x.text or "" for x in c.iter("{%s}t" % NS["m"]))
                elif v is None: val = ""
                elif t == "s": val = shared[int(v.text)]
                else: val = v.text
                cells[col(c.get("r"))] = val
            if cells:
                width = max(cells) + 1
                rows.append([cells.get(i, "") for i in range(width)])
        out[name] = rows
    return out
def docx(path):
    z = zipfile.ZipFile(path)
    root = ET.fromstring(z.read("word/document.xml"))
    body = root.find("w:body", NS)
    lines = []
    for el in body:
        tag = el.tag.split("}")[1]
        if tag == "p":
            style = el.find("w:pPr/w:pStyle", NS)
            st = style.get("{%s}val" % NS["w"]) if style is not None else ""
            text = "".join(t.text or "" for t in el.iter("{%s}t" % NS["w"]))
            if text.strip(): lines.append(("#" if st.startswith("Heading") else "") + (st + ": " if st else "") + text)
        elif tag == "tbl":
            for tr in el.iter("{%s}tr" % NS["w"]):
                cells = ["".join(t.text or "" for t in tc.iter("{%s}t" % NS["w"])) for tc in tr.findall("w:tc", NS)]
                lines.append("| " + " | ".join(cells) + " |")
            lines.append("")
    return lines
if __name__ == "__main__":
  for path in sys.argv[1:]:
      print("=" * 20, path)
      if path.endswith(".xlsx"):
          for name, rows in xlsx(path).items():
              print("--- sheet:", name, f"({len(rows)} rows)")
              for r in rows: print("\t".join(str(x) for x in r))
      else:
          for l in docx(path): print(l)
