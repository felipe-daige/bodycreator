#!/usr/bin/env python3
"""Valida Content/: manifesto coerente e PNGs dentro dos limites do spec.

Regras (spec 2026-07-17): arquivo referenciado existe; ids de pacote únicos;
ids de figurinha únicos GLOBALMENTE; ids de categoria únicos no pacote;
figurinha é PNG com canal alfa, <= 2 MB, lado maior entre 512 e 2048 px;
capa é PNG <= 2 MB.
"""
import json
import os
import struct
import sys

MAX_BYTES = 2 * 1024 * 1024
MIN_SIDE, MAX_SIDE = 512, 2048
ALPHA_COLOR_TYPES = {4, 6}  # gray+alpha, RGBA


def png_header(path):
    """Retorna (largura, altura, color_type) ou None se não for PNG."""
    try:
        with open(path, "rb") as f:
            if f.read(8) != b"\x89PNG\r\n\x1a\n":
                return None
            f.read(4)  # tamanho do chunk
            if f.read(4) != b"IHDR":
                return None
            width, height = struct.unpack(">II", f.read(8))
            f.read(1)  # bit depth
            color_type = f.read(1)[0]
            return width, height, color_type
    except OSError:
        return None


def main():
    content = sys.argv[1] if len(sys.argv) > 1 else "Content"
    errors = []
    try:
        with open(os.path.join(content, "manifest.json")) as f:
            manifest = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"ERRO: manifest.json inválido ou ausente: {e}")
        return 1

    pack_ids, sticker_ids = set(), set()
    checked = 0
    for pack in manifest.get("packs", []):
        pid = pack.get("id", "<sem id>")
        if pid in pack_ids:
            errors.append(f"pacote com id duplicado: {pid}")
        pack_ids.add(pid)
        for key in ("name", "cover", "free", "categories"):
            if key not in pack:
                errors.append(f"pacote {pid}: campo obrigatório ausente: {key}")
        cover = os.path.join(content, pack.get("cover", ""))
        if not os.path.isfile(cover):
            errors.append(f"pacote {pid}: capa não encontrada: {pack.get('cover')}")
        elif png_header(cover) is None:
            errors.append(f"pacote {pid}: capa não é PNG válido")
        elif os.path.getsize(cover) > MAX_BYTES:
            errors.append(f"pacote {pid}: capa acima de 2 MB")

        cat_ids = set()
        for cat in pack.get("categories", []):
            cid = cat.get("id", "<sem id>")
            if cid in cat_ids:
                errors.append(f"pacote {pid}: categoria com id duplicado: {cid}")
            cat_ids.add(cid)
            for st in cat.get("stickers", []):
                sid = st.get("id", "<sem id>")
                if sid in sticker_ids:
                    errors.append(f"figurinha com id duplicado (ids são globais): {sid}")
                sticker_ids.add(sid)
                for key in ("name", "tags", "file"):
                    if key not in st:
                        errors.append(f"figurinha {sid}: campo obrigatório ausente: {key}")
                path = os.path.join(content, st.get("file", ""))
                if not os.path.isfile(path):
                    errors.append(f"figurinha {sid}: arquivo não encontrado: {st.get('file')}")
                    continue
                if os.path.getsize(path) > MAX_BYTES:
                    errors.append(f"figurinha {sid}: arquivo acima de 2 MB")
                header = png_header(path)
                if header is None:
                    errors.append(f"figurinha {sid}: não é PNG válido")
                    continue
                width, height, color_type = header
                if color_type not in ALPHA_COLOR_TYPES:
                    errors.append(f"figurinha {sid}: PNG sem canal alfa (color type {color_type})")
                longest = max(width, height)
                if not (MIN_SIDE <= longest <= MAX_SIDE):
                    errors.append(
                        f"figurinha {sid}: lado maior {longest}px fora da faixa {MIN_SIDE}-{MAX_SIDE}px")
                checked += 1

    if errors:
        for e in errors:
            print(f"ERRO: {e}")
        return 1
    print(f"OK: {checked} figurinhas validadas em {len(pack_ids)} pacote(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
