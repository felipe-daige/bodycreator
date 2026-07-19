#!/usr/bin/env python3
"""Mantém a capability de In-App Purchase no projeto gerado pelo XcodeGen.

O formato de `attributes` do XcodeGen transforma dicionários aninhados em texto,
mas `SystemCapabilities` precisa ser um dicionário OpenStep no pbxproj. Este
post-generation hook faz apenas essa inserção no artefato gerado e é idempotente.
"""

from pathlib import Path
import re


PROJECT_FILE = Path("Figurinhas.xcodeproj/project.pbxproj")
TARGET_NAME = "Figurinhas"
CAPABILITY = "com.apple.InAppPurchase"


def matching_brace(text: str, opening: int) -> int:
    depth = 0
    for index in range(opening, len(text)):
        if text[index] == "{":
            depth += 1
        elif text[index] == "}":
            depth -= 1
            if depth == 0:
                return index
    raise RuntimeError("Bloco sem fechamento no project.pbxproj")


def main() -> None:
    content = PROJECT_FILE.read_text(encoding="utf-8")
    target = re.search(
        rf"(?m)^\s*([A-F0-9]{{24}}) /\* {re.escape(TARGET_NAME)} \*/ = \{{\n"
        r"\s*isa = PBXNativeTarget;",
        content,
    )
    if target is None:
        raise RuntimeError(f'Target "{TARGET_NAME}" não encontrado no projeto gerado')

    attributes_start = content.find("TargetAttributes = {")
    if attributes_start < 0:
        raise RuntimeError("TargetAttributes não encontrado no projeto gerado")

    target_id = target.group(1)
    entry = re.search(
        rf"(?m)^(\s*){target_id} = \{{",
        content[attributes_start:],
    )
    if entry is None:
        raise RuntimeError("Atributos do target principal não encontrados")

    entry_start = attributes_start + entry.start()
    entry_open = content.find("{", entry_start)
    entry_close = matching_brace(content, entry_open)
    entry_text = content[entry_start:entry_close]
    if CAPABILITY in entry_text:
        return

    target_indent = entry.group(1)
    property_indent = target_indent + "\t"
    system = re.search(r"(?m)^\s*SystemCapabilities = \{", entry_text)
    if system is not None:
        system_open = entry_start + system.end() - 1
        system_close = matching_brace(content, system_open)
        insertion = content.rfind("\n", 0, system_close) + 1
        addition = (
            f"{property_indent}\t{CAPABILITY} = {{\n"
            f"{property_indent}\t\tenabled = 1;\n"
            f"{property_indent}\t}};\n"
        )
        content = content[:insertion] + addition + content[insertion:]
    else:
        insertion = content.rfind("\n", 0, entry_close) + 1
        addition = (
            f"{property_indent}SystemCapabilities = {{\n"
            f"{property_indent}\t{CAPABILITY} = {{\n"
            f"{property_indent}\t\tenabled = 1;\n"
            f"{property_indent}\t}};\n"
            f"{property_indent}}};\n"
        )
        content = content[:insertion] + addition + content[insertion:]

    PROJECT_FILE.write_text(content, encoding="utf-8")


if __name__ == "__main__":
    main()
