"""Stream info + full decode check for every mp4 in a folder.
   python check-dir.py <dir>"""
import subprocess, sys
from pathlib import Path
for f in sorted(Path(sys.argv[1]).glob('*.mp4')):
    info = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name,width,height,nb_frames,duration', '-of', 'csv=p=0', str(f)], capture_output=True, text=True).stdout.split()
    err = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(f), '-f', 'null', '-'], capture_output=True, text=True).stderr.strip()
    print(f.name, f.stat().st_size // 1_000_000, 'MB', info, 'decode:', err or 'ok')
