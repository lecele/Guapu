import os
import json

search_dirs = [
    r"C:\Users\llece\Documents\DEV\Agentes_na_Saude",
    r"C:\Users\llece\Documents\antigravity",
    r"C:\Users\llece\.gemini\antigravity"
]

found_files = []

for s_dir in search_dirs:
    if not os.path.exists(s_dir):
        continue
    print(f"Scanning {s_dir}...")
    for root, dirs, files in os.walk(s_dir):
        # Evitar node_modules e .git
        if "node_modules" in root or ".git" in root or ".next" in root:
            continue
        for file in files:
            if file.endswith(".json"):
                path = os.path.join(root, file)
                try:
                    with open(path, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read(500)
                        if "client_email" in content and "private_key" in content:
                            print(f"FOUND SERVICE ACCOUNT: {path}")
                            found_files.append(path)
                except Exception:
                    pass

print("Scan complete. Found:", found_files)
