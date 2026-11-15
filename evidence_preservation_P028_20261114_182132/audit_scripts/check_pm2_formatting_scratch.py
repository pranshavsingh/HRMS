import os, re

files = [
    (r'F:\hrms\docs\PHASE_0_FINAL_DECISION_REGISTER.md', 'PHASE_0_FINAL_DECISION_REGISTER.md', 'v2.7.1'),
    (r'F:\hrms\docs\PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md', 'PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md', 'v2.7.1'),
    (r'F:\hrms\docs\PHASE_0_2_8_COMPLETION_REPORT.md', 'PHASE_0_2_8_COMPLETION_REPORT.md', 'v1.3.0'),
    (r'F:\hrms\docs\PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md', 'PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md', 'v1.2.0'),
    (r'F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md', 'PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md', 'v2.7.0')
]

print("=== PM2 MEMORY OCCURRENCE SEARCH ===")
all_pm2 = []

for path, fname, ver in files:
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    for idx, l in enumerate(lines, 1):
        if re.search(r'800\s*(?:\\text\{\s*)?MB|80\s*(?:\\text\{\s*)?MB', l, re.I):
            raw = l.rstrip('\r\n')
            # Check for trailing >
            # Specifically check if '< 800 MB RSS per worker>' or '`> ' exists
            has_stray_gt = bool(re.search(r'per worker>\s*`|per worker`\s*>', raw))
            all_pm2.append({
                'doc': fname,
                'ver': ver,
                'line': idx,
                'raw': raw,
                'has_stray_gt': has_stray_gt
            })

print(f"Total PM2 800MB/80MB lines found: {len(all_pm2)}")
for item in all_pm2:
    print(f"\n[{item['doc']} ({item['ver']}) Line {item['line']}]")
    print(f"  Raw: {item['raw']}")
    print(f"  Stray trailing > detected: {item['has_stray_gt']}")
