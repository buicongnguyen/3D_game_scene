# Blender setup

Verified on 13 October 2026: the active portable installation is **Blender 5.2.2 LTS**.

```text
C:\Users\n\source\repos\3D_claudeopus55\.tools\blender-5.2.2-windows-x64\blender.exe
```

The Windows user environment variables `BLENDER` and `BLENDER_EXE` point to this executable. The video recorder accepts
either variable, and the separate workspace's existing Blender wrapper accepts `BLENDER_EXE`. Open a new terminal after
the update. In an already-running PowerShell session, refresh these two variables explicitly:

```powershell
$env:BLENDER = [Environment]::GetEnvironmentVariable('BLENDER', 'User')
$env:BLENDER_EXE = [Environment]::GetEnvironmentVariable('BLENDER_EXE', 'User')
& $env:BLENDER_EXE --version
```

There is also a **Blender 5.2 LTS** Start-menu shortcut. The previous 4.5.9 portable installations remain available.
Automated project work must still run Blender headlessly, in an isolated worktree, and direct review/test output into
ignored `.tools` folders. Do not rebuild tracked models merely to change Blender versions.

The Windows x64 archive came from the [official release directory](https://download.blender.org/release/Blender5.2/) and
was checked against Blender's published SHA-256 manifest before extraction:

```text
3849d17a682cba006075aaa3f3597ecb5c9c30ec31035b2e092c53e40679b535  blender-5.2.2-windows-x64.zip
```

Two authoring compatibility fixes accompany the update: the video encoder selects the `VIDEO` media type before FFmpeg
when that property exists, and character review rendering accepts Blender 5's `BLENDER_EEVEE` engine identifier. Both
retain compatibility with Blender 4.5. Existing game models and videos are unchanged.

Validation includes existing animated Mika and textured tropical-tree GLB import/export, fresh rig/animation helper
checks, front/side character review renders and a 12-frame H.264 encode. The same video encoder also succeeds on 4.5.9.
Both encoded videos play through correctly in Edge. The project's full 715-test suite and production build pass.
Local logs and temporary exports are under `.tools/blender-5-smoke`, `.tools/blender5-smoke` and `.tools/blender5-renders`
in the Blender-upgrade worktree.
