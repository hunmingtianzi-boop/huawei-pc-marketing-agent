"""Download the pinned, reviewed official Skill. No credential reads or API calls."""
from pathlib import Path, PurePosixPath
import hashlib
import io
import shutil
import tempfile
import urllib.request
import zipfile
import stat
import json

URL = "https://app-dl.ima.qq.com/skills/ima-skills-1.1.10.zip"
SHA256 = "7e0d07cae0f98145dc5147e84b77bcc557e2fc4b256b08907922637952c20a7b"
ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "vendor" / "ima-skill"

def main():
    if DEST.exists():
        print("Existing vendor/ima-skill preserved. Set IMA_SKILL_PATH if using another reviewed version.")
        return
    with urllib.request.urlopen(URL, timeout=30) as response:
        blob = response.read(200_001)
    if len(blob) > 200_000 or hashlib.sha256(blob).hexdigest() != SHA256:
        raise ValueError("Official package hash/size changed; inspect update before executing any script")
    (ROOT / ".local-data").mkdir(exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        if sum(entry.file_size for entry in archive.infolist()) > 2_000_000:
            raise ValueError("Expanded size rejected")
        for entry in archive.infolist():
            p = PurePosixPath(entry.filename)
            if p.is_absolute() or ".." in p.parts or "\\" in entry.filename or stat.S_ISLNK(entry.external_attr >> 16):
                raise ValueError("Unsafe archive member")
        with tempfile.TemporaryDirectory(dir=ROOT / ".local-data") as tmp:
            archive.extractall(tmp)
            source = Path(tmp) / "ima-skill"
            assert json.loads((source / "meta.json").read_text())["version"] == "1.1.10"
            DEST.parent.mkdir(exist_ok=True)
            shutil.copytree(source, DEST)
    print(json.dumps({"status": "PASS", "scope": "static-package-only", "version": "1.1.10", "bytes": len(blob), "sha256": SHA256}))

if __name__ == "__main__":
    main()
