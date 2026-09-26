"""Railway and river family for Starline (see art/CONTRACTS.md, "Railway and river").

blender -b --factory-startup --python-exit-code 1 --python art/blender/build_railway.py [-- --only kobo,coach]

Exports public/models/<name>.glb for every model in the family (or the --only subset) and then saves
art/blender/source/railway.blend (compressed) assembled from every railway GLB on disk.

Shared track geometry: standard gauge 1.435 m (rail centres at x = +-0.7175), rail top at z = 0.
Modules: railway_common (helpers), railway_kobo, railway_coach, railway_viaduct, railway_river.
"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit
import railway_common, railway_kobo, railway_coach, railway_viaduct, railway_river

ORDER = ['kobo', 'coach', 'viaduct-span', 'viaduct-broken', 'viaduct-repair', 'viaduct-abutment', 'lamp-viaduct',
         'sleeper', 'tunnel-portal', 'ferry', 'dock', 'stepping-stone', 'stepping-stone-b', 'rowboat', 'lantern-boat',
         'landslide']

BUILDERS = {
    'kobo': lambda: railway_kobo.build('kobo'),
    'coach': lambda: railway_coach.build('coach'),
    'viaduct-span': lambda: railway_viaduct.build_span('viaduct-span'),
    'viaduct-broken': lambda: railway_viaduct.build_broken('viaduct-broken'),
    'viaduct-repair': lambda: railway_viaduct.build_repair('viaduct-repair'),
    'viaduct-abutment': lambda: railway_viaduct.build_abutment('viaduct-abutment'),
    'lamp-viaduct': lambda: railway_viaduct.build_lamp('lamp-viaduct'),
    'sleeper': lambda: railway_viaduct.build_sleeper('sleeper'),
    'tunnel-portal': lambda: railway_viaduct.build_tunnel('tunnel-portal'),
    'ferry': lambda: railway_river.build_ferry('ferry'),
    'dock': lambda: railway_river.build_dock('dock'),
    'stepping-stone': lambda: railway_river.build_stone('stepping-stone', seed=1),
    'stepping-stone-b': lambda: railway_river.build_stone('stepping-stone-b', seed=2),
    'rowboat': lambda: railway_river.build_rowboat('rowboat'),
    'lantern-boat': lambda: railway_river.build_lantern_boat('lantern-boat'),
    'landslide': lambda: railway_river.build_landslide('landslide'),
}


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    only = None
    no_save = '--no-save' in argv
    if '--only' in argv:
        only = [n.strip() for n in argv[argv.index('--only') + 1].split(',') if n.strip()]
        bad = [n for n in only if n not in BUILDERS]
        if bad:
            raise SystemExit(f'unknown railway model(s): {bad}; choose from {ORDER}')
    names = [n for n in ORDER if only is None or n in only]
    results = {}
    for n in names:
        t = time.time()
        info = BUILDERS[n]()
        results[n] = info
        print(f'BUILT {n} in {time.time() - t:.1f}s')
    if not no_save:
        on_disk = [n for n in ORDER if os.path.exists(os.path.join(kit.OUT, n + '.glb'))]
        kit.save_kit('railway', on_disk, spacing=4.0)
    for n, info in results.items():
        print(f'SUMMARY {n}: {info["tris"]} tris, {info["bytes"] // 1024} KB, {info["materials"]} mats, '
              f'nodes={[x for x in info["nodes"] if x]}')


main()
