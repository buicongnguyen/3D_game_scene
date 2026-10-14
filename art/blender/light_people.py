"""Light versions of the people: the same look, skeleton and clips, a fraction of the triangles and one draw call.

    blender.exe -b --factory-startup --python art/blender/light_people.py [-- --only=mika,villager-kid] [--report=path.json]

Reads public/models/<name>.glb (never written) and writes public/models/<name>.lite.glb for the nine people.
Run it again whenever a standard model changes: nothing here is hand-tuned per file beyond the table below.

What a light file is
  * The scene graph, the skin (joints, inverse bind matrices) and every animation are copied from the standard file
    byte for byte: bone names, rest pose, attachment nodes (grip_R, hat, stick, scarf_*), clip names and timing are
    the same by construction. Only the mesh is replaced.
  * ONE mesh, ONE primitive, ONE material ("People palette"). Each vertex carries the number of the part it came
    from (`_PART`: Skin, Iris, Villager shirt ...) and the mesh extras carry the palette: the name, base colour,
    roughness and metalness of every part, exactly as the standard materials had them. COLOR_0 is still the baked
    ambient occlusion. The runtime (src/engine/people.js) draws colour = palette[part] x AO with that part's
    roughness, which is the standard look to the bit, and can still tint a part by its name (villagers' shirts).
    The colours are NOT multiplied into COLOR_0 on purpose: the build quantises vertex colours to 8 bits, and the
    people's dark hair and irises (linear 0.01-0.05) would band and shift hue there.
  * Fewer triangles, in this order:
      1. faces that can never be seen are deleted (skin under clothes, the backs of the eyeballs, scalp under hair):
         a face goes only when no ray from it reaches the open air past front-facing geometry, and its neighbours
         within two rings stay, so nothing opens up when a sleeve or a hem moves;
      2. each part is collapsed with Blender's Decimate modifier, weighted so the face (eyes, mouth, brows), the
         hands and the bending rings of elbows, knees, shoulders and hips keep their vertices, mirrored left/right;
      3. normals, ambient occlusion and skin weights are NOT whatever the collapse left: each new vertex takes them
         from the nearest point of the standard surface of its own part, so shading stays as smooth as the standard
         model and the weights are the authored ones (four strongest, renormalised).
"""
import bpy
import bmesh
import json
import math
import os
import struct
import sys

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS = os.path.join(ROOT, 'public', 'models')

# Triangle targets. The heroine is seen up close; the townsfolk a dozen at a time.
PEOPLE = {
    'mika': 6000,
    'sora': 4600, 'rin': 4800, 'genzo': 4800, 'hana': 4600, 'ota': 4800,
    'villager-kid': 3300, 'villager-man': 3400, 'villager-woman': 3300,
}

# How willingly a part gives up triangles (1 = average). Small face parts are what a child looks at: they keep theirs.
# Matched by lower-case substring, first hit wins; anything else is 1.
KEEP = [
    ('eye white', 4.0), ('iris', 4.0), ('dark', 3.0),          # eyes, pupils, brows, lashes, mouth
    ('brass', 1.6), ('glass', 2.0),                             # buckles, buttons, spectacles: tiny and shiny
    ('skin', 1.25),                                             # (the face and hands are protected again by weights)
    ('hair', 0.95), ('beard', 1.0),
    ('shoe', 0.8), ('boot', 0.8), ('sandal', 0.8), ('sole', 0.6),
]
_ARG = lambda k, d: next((float(a.split('=')[1]) for a in sys.argv if a.startswith(f'--{k}=')), d)
FOOTWEAR = ('boot', 'shoe', 'sandal', 'sock', 'geta', 'slipper', 'leather', 'wood')   # (the last two: Genzo's and Hana's shoes, Ota's geta)
RUB = 0.025               # skin and footwear this close (and not both rigid on the foot) cross when a knee or ankle bends
MIN_RATIO = 0.16          # no part is collapsed below this fraction of its (visible) triangles
RAY_EPS = 4e-4
SEE_RAYS = int(_ARG('rays', 400))            # directions tried per face
DEBUG = '--debug' in sys.argv
LOST = _ARG('lost', 1.5)
TOLERANCE_MM = _ARG('tol', 5.0)       # a collapsed piece may leave the standard surface by this much (half of it on the bare head)

COMPONENT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


# ---------------------------------------------------------------------------------------------------- GLB in / out
def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, version, _length = struct.unpack_from('<4sII', data, 0)
    assert magic == b'glTF' and version == 2, path
    at, js, binary = 12, None, b''
    while at < len(data):
        size, kind = struct.unpack_from('<I4s', data, at)
        chunk = data[at + 8: at + 8 + size]
        if kind == b'JSON':
            js = json.loads(chunk.decode('utf8'))
        elif kind == b'BIN\x00':
            binary = chunk
        at += 8 + size
    return js, binary


def accessor(js, binary, index):
    a = js['accessors'][index]
    assert 'sparse' not in a, 'sparse accessors are not expected in the people files'
    view = js['bufferViews'][a['bufferView']]
    dtype, width = np.dtype(COMPONENT[a['componentType']]), WIDTH[a['type']]
    start = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = view.get('byteStride', 0) or dtype.itemsize * width
    if stride == dtype.itemsize * width:
        out = np.frombuffer(binary, dtype, a['count'] * width, start).reshape(a['count'], width)
    else:
        raw = np.frombuffer(binary, np.uint8, a['count'] * stride, start).reshape(a['count'], stride)
        out = raw[:, :dtype.itemsize * width].copy().view(dtype).reshape(a['count'], width)
    if a.get('normalized'):
        out = out.astype(np.float32) / np.iinfo(dtype).max
    return out


