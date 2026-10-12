"""Finish documented imports: collider fit, real ray-traced vertex AO, embedded texture."""
import os
import sys
import math
import bpy
import bmesh
from mathutils import Matrix
sys.path.insert(0, os.path.dirname(__file__))
from kit import bake_ao, export, clear_scene_objects

staging, output = sys.argv[sys.argv.index('--') + 1:]
names = ['tree-vn-bamboo', 'tree-vn-coconut', 'tree-vn-mango']
for name in names:
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
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                              plane_co=(0., 0., 5.), plane_no=(0., 0., 1.), dist=1e-6)
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
    radius = max(math.hypot(v.co.x, v.co.y) for o in meshes for v in o.data.vertices)
    crown_scale = min(1., 3.25 / radius)
    lower_radius = max(math.hypot(v.co.x, v.co.y) * crown_scale
                       for o in meshes for v in o.data.vertices if v.co.z <= 5.)
    lower_scale = min(1., .34 / lower_radius)
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
    # This is actual geometric AO. Cards are conservative opaque occluders in
    # this vertex bake; low strength keeps that approximation from darkening
    # the atlas excessively. Runtime alpha-tested shadows retain leaf cutouts.
    bake_ao(meshes, rays=48, distance=.6, strength=.45, ground=0., min_value=.65)
    export(name, meshes, out_dir=output)
