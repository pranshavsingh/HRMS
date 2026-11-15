import os, hashlib

files = [
    r'F:\hrms\docs\PHASE_0_FINAL_DECISION_REGISTER.md',
    r'F:\hrms\docs\PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md',
    r'F:\hrms\docs\PHASE_0_2_8_COMPLETION_REPORT.md',
    r'F:\hrms\docs\PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md',
    r'F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md'
]

print("=== FIVE-DOCUMENT IDENTITY & INTEGRITY AUDIT ===")
for p in files:
    fname = os.path.basename(p)
    exists = os.path.exists(p)
    if not exists:
        print(f"File: {fname} -> MISSING")
        continue
    size = os.path.getsize(p)
    with open(p, 'rb') as f:
        data = f.read()
    sha256 = hashlib.sha256(data).hexdigest()
    # Read text to count physical lines and detect version
    text = data.decode('utf-8')
    lines = text.splitlines()
    line_count = len(lines)
    
    # Extract version
    ver = "Unknown"
    for l in lines[:15]:
        if "Version:" in l or "Version**" in l:
            ver = l.strip()
            break
    print(f"Document: {fname}")
    print(f"  Path: {p}")
    print(f"  Version header: {ver}")
    print(f"  Physical Line Count: {line_count}")
    print(f"  Byte Size: {size}")
    print(f"  SHA-256: {sha256}")