def raw_accessor_bytes(js, binary, index):
    a = js['accessors'][index]
    view = js['bufferViews'][a['bufferView']]
    size = np.dtype(COMPONENT[a['componentType']]).itemsize * WIDTH[a['type']]
    assert not view.get('byteStride') or view['byteStride'] == size
    start = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    return binary[start: start + a['count'] * size]


def write_glb(path, js, binary):
    text = json.dumps(js, separators=(',', ':')).encode('utf8')
    text += b' ' * (-len(text) % 4)
    binary = bytes(binary) + b'\x00' * (-len(binary) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(text) + 8 + len(binary)))
        f.write(struct.pack('<I4s', len(text), b'JSON'))
        f.write(text)
        f.write(struct.pack('<I4s', len(binary), b'BIN\x00'))
        f.write(binary)


# ---------------------------------------------------------------------------------------------------------- helpers
def weld(points, tris, tol=1e-5):
    """Merge vertices at the same place (the standard files split them at hard edges). -> points, tris, old->new."""
    key = np.round(points / tol).astype(np.int64)
    _, first, inverse = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inverse = inverse.reshape(-1)
    t = inverse[tris]
    ok = (t[:, 0] != t[:, 1]) & (t[:, 1] != t[:, 2]) & (t[:, 0] != t[:, 2])
    return points[first], t[ok], inverse, ok


def tri_normals(points, tris):
    n = np.cross(points[tris[:, 1]] - points[tris[:, 0]], points[tris[:, 2]] - points[tris[:, 0]])
    length = np.linalg.norm(n, axis=1, keepdims=True)
    return n / np.maximum(length, 1e-20), length[:, 0] * 0.5


def sphere_dirs(n):
    i = np.arange(n) + 0.5
    phi = np.arccos(1 - 2 * i / n)
    theta = math.pi * (1 + 5 ** 0.5) * i
    return np.stack([np.cos(theta) * np.sin(phi), np.sin(theta) * np.sin(phi), np.cos(phi)], 1)


def barycentric(p, a, b, c):
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11 = (v0 * v0).sum(), (v0 * v1).sum(), (v1 * v1).sum()
    d20, d21 = (v2 * v0).sum(), (v2 * v1).sum()
    den = d00 * d11 - d01 * d01
    if abs(den) < 1e-20:
        return np.array([1.0, 0.0, 0.0])
    v = (d11 * d20 - d01 * d21) / den
    w = (d00 * d21 - d01 * d20) / den
    out = np.clip(np.array([1 - v - w, v, w]), 0, 1)
    return out / out.sum()


# ----------------------------------------------------------------------------------------------- 1. hidden faces
def visible_faces(parts):
    """For every triangle of every part (rest pose): can it be seen from outside the character, and if not, is it
    hidden for good? -> (seen, sealed) per part. `sealed` = everything that hides it hangs rigidly on the same one
    bone as the triangle itself (the underside of a lock against the head, the back of an eye): no clip can ever
    open that up. A hidden triangle that is not sealed (skin under a sleeve) may show when things move."""
    points = np.concatenate([p['P'] for p in parts])
    offs = np.cumsum([0] + [len(p['P']) for p in parts])
    tris = np.concatenate([p['T'] + offs[i] for i, p in enumerate(parts)])
    # the one bone a triangle is rigid on, or -1
    dense = np.concatenate([p['dense'] for p in parts])
    top, top_w = dense.argmax(1), dense.max(1)
    vertex_bone = np.where(top_w > 0.995, top, -1)
    tb = vertex_bone[tris]
    bone = np.where((tb[:, 0] == tb[:, 1]) & (tb[:, 1] == tb[:, 2]), tb[:, 0], -1)
    normals, _ = tri_normals(points, tris)
    bvh = BVHTree.FromPolygons([Vector(p) for p in points.tolist()], tris.tolist(), all_triangles=True, epsilon=0.0)
    dirs = sphere_dirs(SEE_RAYS)
    seen = np.zeros(len(tris), bool)
    sealed = np.zeros(len(tris), bool)
    a, b, c = points[tris[:, 0]], points[tris[:, 1]], points[tris[:, 2]]
    centre = (a + b + c) / 3
    samples = [centre, centre * 0.25 + a * 0.75, centre * 0.25 + b * 0.75, centre * 0.25 + c * 0.75,
               (a + b) / 2 * 0.9 + centre * 0.1, (b + c) / 2 * 0.9 + centre * 0.1, (c + a) / 2 * 0.9 + centre * 0.1]
    normal_list = [Vector(n) for n in normals.tolist()]
    dir_list = [Vector(d) for d in dirs.tolist()]
    for t in range(len(tris)):
        n = normals[t]
        front = np.nonzero(dirs @ n > 0.08)[0]
        free, rigid = False, bone[t] >= 0
        for s in samples:
            origin = Vector(s[t] + n * RAY_EPS)
            for di in front:
                dv = dir_list[di]
                o = origin
                for _ in range(16):
                    loc, _hn, index, _dist = bvh.ray_cast(o, dv)
                    if loc is None:
                        free = True
                        break
                    # a face turned towards the viewer hides what is behind it; one turned away is culled and does not
                    if normal_list[index].dot(dv) > 0.0:
                        if bone[index] != bone[t]:
                            rigid = False
                        break
                    o = loc + dv * RAY_EPS
                if free:
                    break
            if free:
                break
        seen[t] = free
        sealed[t] = (not free) and rigid
    out, at = [], 0
    for p in parts:
        out.append((seen[at: at + len(p['T'])], sealed[at: at + len(p['T'])]))
        at += len(p['T'])
    return out


