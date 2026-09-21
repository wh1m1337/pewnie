#!/usr/bin/env python3
"""Синтез клітів нейронними голосами Microsoft (edge-tts): pip install edge-tts

Вхід: JSON-файл зі списком [{"id": "...", "text": "...", "voice": "pl-PL-ZofiaNeural"}]
Вихід: content/audio/<id>.mp3

Це ті самі голоси, що в Azure AI Speech — коли захочете офіційний платний API,
скрипт build-audio.mjs --provider azure дає ідентичні голоси.
"""
import asyncio
import json
import sys
from pathlib import Path

import edge_tts

RATE = "-6%"       # трохи повільніше за норму: краще для тих, хто вчиться
CONCURRENCY = 6
RETRIES = 4


async def one(job, out_dir, sem, stats):
    target = out_dir / f"{job['id']}.mp3"
    async with sem:
        for attempt in range(1, RETRIES + 1):
            try:
                comm = edge_tts.Communicate(job["text"], job["voice"], rate=RATE)
                await comm.save(str(target))
                if target.stat().st_size < 800:
                    raise RuntimeError("порожній аудіофайл")
                stats["ok"] += 1
                return
            except Exception as e:  # мережа, ліміти сервісу
                if attempt == RETRIES:
                    stats["fail"].append((job["id"], str(e)))
                    target.unlink(missing_ok=True)
                else:
                    await asyncio.sleep(1.5 * attempt)


async def main(jobs_path, out_dir):
    jobs = json.loads(Path(jobs_path).read_text(encoding="utf-8"))
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(CONCURRENCY)
    stats = {"ok": 0, "fail": []}
    total = len(jobs)
    tasks = [asyncio.create_task(one(j, out, sem, stats)) for j in jobs]
    for i, t in enumerate(asyncio.as_completed(tasks), 1):
        await t
        if i % 50 == 0 or i == total:
            print(f"  {i}/{total}", flush=True)
    print(json.dumps({"ok": stats["ok"], "failed": stats["fail"]}, ensure_ascii=False))
    sys.exit(1 if stats["fail"] else 0)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2]))
