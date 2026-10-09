from pathlib import Path

import pytest

from scripts.build_backend import materialize_internal_links


def link(source: Path, target: Path, *, directory: bool = False) -> None:
    try:
        source.symlink_to(target, target_is_directory=directory)
    except OSError as error:
        if getattr(error, 'winerror', None) == 1314:
            pytest.skip('Creating symlink fixtures requires Windows symlink privilege.')
        raise


def test_python_framework_aliases_become_independent_resources(tmp_path):
    artifact = tmp_path / 'artifact'
    framework = artifact / 'Python.framework'
    version = framework / 'Versions' / '3.12'
    resources = version / 'Resources'
    resources.mkdir(parents=True)
    (resources / 'Info.plist').write_text('framework metadata')
    binary = version / 'Python'
    binary.write_bytes(b'fixture binary')
    binary.chmod(0o755)
    link(framework / 'Versions' / 'Current', Path('3.12'), directory=True)
    link(framework / 'Resources', Path('Versions/Current/Resources'), directory=True)
    link(framework / 'Python', Path('Versions/Current/Python'))
    link(artifact / 'libpython.dylib', Path('Python.framework/Python'))

    materialize_internal_links(artifact)

    assert not any(file.is_symlink() for file in artifact.rglob('*'))
    assert (framework / 'Resources/Info.plist').read_text() == 'framework metadata'
    assert (framework / 'Versions/Current/Python').read_bytes() == b'fixture binary'
    assert (artifact / 'libpython.dylib').read_bytes() == b'fixture binary'
    assert ((artifact / 'libpython.dylib').stat().st_mode & 0o777) == (binary.stat().st_mode & 0o777)
    (resources / 'Info.plist').write_text('changed original')
    assert (framework / 'Resources/Info.plist').read_text() == 'framework metadata'


@pytest.mark.parametrize('kind', ['external-file', 'external-directory', 'nested-external', 'cycle', 'broken'])
def test_backend_aliases_reject_escaping_and_cyclic_resources(tmp_path, kind):
    artifact = tmp_path / 'artifact'
    artifact.mkdir()
    outside = tmp_path / 'outside'
    outside.mkdir()
    (outside / 'sentinel').write_text('not a build resource')
    if kind == 'external-file':
        link(artifact / 'alias', outside / 'sentinel')
    elif kind == 'external-directory':
        link(artifact / 'alias', outside, directory=True)
    elif kind == 'nested-external':
        internal = artifact / 'internal'
        internal.mkdir()
        link(internal / 'escape', outside / 'sentinel')
        link(artifact / 'alias', internal, directory=True)
    elif kind == 'cycle':
        link(artifact / 'alias', artifact, directory=True)
    else:
        link(artifact / 'alias', artifact / 'missing')
    with pytest.raises((RuntimeError, OSError)):
        materialize_internal_links(artifact)
    assert (outside / 'sentinel').read_text() == 'not a build resource'