def grow(tris, mask, rings):
    """Add `rings` rings of neighbouring triangles (sharing a vertex) to a triangle mask."""
    mask = mask.copy()
    for _ in range(rings):
        touched = np.zeros(tris.max() + 1, bool)
        touched[tris[mask].reshape(-1)] = True
        mask |= touched[tris].any(1)
    return mask


# -------------------------------------------------------------------------------------------------- 2. the collapse
def protection(part, bones, points):
    """0..1 per (welded) vertex: how strongly it should survive the collapse."""
    w = part['dense']                                    # verts x joints, the standard weights
    name = part['name'].lower()
    col = lambda b: w[:, bones.index(b)] if b in bones else np.zeros(len(w))
    head = col('head')
    hands = col('hand_L') + col('hand_R') + col('grip_R')
    feet = col('foot_L') + col('foot_R')
    keep = np.zeros(len(w))
    top = np.sort(w, axis=1)[:, -1]
    bend = np.clip((1.0 - top) * 2.2, 0, 1)              # a vertex shared between two bones sits on a bending ring
    keep = np.maximum(keep, bend * 0.75)
    if 'skin' in name:
        # the face is the front of the head (the people look down +Z): cheeks, nose, chin, ears' front edge
        hp = points[head > 0.5]
        if len(hp):
            lo, hi = hp.min(0), hp.max(0)
            zmid, depth = (lo[2] + hi[2]) / 2, max(hi[2] - lo[2], 1e-6)
            front = np.clip((points[:, 2] - zmid) / (depth * 0.5) * 1.6 + 0.35, 0, 1)
            keep = np.maximum(keep, head * front)
            keep = np.maximum(keep, head * 0.45)          # the rest of the bare head and neck line
        keep = np.maximum(keep, np.clip(hands * 1.2, 0, 1) * 0.9)
    elif 'hair' in name or 'beard' in name:
        # the fringe and whatever frames the face matter; the back of the head is one smooth cap
        hp = points
        zmid, depth = (hp[:, 2].min() + hp[:, 2].max()) / 2, max(np.ptp(hp[:, 2]), 1e-6)
        keep = np.maximum(keep, np.clip((points[:, 2] - zmid) / (depth * 0.5) + 0.25, 0, 1) * 0.6)
    keep = np.where(feet > 0.6, keep * 0.5, keep)
    return np.clip(np.maximum(keep, part['painted']), 0, 1)


def reduce(points, tris, keep=None, ratio=None, mirror=False, halvings=0):
    """One piece through Blender's Decimate modifier. With `ratio`: edge collapse, weighted by `keep`. With
    `halvings`: un-subdivide, which suits the lofted tubes the people are built from (locks, fingers, sleeves):
    every second ring and every second side goes, and the piece stays regular. -> points, tris"""
    mesh = bpy.data.meshes.new('part')
    mesh.from_pydata(points.tolist(), [], tris.tolist())
    mesh.update()
    if halvings:
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.join_triangles(bm, faces=bm.faces[:], angle_face_threshold=math.radians(50), angle_shape_threshold=math.radians(50))
        bm.to_mesh(mesh)
        bm.free()
    ob = bpy.data.objects.new('part', mesh)
    bpy.context.scene.collection.objects.link(ob)
    mod = ob.modifiers.new('reduce', 'DECIMATE')
    if halvings:
        mod.decimate_type = 'UNSUBDIV'
        mod.iterations = halvings
    else:
        group = ob.vertex_groups.new(name='give')
        # Decimate collapses the HIGH weights first: hand it 1 - keep
        for i, g in enumerate((1.0 - keep).tolist()):
            group.add([i], g, 'REPLACE')
        mod.decimate_type = 'COLLAPSE'
        mod.ratio = ratio
        mod.vertex_group = 'give'
        mod.vertex_group_factor = 6.0
        mod.use_collapse_triangulate = True
        mod.use_symmetry = mirror
        mod.symmetry_axis = 'X'
    graph = bpy.context.evaluated_depsgraph_get()
    done = bpy.data.meshes.new_from_object(ob.evaluated_get(graph))
    done.calc_loop_triangles()
    out_p = np.zeros(len(done.vertices) * 3, np.float64)
    done.vertices.foreach_get('co', out_p)
    out_t = np.zeros(len(done.loop_triangles) * 3, np.int64)
    done.loop_triangles.foreach_get('vertices', out_t)
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(mesh)
    bpy.data.meshes.remove(done)
    out_p, out_t = out_p.reshape(-1, 3), out_t.reshape(-1, 3)
    if not len(out_t):
        return out_p, out_t
    used = np.unique(out_t)
    remap = np.full(len(out_p), -1)
    remap[used] = np.arange(len(used))
    return out_p[used], remap[out_t]


def is_mirrored(points, tol=2e-3):
    """Is this piece the same left and right? (then it is collapsed symmetrically, so a face stays even)"""
    if len(points) < 8:
        return False
    key = set(map(tuple, np.round(points / tol).astype(np.int64).tolist()))
    flipped = np.round(points * np.array([-1, 1, 1]) / tol).astype(np.int64).tolist()
    hits = sum(1 for k in flipped if tuple(k) in key)
    return hits > 0.97 * len(points)


def islands(tris, count):
    """Connected pieces of a welded part: a list of triangle index arrays."""
    parent = np.arange(count)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for t in tris:
        r = find(t[0])
        parent[find(t[1])] = r
        parent[find(t[2])] = r
    roots = np.array([find(t[0]) for t in tris])
    return [np.nonzero(roots == r)[0] for r in np.unique(roots)]


