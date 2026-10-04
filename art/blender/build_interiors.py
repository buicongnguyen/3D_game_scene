"""Interiors family for Starline: enterable rooms behind four front doors, and the keepsakes found inside.

blender -b --factory-startup --python-exit-code 1 --python art/blender/build_interiors.py [-- --only cottage,photo] [--no-save] [--out dir]

Rooms (public/models/interior-<id>.glb): cottage (Sora's), bakery (Hana's), mill (Ota's), station (Genzo's office).
Keepsakes (public/models/keepsake-<id>.glb): photo, recipe, float, ticket (floating pickups centred on the origin).
Short names work with --only (cottage, bakery, mill, station, photo, recipe, float, ticket).

Room conventions (art/CONTRACTS.md, "Interiors"):
  * Floor at z=0, room centred on the origin, the door in the -Y (front) wall, so it faces +Z in three.js like every
    building's front door. The runtime (src/world/interiors.js) hangs each room high above the valley.
  * Nodes: Spawn (player start inside the door, facing into the room), Exit (door interaction point), Item_keepsake,
    Item_kite (cottage), Light_1..3 (warm lamps), Gear_* / Pendulum (animated pivots, identity rest rotation).
  * Collision: meshes named Col_* (material `Collider`, hidden at runtime) with glTF extras walk / view / surface.
  * `Window view` panes are painted landscapes drawn unlit; `Interior glow` lamps are driven by the runtime.
Modules: interior_lib (toolkit), interior_rooms (shared furniture + the cottage), interior_bakery, interior_mill,
interior_station, interior_keepsakes.
A full build also saves art/blender/source/interiors.blend.
"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit
import arch_lib
import interior_rooms, interior_keepsakes
for _m in ('interior_bakery', 'interior_mill', 'interior_station', 'interior_kawabe_a', 'interior_kawabe_b', 'interior_kawabe_shop',
           'interior_takamori_a', 'interior_takamori_b', 'interior_boathouse', 'interior_shed'):
    try:
        __import__(_m)
    except ModuleNotFoundError as e:
        if e.name != _m:
            raise

ORDER = ['interior-cottage', 'interior-bakery', 'interior-mill', 'interior-station',
         'interior-kawabe-a', 'interior-kawabe-b', 'interior-kawabe-shop', 'interior-takamori-a', 'interior-takamori-b',
         'interior-boathouse', 'interior-shed',
         'keepsake-photo', 'keepsake-recipe', 'keepsake-float', 'keepsake-ticket']
BUILDERS = {**interior_rooms.BUILD, **interior_keepsakes.BUILD}
SHORT = {n.split('-', 1)[1]: n for n in ORDER}


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    only, save = None, True
    i = 0
    while i < len(args):
        a = args[i]
        if a == '--only':
            only = (only or []) + [SHORT.get(x.strip(), x.strip()) for x in args[i + 1].split(',') if x.strip()]
            i += 2
        elif a == '--no-save':
            save = False
            i += 1
        elif a == '--out':
            arch_lib.OUT_DIR[0] = os.path.abspath(args[i + 1])
            os.makedirs(arch_lib.OUT_DIR[0], exist_ok=True)
            i += 2
        else:
            only = (only or []) + [SHORT.get(a, a)]
            i += 1
    bad = [n for n in (only or []) if n not in BUILDERS]
    if bad:
        raise SystemExit(f'unknown interior model(s): {bad}; choose from {ORDER}')
    names = [n for n in ORDER if only is None or n in only]
    results = {}
    for n in names:
        t = time.time()
        results[n] = BUILDERS[n]()
        print(f'BUILT {n} in {time.time() - t:.1f}s')
    for n, info in results.items():
        print(f'SUMMARY {n:18s} {info["tris"]:6d} tris {info["bytes"] // 1024:5d} KB {info["materials"]} mats')
    if save and only is None and arch_lib.OUT_DIR[0] is None:
        on_disk = [n for n in ORDER if os.path.exists(os.path.join(kit.OUT, n + '.glb'))]
        kit.save_kit('interiors', on_disk, spacing=3.0)


main()
