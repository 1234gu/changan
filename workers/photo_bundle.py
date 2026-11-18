"""Version 1: one directory of original JPEGs. Never extract arbitrary archive entries."""
from pathlib import PurePosixPath
import re, stat, zipfile

MAX_ZIP=2*1024**3
MAX_EXPANDED=4*1024**3

def photos(z):
    entries=z.infolist()
    if len(entries)>3000 or sum(i.file_size for i in entries)>MAX_EXPANDED:
        raise ValueError('照片包超出文件数量或解包配额')
    groups={}; seen=set()
    for i in entries:
        p=PurePosixPath(i.filename); mode=i.external_attr>>16
        if p.is_absolute() or '..' in p.parts or '\\' in i.filename or ':' in i.filename or stat.S_ISLNK(mode) or i.flag_bits&1:
            raise ValueError('不支持的压缩包成员')
        if i.is_dir():continue
        if i.filename.casefold() in seen:raise ValueError('照片包路径重复')
        seen.add(i.filename.casefold())
        if p.suffix.lower() not in ('.jpeg','.jpg') or '__MACOSX' in p.parts or p.name.startswith('.'):continue
        groups.setdefault(p.parent,[]).append(i)
    preferred=[v for k,v in groups.items() if k.name.casefold() in ('images','park22')]; options=preferred or list(groups.values())
    if len(options)!=1 or not 3<=len(options[0])<=500:raise ValueError('请提供唯一 images/ 照片目录（3至500张JPEG）')
    for i in options[0]:
        if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}',PurePosixPath(i.filename).name) or not 0<i.file_size<=64*1024**2:
            raise ValueError('照片名或单件大小不受支持')
        with z.open(i) as f:
            if f.read(3)!=b'\xff\xd8\xff':raise ValueError('照片不是有效JPEG')
    return sorted(options[0],key=lambda i:i.filename)