class Standard:
    """The standard surface of one part: where the light one is measured against and gets its look from."""

    def __init__(self, part, rows=None):
        self.P, self.T = part['P'], part['T'] if rows is None else part['T'][rows]
        self.N, self.C, self.W = part['N'], part['C'], part['dense']
        self.face_n, _ = tri_normals(self.P, self.T)
        self.bvh = BVHTree.FromPolygons([Vector(p) for p in self.P.tolist()], self.T.tolist(), all_triangles=True)

    def face_at(self, at, facing=None, reach=0.004):
        """The nearest standard triangle; with `facing`, the nearest one that looks the same way (thin shells have a
        second layer a millimetre behind)."""
        loc, _n, index, dist = self.bvh.find_nearest(Vector(at))
        if facing is None or self.face_n[index] @ facing > 0.2:
            return index, np.array(loc), dist
        best = None
        for loc2, _n2, index2, dist2 in self.bvh.find_nearest_range(Vector(at), reach):
            if self.face_n[index2] @ facing > 0.2 and (best is None or dist2 < best[2]):
                best = (index2, np.array(loc2), dist2)
        return best or (index, np.array(loc), dist)

    def sample(self, at, facing=None):
        index, loc, _d = self.face_at(at, facing)
        tri = self.T[index]
        return tri, barycentric(loc, self.P[tri[0]], self.P[tri[1]], self.P[tri[2]])


def damage(std, src_points, points, tris):
    """How far a collapsed piece strays from the standard one: (folded faces, millimetres off, millimetres lost)."""
    face_n, area = tri_normals(points, tris)
    centre = points[tris].mean(1)
    folded, off = 0, 0.0
    for t in range(len(tris)):
        if area[t] < 1e-10:
            continue
        index, _loc, dist = std.face_at(centre[t], face_n[t])
        if std.face_n[index] @ face_n[t] < 0.25:
            folded += 1
        off = max(off, dist)
    # the other way round: a lock's tip or a finger that the collapse cut short
    bvh = BVHTree.FromPolygons([Vector(p) for p in points.tolist()], tris.tolist(), all_triangles=True)
    lost = 0.0
    for sp in src_points:
        lost = max(lost, bvh.find_nearest(Vector(sp))[3])
    return folded, off * 1000, lost * 1000


def loft_rings(points, tris):
    """The people are built from lofts: rings of k points joined by strips of quads, closed by a point at each end
    or left open (locks of hair, fingers, sleeves, boots). If this piece is one, return (rings, end0, end1): the
    rings as lists of vertex indices, point j of one ring next to point j of the following one; an end is the index
    of its closing point, or None when that end is open. Otherwise None."""
    count = len(points)
    if count < 10 or len(tris) > 2400:
        return None
    near = [set() for _ in range(count)]
    edge_use = {}
    for t in tris.tolist():
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            near[a].add(b)
            near[b].add(a)
            key = (a, b) if a < b else (b, a)
            edge_use[key] = edge_use.get(key, 0) + 1
    if any(n > 2 for n in edge_use.values()):
        return None
    rim = set()
    for (a, b), n in edge_use.items():
        if n == 1:
            rim.update((a, b))

    def cycle(members):
        """Order a ring by walking its own edges; None if it is not one closed loop."""
        members = set(members)
        start = next(iter(members))
        ring, prev, v = [start], None, start
        while True:
            step = [x for x in near[v] if x in members and x != prev]
            if len([x for x in near[v] if x in members]) != 2:
                return None
            v, prev = (step[0] if step[0] != prev else step[-1]), v
            if v == start:
                break
            ring.append(v)
            if len(ring) > len(members):
                return None
        return ring if len(ring) == len(members) else None

    def layers(first):
        dist = np.full(count, -1)
        for v in first:
            dist[v] = 0
        out, front = [list(first)], list(first)
        while front:
            nxt = []
            for v in front:
                for x in near[v]:
                    if dist[x] < 0:
                        dist[x] = len(out)
                        nxt.append(x)
            if nxt:
                out.append(nxt)
            front = nxt
        return out if (dist >= 0).all() else None

    def from_start(first, tip):
        ls = layers(first)
        if not ls:
            return None
        body = ls[1:] if tip is not None else ls
        end1 = None
        if len(body[-1]) == 1 and len(body) > 2:
            end1 = body[-1][0]
            body = body[:-1]
        k = len(body[0])
        if k < 4 or len(body) < 2 or any(len(r) != k for r in body):
            return None
        if end1 is not None and end1 in rim:
            return None
        rings = []
        for r in body:
            ring = cycle(r)
            if ring is None:
                return None
            if rings:
                # turn the ring so that its points sit over the previous ring's
                prev = points[rings[-1]]
                best = None
                for order in (ring, ring[::-1]):
                    arr = points[order]
                    for shift in range(k):
                        d = ((np.roll(arr, -shift, 0) - prev) ** 2).sum()
                        if best is None or d < best[0]:
                            best = (d, order[shift:] + order[:shift])
                ring = best[1]
            rings.append(ring)
        # an open end must really be the rim; a closed one must not touch it
        if tip is None and not set(rings[0]) <= rim:
            return None
        if end1 is None and not set(rings[-1]) <= rim:
            return None
        if len(rim - set(rings[0]) - set(rings[-1])):
            return None
        return rings, tip, end1

    if rim:
        # start from one open edge loop
        start = next(iter(rim))
        loop, front = {start}, [start]
        while front:
            v = front.pop()
            for x in near[v]:
                key = (v, x) if v < x else (x, v)
                if x in rim and x not in loop and edge_use[key] == 1:
                    loop.add(x)
                    front.append(x)
        return from_start(sorted(loop), None)
    for v in sorted(range(count), key=lambda i: -len(near[i]))[:12]:
        if len(near[v]) >= 4:
            found = from_start([v], v)
            if found:
                return found
    return None


