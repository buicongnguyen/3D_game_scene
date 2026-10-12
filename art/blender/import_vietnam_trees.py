"""Finish documented imports: collider fit, real ray-traced vertex AO, embedded texture."""
import os
import sys
import math
import bpy
import bmesh
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(__file__))
from kit import bake_ao, export, clear_scene_objects, rod, join

args = sys.argv[sys.argv.index('--') + 1:]
staging, output = args[:2]
names = args[2:] or ['tree-vn-bamboo', 'tree-vn-coconut', 'tree-vn-mango']
for name in names:
    is_tree = name.startswith('tree-vn-')
    clear_scene_objects()
    bpy.ops.import_scene.gltf(filepath=os.path.join(staging, name + '.glb'))
    bpy.context.view_layer.update()
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    # Bake the imported quantization/height transforms into mesh coordinates.
    for obj in meshes:
        world = obj.matrix_world.copy()
        obj.data.transform(world)
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        # Long source triangles span the entire shaft. Introduce the collider
        # boundary explicitly so fitting vertices also fits the complete surface.
        if is_tree:
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                                  plane_co=(0., 0., 5.), plane_no=(0., 0., 1.), dist=1e-6)
            bm.to_mesh(obj.data)
            bm.free()
            obj.data.update()
    radius = max(math.hypot(v.co.x, v.co.y) for o in meshes for v in o.data.vertices)
    crown_scale = min(1., 3.25 / radius) if is_tree else 1.
    lower_radius = max(math.hypot(v.co.x, v.co.y) * crown_scale
                       for o in meshes for v in o.data.vertices if v.co.z <= 5.)
    lower_scale = min(1., .34 / lower_radius) if is_tree else 1.
    for obj in meshes:
        for vertex in obj.data.vertices:
            p = vertex.co
            p.x *= crown_scale
            p.y *= crown_scale
            # The original donor collider is radius .38, height 5. Preserve its
            # clearance; return smoothly to the authored crown from 5 to 6.2 m.
            t = max(0., min(1., (p.z - 5.) / 1.2))
            t = t * t * (3. - 2. * t)
            fit = lower_scale + (1. - lower_scale) * t
            p.x *= fit
            p.y *= fit
        obj.data.update()
        # Some source culm/trunk shells have inward winding. Weld only coincident
        # seams, then orient closed shells outwards before the AO ray trace.
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        # Explicit signed volume avoids ambiguous normal propagation on narrow
        # disconnected source shells. Open, double-sided leaf cards need no flip.
        unseen = set(bm.faces)
        while unseen:
            pending = [unseen.pop()]
            shell = []
            while pending:
                face = pending.pop()
                shell.append(face)
                for edge in face.edges:
                    for neighbour in edge.link_faces:
                        if neighbour in unseen:
                            unseen.remove(neighbour)
                            pending.append(neighbour)
            if all(len(edge.link_faces) == 2 for face in shell for edge in face.edges):
                volume = 0.
                for face in shell:
                    points = [vertex.co for vertex in face.verts]
                    for i in range(1, len(points) - 1):
                        volume += points[0].dot(points[i].cross(points[i + 1])) / 6.
                if volume < 0.:
                    bmesh.ops.reverse_faces(bm, faces=shell)
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
    if name == 'bush-vn-banana':
        # Source banana cards begin with a transparent atlas margin, making four
        # upper leaves appear detached. Connect the visible midrib bases with
        # thin petioles in the existing stem material; keep the source silhouette.
        petioles = []
        for obj in meshes:
            mesh = obj.data
            leaf_faces = {p.index for p in mesh.polygons
                          if obj.material_slots[p.material_index].material.name == 'VN leaves banana'}
            while leaf_faces:
                group = [leaf_faces.pop()]
                vertices = set(mesh.polygons[group[0]].vertices)
                changed = True
                while changed:
                    changed = False
                    for i in list(leaf_faces):
                        if vertices.intersection(mesh.polygons[i].vertices):
                            group.append(i)
                            vertices.update(mesh.polygons[i].vertices)
                            leaf_faces.remove(i)
                            changed = True
                if max(mesh.vertices[i].co.z for i in vertices) < .4:
                    continue  # retain the tiny basal shoots
                uv = {mesh.loops[li].vertex_index: mesh.uv_layers.active.data[li].uv.x
                      for i in group for li in mesh.polygons[i].loop_indices}
                lo, hi = min(uv.values()), max(uv.values())
                inner = [mesh.vertices[i].co for i in vertices if abs(uv[i] - lo) < 1e-5]
                outer = [mesh.vertices[i].co for i in vertices if abs(uv[i] - hi) < 1e-5]
                a = sum(inner, Vector()) / len(inner)
                b = sum(outer, Vector()) / len(outer)
                # The atlas's first opaque midrib pixel is ~24% along this card.
                tip = a.lerp(b, .26)
                stem = bpy.data.materials['VN banana stem']
                petioles.append(rod('Banana petiole', (0., 0., .67), tip, .015,
                                    material=stem, verts=4, r2=.008))
        if len(petioles) != 4:
            raise RuntimeError('Expected four upper banana leaves')
        meshes = [join(meshes + petioles, name)]
    # This is actual geometric AO. Cards are conservative opaque occluders in
    # this vertex bake; low strength keeps that approximation from darkening
    # the atlas excessively. Runtime alpha-tested shadows retain leaf cutouts.
    bake_ao(meshes, rays=48, distance=.6, strength=.45, ground=0., min_value=.65)
    export(name, meshes, out_dir=output)
