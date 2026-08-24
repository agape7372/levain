# Offline replica of the builder's rng consumption, to count how many pore cells actually
# get placed. Mirrors scripts/breads/lib.ts mulberry32/hashId and pancake.ts call order.
import math
M32 = 0xFFFFFFFF

def mulberry32(seed):
    a = [seed & M32]
    def rng():
        a[0] = (a[0] + 0x6D2B79F5) & M32
        t = a[0]
        t = ((t ^ (t >> 15)) * (t | 1)) & M32
        t = (t ^ (t + ((t ^ (t >> 7)) * (t | 61) & M32))) & M32
        return ((t ^ (t >> 14)) & M32) / 4294967296
    return rng

def hash_id(s):
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & M32
    return h & M32

SHARES = [0.14, 0.27, 0.36, 0.23]
DISKS = [(30, 6, 8), (30, 6, 8), (30, 9, 22)]  # (segments, faceSegmentsAfterShared, pores)
# pore rings = face rings inside the margin (rFrac <= 0.80):
#   coarse -> 0.80,0.67,0.53,0.38,0.20 = 5 ; dense -> 0.80,0.73,0.65,0.56,0.46,0.35,0.22 = 7
PORE_RINGS = [5, 5, 7]
# vertex count per disk: body 1 pole + 5*seg ; face full rings * seg + 1 pole
VERTS = [1 + 5 * 30 + 5 * 30 + 1, 1 + 5 * 30 + 5 * 30 + 1, 1 + 5 * 30 + 8 * 30 + 1]

rng = mulberry32(hash_id("pancake"))
for (segments, _, count), ringCount, verts in zip(DISKS, PORE_RINGS, VERTS):
    for _ in range(2 + segments * 2):  # makeWobble
        rng()
    n = ringCount * segments
    cells = [(i // segments, i % segments) for i in range(n)]
    for i in range(n - 1, 0, -1):     # Fisher-Yates
        j = int(rng() * (i + 1))
        cells[i], cells[j] = cells[j], cells[i]
    quota = [max(1, round(count * s)) for s in SHARES]
    picked, ci = [], 0
    for ring, sector in cells:
        while ci < len(quota) and quota[ci] == 0:
            ci += 1
        if ci >= len(quota) or len(picked) >= count:
            break
        close = any(abs(p[0] - ring) <= 1 and min(abs(p[1] - sector), segments - abs(p[1] - sector)) <= 1 for p in picked)
        if close:
            continue
        picked.append((ring, sector, ci))
        quota[ci] -= 1
    by_class = [sum(1 for p in picked if p[2] == c) for c in range(4)]
    print(f"segments={segments} rings={ringCount} requested={count} placed={len(picked)} byClass={by_class} quotaLeft={quota}")
    for _ in range(verts * 3):        # jitterVertices
        rng()