def loft_versions(std, points, loft):
    """Lighter lofts from the same rings: only the rings the shape needs (those where it bends or changes width),
    and fewer sides. -> [(points, tris, how)]"""
    rings, end0, end1 = loft
    k, m = len(rings[0]), len(rings)
    R = np.array([points[r] for r in rings])                      # rings x k x 3
    centre = R.mean(1)
    along = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(centre, axis=0), axis=1))])

    def needed(eps):
        """Douglas-Peucker over the rings: drop a ring when the two kept around it give it back within eps."""
        keep = {0, m - 1}

        def split(a, b):
            if b - a < 2:
                return
            worst, at = 0.0, None
            span = max(along[b] - along[a], 1e-9)
            for r in range(a + 1, b):
                t = (along[r] - along[a]) / span
                err = np.linalg.norm(R[r] - (R[a] * (1 - t) + R[b] * t), axis=1).max()
                if err > worst:
                    worst, at = err, r
            if worst > eps:
                keep.add(at)
                split(a, at)
                split(at, b)
        split(0, m - 1)
        return sorted(keep)

    ring_sets = []
    for eps in (0.0012, 0.002, 0.003, 0.0045, 0.006, 0.008):
        rs = needed(eps)
        if rs not in ring_sets:
            ring_sets.append(rs)
    side_counts = sorted({k, max(5, round(k * 0.75)), max(5, k // 2)}, reverse=True)
    out = []
    for keep_rings in ring_sets:
        for n in side_counts:
            if n > k or (len(keep_rings) == m and n == k):
                continue
            if n == k:
                grid = R[keep_rings]
            else:
                # n points round each ring, evenly by index (the rings are in step, so the new sides are too)
                u = np.arange(n) * k / n
                i0 = np.floor(u).astype(int) % k
                f = (u - np.floor(u))[None, :, None]
                grid = R[keep_rings][:, i0] * (1 - f) + R[keep_rings][:, (i0 + 1) % k] * f
                # a polygon with fewer corners is narrower: widen it half-way back
                wide = 1 + 0.5 * (math.sqrt((k * math.sin(2 * math.pi / k)) / (n * math.sin(2 * math.pi / n))) - 1)
                mid = grid.mean(1, keepdims=True)
                grid = mid + (grid - mid) * wide
            rows = len(keep_rings)
            pts = [grid.reshape(-1, 3)]
            tris = []
            for a in range(rows - 1):
                for j in range(n):
                    j1 = (j + 1) % n
                    tris += [(a * n + j, a * n + j1, (a + 1) * n + j1), (a * n + j, (a + 1) * n + j1, (a + 1) * n + j)]
            extra = rows * n
            for end, row, flip in ((end0, 0, True), (end1, rows - 1, False)):
                if end is None:
                    continue
                pts.append(points[end][None])
                for j in range(n):
                    j1 = (j + 1) % n
                    tris.append((extra, row * n + j1, row * n + j) if flip else (extra, row * n + j, row * n + j1))
                extra += 1
            pts, tris = np.concatenate(pts), np.array(tris)
            # which way round? the same as the standard surface under the first strip
            face_n, _ = tri_normals(pts, tris)
            votes = 0
            for t in range(0, min(len(tris), 2 * n)):
                index_s, _loc, _d = std.face_at(pts[tris[t]].mean(0))
                votes += 1 if std.face_n[index_s] @ face_n[t] > 0 else -1
            if votes < 0:
                tris = tris[:, ::-1].copy()
            out.append((pts, tris, 'loft %d/%d rings %d/%d sides' % (rows, m, n, k)))
    return out


RATIOS = (0.16, 0.2, 0.25, 0.3, 0.36, 0.42, 0.5, 0.58, 0.66, 0.75, 0.85)


def menu(std, points, tris, keep, tolerance, protected, allow_loft=True):
    """Every clean way to make this piece lighter, smallest first: [(points, tris, how)]. Clean = no face folded
    over, the surface within `tolerance` mm of the standard one and nothing of it cut short. The piece as it is
    always closes the list."""
    out = []
    if not protected:
        mirror = is_mirrored(points)
        loft = loft_rings(points, tris) if allow_loft else None
        made = loft_versions(std, points, loft) if loft else []
        made += [(*reduce(points, tris, keep=keep, ratio=r, mirror=mirror), 'collapse %.2f' % r) for r in RATIOS]
        seen = set()
        for np_, nt, how in made:
            if len(nt) < 4 or len(nt) >= len(tris) or len(nt) in seen:
                continue
            folded, off, lost = damage(std, points, np_, nt)
            if DEBUG:
                print(f'      piece {len(tris)} {how} -> {len(nt)}: folded {folded}, off {off:.1f} mm, lost {lost:.1f} mm (allowed {tolerance})')
            if folded == 0 and off <= tolerance and lost <= tolerance * LOST:
                seen.add(len(nt))
                out.append((np_, nt, how))
    out.sort(key=lambda o: len(o[1]))
    out.append((points, tris, 'as it is'))
    return out


# -------------------------------------------------------------------------------------- 3. look and weights back
def transfer(std, points, tris):
    """Normals (per corner), AO and weights for the collapsed part from the standard surface of the same part."""
    face_n, _ = tri_normals(points, tris)
    # per vertex: AO and weights (from the layer that faces the same way as the vertex)
    vertex_n = np.zeros_like(points)
    for k in range(3):
        np.add.at(vertex_n, tris[:, k], face_n)
    vertex_n /= np.maximum(np.linalg.norm(vertex_n, axis=1, keepdims=True), 1e-12)
    colour = np.zeros((len(points), std.C.shape[1]))
    dense = np.zeros((len(points), std.W.shape[1]))
    for i, p in enumerate(points):
        tri, bc = std.sample(p, vertex_n[i])
        colour[i] = bc @ std.C[tri]
        dense[i] = bc @ std.W[tri]
    # per corner: the shading normal the standard surface has just inside this triangle (so hard edges stay hard,
    # and the hair keeps its authored soft normals)
    centre = points[tris].mean(1)
    corner_n = np.zeros((len(tris), 3, 3))
    for t in range(len(tris)):
        for k in range(3):
            p = points[tris[t, k]]
            tri, bc = std.sample(p * 0.8 + centre[t] * 0.2, face_n[t])
            n = bc @ std.N[tri]
            length = np.linalg.norm(n)
            corner_n[t, k] = n / length if length > 1e-8 else face_n[t]
    # weld corners of a vertex whose normals agree (within ~25 degrees); split the others
    out_p, out_n, out_c, out_w, out_t = [], [], [], [], np.zeros_like(tris)
    by_vertex = {}
    for t in range(len(tris)):
        for k in range(3):
            by_vertex.setdefault(int(tris[t, k]), []).append((t, k))
    cos_limit = math.cos(math.radians(25))
    for v, corners in by_vertex.items():
        groups = []                                       # [sum normal, [corners]]
        for t, k in corners:
            n = corner_n[t, k]
            for g in groups:
                if (g[0] / np.linalg.norm(g[0])) @ n > cos_limit:
                    g[0] = g[0] + n
                    g[1].append((t, k))
                    break
            else:
                groups.append([n.copy(), [(t, k)]])
        for total, members in groups:
            index = len(out_p)
            out_p.append(points[v])
            out_n.append(total / np.linalg.norm(total))
            out_c.append(colour[v])
            out_w.append(dense[v])
            for t, k in members:
                out_t[t, k] = index
    return np.array(out_p), np.array(out_n), np.array(out_c), np.array(out_w), out_t


def top_four(dense):
    order = np.argsort(-dense, axis=1)[:, :4]
    weights = np.take_along_axis(dense, order, 1)
    weights[weights < 1e-4] = 0
    weights /= np.maximum(weights.sum(1, keepdims=True), 1e-12)
    order = np.where(weights > 0, order, 0)
    return order.astype(np.uint8), weights.astype(np.float32)


# -------------------------------------------------------------------------------------------------- one character
def keep_factor(name):
    low = name.lower()
    for key, f in KEEP:
        if key in low:
            return f
    return 1.0


def lighten(name, target):
    src = os.path.join(MODELS, f'{name}.glb')
    js, binary = read_glb(src)
    assert len(js['meshes']) == 1, f'{name}: one mesh expected'
    assert not js.get('textures') and not js.get('images'), f'{name}: textures cannot go into a palette'
    mesh_node = next(n for n in js['nodes'] if 'mesh' in n)
    assert all(k not in mesh_node for k in ('translation', 'rotation', 'scale', 'matrix')), f'{name}: the mesh node has a transform'
    skin = js['skins'][mesh_node['skin']]
    bones = [js['nodes'][j]['name'] for j in skin['joints']]

    parts, palette = [], []
    for prim in js['meshes'][0]['primitives']:
        mat = js['materials'][prim['material']]
        pbr = mat.get('pbrMetallicRoughness', {})
        assert mat.get('alphaMode', 'OPAQUE') == 'OPAQUE' and not mat.get('doubleSided'), f'{name}/{mat["name"]}: see-through or two-sided'
        assert not any(mat.get('emissiveFactor', [0, 0, 0])), f'{name}/{mat["name"]}: glows — needs its own primitive'
        assert set(prim['attributes']) == {'POSITION', 'NORMAL', 'COLOR_0', 'JOINTS_0', 'WEIGHTS_0'}, f'{name}: unexpected attributes'
        at = prim['attributes']
        P = accessor(js, binary, at['POSITION']).astype(np.float64)
        T = accessor(js, binary, prim['indices']).reshape(-1, 3).astype(np.int64)
        J = accessor(js, binary, at['JOINTS_0']).astype(np.int64)
        W = accessor(js, binary, at['WEIGHTS_0']).astype(np.float64)
        dense = np.zeros((len(P), len(bones)))
        for k in range(4):
            np.add.at(dense, (np.arange(len(P)), J[:, k]), W[:, k])
        dense /= np.maximum(dense.sum(1, keepdims=True), 1e-12)
        parts.append({'name': mat['name'], 'P': P, 'T': T, 'N': accessor(js, binary, at['NORMAL']).astype(np.float64),
                      'C': accessor(js, binary, at['COLOR_0'])[:, :3].astype(np.float64), 'dense': dense})
        palette.append({'name': mat['name'], 'color': [round(v, 6) for v in pbr.get('baseColorFactor', [1, 1, 1, 1])[:3]],
                        'roughness': round(pbr.get('roughnessFactor', 1), 4), 'metalness': round(pbr.get('metallicFactor', 1), 4)})
    assert len(parts) <= 16, f'{name}: the palette holds 16 parts'
    before = sum(len(p['T']) for p in parts)

    # 1. never seen (per welded triangle; taken out below, piece by piece)
    work = []
    for p, (vis, sealed) in zip(parts, visible_faces(parts)):
        wp, wt, inverse, ok = weld(p['P'], p['T'])
        # Only what is sealed in goes. Skin that is merely covered in the rest pose (a shin inside a boot, an arm in a
        # sleeve) stays: the standard models let it push through when a knee bends, and taking it out changes the look.
        vis = ~sealed[ok] if '--noseal' not in sys.argv else np.ones(int(ok.sum()), bool)
        dense = np.zeros((len(wp), len(bones)))
        dense[inverse] = p['dense']                       # (split copies of a vertex carry the same weights)
        # colour painted into the vertices (blush on cheeks and knees, wrinkles, freckles' ground): the ambient occlusion
        # is grey, paint is not. Those vertices and their neighbours are kept, or the paint would smear away.
        colour = np.zeros((len(wp), 3))
        colour[inverse] = p['C']
        chroma = np.abs(colour - colour.mean(1, keepdims=True)).max(1)
        painted = (chroma > 0.012).astype(float)
        if painted.any():
            for _ in range(2):                             # two rings round the paint: its soft edge
                near = np.zeros(len(wp), bool)
                near[wt[(painted[wt] > 0).any(1)].reshape(-1)] = True
                painted = near.astype(float)
        work.append({'name': p['name'], 'P': wp, 'T': wt, 'dense': dense, 'seen': vis, 'painted': painted, 'rows': np.nonzero(ok)[0]})
    shown = sum(int(w['seen'].sum()) for w in work)

    # 2. lighter, piece by piece (a lock of hair, a finger, a boot, a button): every clean way to do it is tried
    # (menu), then one scale k for the whole character picks from the menus so that the total meets the target
    standards = [Standard(p) for p in parts]
    pieces = []
    for i, w in enumerate(work):
        keep = protection(w, bones, w['P'])
        head = w['dense'][:, bones.index('head')] if 'head' in bones else np.zeros(len(w['P']))
        low = w['name'].lower()
        feet_cols = [bones.index(b) for b in ('foot_L', 'foot_R') if b in bones]
        for tri_ids in islands(w['T'], len(w['P'])):
            t = w['T'][tri_ids]
            vis = w['seen'][tri_ids]
            if not vis.any():
                continue                                  # a whole piece nobody can see
            on_head = head[np.unique(t)].mean() > 0.5
            # the eyes, pupils, highlights, lashes, brows and mouth lie a tenth of a millimetre above one another:
            # they are what a child looks at, and they stay exactly as they are. So does anything tiny.
            # A shin inside a boot: the standard models let the skin push through the boot when a knee bends, by a
            # millimetre here and there. Any change to either surface changes that picture, so both stay as they are.
            kind = 'skin' if 'skin' in low else 'shoe' if any(k in low for k in FOOTWEAR) else None
            rubbing = False
            if kind:
                mine = np.unique(t)
                loose = [v for v in mine if w['dense'][v, feet_cols].sum() < 0.9]
                others = [standards[j] for j, o in enumerate(work) if j != i and (('skin' in o['name'].lower()) if kind == 'shoe' else any(k in o['name'].lower() for k in FOOTWEAR))]
                if others and len(loose) > 0.2 * len(mine):
                    close = sum(1 for v in loose if min(o.bvh.find_nearest(Vector(w['P'][v]))[3] for o in others) < RUB)
                    rubbing = close > 0.2 * len(mine)
            # cords, straps' edges, spectacle frames: a piece thinner than a few millimetres has nothing to give
            cloud = w['P'][np.unique(t)]
            extent = np.linalg.svd(cloud - cloud.mean(0), compute_uv=False) / math.sqrt(len(cloud)) * 3.4   # ~ full widths
            thin = extent[-1] < 0.005 or (extent[1] < 0.012 and extent[0] > 0.05)
            fixed = thin or rubbing or len(t) <= 24 or (on_head and (len(t) <= 64 or any(k in low for k in ('eye', 'iris', 'dark', 'lash', 'brow', 'mouth', 'tongue', 'tooth', 'glass'))))
            # a loft that is (nearly) all in view is made lighter as a loft; anything else loses its unseen faces first.
            # The bare head is never treated as a loft: the face is drawn on it.
            whole = vis.mean() > 0.85 and not (on_head and 'skin' in low) and not w['painted'][np.unique(t)].any()
            if not whole or fixed:
                t = t[vis]
            used = np.unique(t)
            remap = np.full(len(w['P']), -1)
            remap[used] = np.arange(len(used))
            # bare skin and footwear slide in and out of one another at knees, ankles and cuffs: a millimetre matters there
            tolerance = TOLERANCE_MM * (0.4 if 'skin' in low or any(k in low for k in FOOTWEAR) else 1.0)
            # measured against, and given the look of, its own piece of the standard model only (a sleeve hangs a
            # centimetre from the coat: it must never take the coat's weights)
            own = Standard(parts[i], w['rows'][tri_ids])
            pieces.append({'part': i, 'factor': keep_factor(w['name']), 'count': len(t), 'std': own,
                           'menu': menu(own, w['P'][used], remap[t], keep[used], tolerance, fixed, allow_loft=whole)})

    def run(scale):
        total = 0
        for pc in pieces:
            want = pc['count'] * min(1.0, max(MIN_RATIO, scale * pc['factor']))
            # the lightest clean version that is not below what this piece should keep
            pc['now'] = next((o for o in pc['menu'] if len(o[1]) >= want * 0.92), pc['menu'][-1])
            total += len(pc['now'][1])
        return total

    lo, hi = 0.0, 1.2
    for _ in range(24):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if run(mid) < target else (lo, mid)
    floor = run(0.0)                                      # as light as it goes without damage
    if floor < target:
        run(hi)
    out, rows = [], []
    for i, (w, p) in enumerate(zip(work, parts)):
        mine = [pc for pc in pieces if pc['part'] == i]
        if not mine:
            rows.append({'part': w['name'], 'standard': len(p['T']), 'seen': 0, 'light': 0})
            continue
        how = {}
        got = []
        for pc in mine:
            how[pc['now'][2].split(' ')[0]] = how.get(pc['now'][2].split(' ')[0], 0) + 1
            # 3. look and weights from the standard surface
            got.append(transfer(pc['std'], pc['now'][0], pc['now'][1]))
        offs2 = np.cumsum([0] + [len(g[0]) for g in got])
        fp, fn, fc, fw = (np.concatenate([g[k] for g in got]) for k in range(4))
        ft = np.concatenate([g[4] + offs2[k] for k, g in enumerate(got)])
        out.append({'index': i, 'P': fp, 'N': fn, 'C': fc, 'W': fw, 'T': ft})
        rows.append({'part': w['name'], 'standard': len(p['T']), 'seen': int(w['seen'].sum()), 'light': len(ft), 'pieces': len(mine), 'how': how,
                     'ratio': round(len(ft) / max(1, len(p['T'])), 3)})

    # one primitive
    P = np.concatenate([o['P'] for o in out]).astype(np.float32)
    N = np.concatenate([o['N'] for o in out]).astype(np.float32)
    C = np.concatenate([o['C'] for o in out])
    dense = np.concatenate([o['W'] for o in out])
    part_index = np.concatenate([np.full(len(o['P']), o['index'], np.uint8) for o in out])
    offs = np.cumsum([0] + [len(o['P']) for o in out])
    T = np.concatenate([o['T'] + offs[i] for i, o in enumerate(out)])
    assert len(P) < 65536
    J, W = top_four(dense)
    colour = np.concatenate([np.clip(np.round(C * 65535), 0, 65535), np.full((len(C), 1), 65535)], 1).astype(np.uint16)
    part4 = np.zeros((len(P), 4), np.uint8)               # vertex attributes sit on 4-byte boundaries
    part4[:, 0] = part_index

    # the standard file with its mesh taken out and the light one put in
    dropped = set()
    for prim in js['meshes'][0]['primitives']:
        dropped.update(prim['attributes'].values())
        dropped.add(prim['indices'])
    new_bin, views, accessors, remap = bytearray(), [], [], {}

    def push(data, target=None, stride=None):
        new_bin.extend(b'\x00' * (-len(new_bin) % 4))
        view = {'buffer': 0, 'byteOffset': len(new_bin), 'byteLength': len(data)}
        if target:
            view['target'] = target
        if stride:
            view['byteStride'] = stride
        new_bin.extend(data)
        views.append(view)
        return len(views) - 1

    for i, a in enumerate(js['accessors']):
        if i in dropped:
            continue
        copy = dict(a)
        copy['bufferView'] = push(raw_accessor_bytes(js, binary, i))
        copy.pop('byteOffset', None)
        remap[i] = len(accessors)
        accessors.append(copy)

    def add(array, kind, component, target, normalized=False, bounds=False, stride=None):
        a = {'bufferView': push(array.tobytes(), target, stride), 'componentType': component, 'count': len(array), 'type': kind}
        if normalized:
            a['normalized'] = True
        if bounds:
            a['min'], a['max'] = array.min(0).tolist(), array.max(0).tolist()
        accessors.append(a)
        return len(accessors) - 1

    prim = {'attributes': {
        'POSITION': add(P, 'VEC3', 5126, 34962, bounds=True),
        'NORMAL': add(N, 'VEC3', 5126, 34962),
        'COLOR_0': add(colour, 'VEC4', 5123, 34962, normalized=True),
        'JOINTS_0': add(J, 'VEC4', 5121, 34962),
        'WEIGHTS_0': add(W, 'VEC4', 5126, 34962),
        '_PART': add(part4, 'SCALAR', 5121, 34962, stride=4),
    }, 'indices': add(T.astype(np.uint16).reshape(-1), 'SCALAR', 5123, 34963), 'material': 0}
    # (_PART: one byte a vertex, on a 4-byte stride)
    accessors[prim['attributes']['_PART']]['count'] = len(P)

    js = json.loads(json.dumps(js))
    js['accessors'], js['bufferViews'], js['buffers'] = accessors, views, [{'byteLength': len(new_bin) + (-len(new_bin) % 4)}]
    for s in js['skins']:
        s['inverseBindMatrices'] = remap[s['inverseBindMatrices']]
    for anim in js.get('animations', []):
        for s in anim['samplers']:
            s['input'], s['output'] = remap[s['input']], remap[s['output']]
    js['materials'] = [{'name': 'People palette', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': 0.6}}]
    js['meshes'] = [{'name': js['meshes'][0]['name'], 'primitives': [prim],
                     'extras': {'people': {'lite': 1, 'source': f'{name}.glb', 'parts': palette}}}]
    js['asset']['generator'] = js['asset'].get('generator', '') + ' + art/blender/light_people.py'
    dst = os.path.join(MODELS, f'{name}.lite.glb')
    write_glb(dst, js, new_bin)
    info = {'name': name, 'standard': before, 'seen': shown, 'light': len(T), 'target': target, 'floor': floor, 'vertices': len(P), 'parts': rows,
            'bytes': [os.path.getsize(src), os.path.getsize(dst)]}
    print(f'[light] {name}: {before} -> {shown} visible -> {len(T)} tris (target {target}, cleanly reachable {floor}), {len(P)} verts, '
          f'{info["bytes"][0] // 1024} -> {info["bytes"][1] // 1024} KB')
    for r in rows:
        print(f'         {r["part"]:<20} {r["standard"]:>6} {r["seen"]:>6} {r["light"]:>6}  x{r.get("ratio", 0)}  {r.get("how", "")}')
    return info


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opts = dict(a.lstrip('-').split('=', 1) for a in argv if '=' in a)
    names = [n for n in PEOPLE if 'only' not in opts or n in opts['only'].split(',')]
    report = [lighten(n, PEOPLE[n]) for n in names]
    if opts.get('report'):
        os.makedirs(os.path.dirname(os.path.abspath(opts['report'])), exist_ok=True)
        with open(opts['report'], 'w', encoding='utf8') as f:
            json.dump(report, f, indent=1)


main()
