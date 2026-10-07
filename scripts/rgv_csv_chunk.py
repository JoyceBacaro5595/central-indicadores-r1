"""Produce an idempotent SQL chunk. Pipe into a trusted server-side SQL client; never commit CSV data."""
import argparse, csv, json
parser = argparse.ArgumentParser()
parser.add_argument("file")
parser.add_argument("batch_id")
parser.add_argument("offset", type=int)
parser.add_argument("count", type=int)
args = parser.parse_args()
import uuid
batch_id = str(uuid.UUID(args.batch_id))
if args.offset < 0 or not 1 <= args.count <= 400:
    parser.error("Use offset >= 0 and count between 1 and 400")
with open(args.file, encoding="utf-8-sig", newline="") as source:
    reader = csv.reader(source)
    headers = next(reader)
    rows = [row for index, row in enumerate(reader) if args.offset <= index < args.offset + args.count]
if any(len(row) != len(headers) for row in rows):
    raise ValueError("CSV column count mismatch")
data = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
head = json.dumps(headers, ensure_ascii=False)
if "$rgv$" in data or "$headers$" in head:
    raise ValueError("SQL delimiter collision")
print("with data as (select jsonb_object_agg(h.value, a.value) payload from jsonb_array_elements($rgv$" + data + "$rgv$::jsonb) with ordinality r(row,idx) cross join lateral jsonb_array_elements(r.row) with ordinality a(value,pos) join jsonb_array_elements_text($headers$" + head + "$headers$::jsonb) with ordinality h(value,pos) on h.pos=a.pos group by r.idx), ins as (insert into rgv.raw_record(batch_id,record_id,payload) select '" + batch_id + "'::uuid,payload->>'ID do registro',payload from data on conflict(batch_id,record_id) do nothing returning 1) select count(*) imported from ins;")
