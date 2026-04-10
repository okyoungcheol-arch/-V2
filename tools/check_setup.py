"""
Tool: 셋업 체크
용도: 경남전세버스 관리시스템의 환경 설정이 올바른지 점검한다
사용법:
    python tools/check_setup.py
출력: 각 항목별 OK / 경고 / 오류 출력
"""

import os
import sys
import subprocess
from pathlib import Path


PROJECT_ROOT = Path(__file__).parent.parent
BUS_APP = PROJECT_ROOT / "bus-app"
ENV_FILE = BUS_APP / ".env.local"


def check(label: str, ok: bool, hint: str = ""):
    status = "✅" if ok else "❌"
    print(f"  {status}  {label}")
    if not ok and hint:
        print(f"      → {hint}")
    return ok


def section(title: str):
    print(f"\n{'─'*50}")
    print(f"  {title}")
    print('─'*50)


def run_cmd(cmd: list[str], cwd=None) -> tuple[int, str]:
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd, timeout=15)
        return result.returncode, result.stdout + result.stderr
    except Exception as e:
        return -1, str(e)


def main():
    print("\n🚌 경남전세버스 관리시스템 — 환경 점검")
    all_ok = True

    # ── 1. 파일 구조 ──────────────────────────────────────────────
    section("1. 파일 구조")
    checks = [
        (BUS_APP.exists(), "bus-app/ 폴더 존재", "git clone이 제대로 됐는지 확인하세요"),
        (ENV_FILE.exists(), "bus-app/.env.local 존재", "bus-app/.env.local 파일을 만드세요"),
        ((BUS_APP / "package.json").exists(), "bus-app/package.json 존재", ""),
        ((BUS_APP / "node_modules").exists(), "node_modules 설치됨", "cd bus-app && npm install"),
        ((BUS_APP / "public" / "manifest.json").exists(), "PWA manifest.json 존재", ""),
        ((BUS_APP / "public" / "sw.js").exists(), "Service Worker sw.js 존재", ""),
    ]
    for ok, label, hint in checks:
        all_ok &= check(label, ok, hint)

    # ── 2. 환경변수 ───────────────────────────────────────────────
    section("2. Supabase 환경변수")
    env_ok = ENV_FILE.exists()
    if env_ok:
        env_vars = {}
        with open(ENV_FILE, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    key, _, val = line.partition("=")
                    env_vars[key.strip()] = val.strip()

        url = env_vars.get("NEXT_PUBLIC_SUPABASE_URL", "")
        anon = env_vars.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
        service = env_vars.get("SUPABASE_SERVICE_ROLE_KEY", "")

        all_ok &= check("SUPABASE_URL 설정됨", bool(url) and "placeholder" not in url,
                         "Supabase 대시보드 → Settings → API → URL 복사")
        all_ok &= check("ANON_KEY 설정됨", bool(anon) and len(anon) > 20,
                         "Supabase 대시보드 → Settings → API → anon key 복사")
        all_ok &= check("SERVICE_ROLE_KEY 설정됨", bool(service) and len(service) > 20,
                         "Supabase 대시보드 → Settings → API → service_role key 복사")
    else:
        check(".env.local 파일 없음", False, "bus-app/.env.local 파일을 생성하세요")
        all_ok = False

    # ── 3. Node.js / npm ──────────────────────────────────────────
    section("3. Node.js / npm")
    code, out = run_cmd(["node", "--version"])
    node_ok = code == 0
    all_ok &= check(f"Node.js 설치됨 ({out.strip()})", node_ok, "nodejs.org에서 설치")

    if node_ok:
        version_str = out.strip().lstrip("v")
        major = int(version_str.split(".")[0]) if version_str[0].isdigit() else 0
        all_ok &= check(f"Node.js 18+ 버전", major >= 18, f"현재 {out.strip()}, 18 이상 필요")

    code, out = run_cmd(["npm", "--version"])
    all_ok &= check(f"npm 설치됨 ({out.strip()})", code == 0, "Node.js와 함께 설치됩니다")

    # ── 4. Python 패키지 ──────────────────────────────────────────
    section("4. Python 패키지 (tools/ 용)")
    req_file = PROJECT_ROOT / "requirements.txt"
    if req_file.exists():
        with open(req_file) as f:
            packages = [line.strip().split("==")[0].split(">=")[0].lower()
                        for line in f if line.strip() and not line.startswith("#")]
        for pkg in packages:
            try:
                __import__(pkg.replace("-", "_"))
                check(f"Python 패키지: {pkg}", True)
            except ImportError:
                all_ok &= check(f"Python 패키지: {pkg}", False,
                                 f"pip install {pkg}")
    else:
        check("requirements.txt 존재", False, "")

    # ── 5. Supabase 연결 테스트 ────────────────────────────────────
    section("5. Supabase 연결 테스트")
    if env_ok and "placeholder" not in url:
        try:
            import urllib.request
            req = urllib.request.Request(
                f"{url}/rest/v1/",
                headers={"apikey": anon, "Authorization": f"Bearer {anon}"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                connected = resp.status in (200, 206)
        except Exception as e:
            connected = False
        all_ok &= check("Supabase API 응답 확인", connected,
                         "URL·키가 올바른지, 프로젝트가 활성 상태인지 확인하세요")
    else:
        check("Supabase 연결 (환경변수 미설정으로 건너뜀)", False, "위 환경변수부터 설정하세요")
        all_ok = False

    # ── 결과 요약 ─────────────────────────────────────────────────
    print(f"\n{'='*50}")
    if all_ok:
        print("  🎉 모든 항목 통과! 개발 서버를 시작할 수 있습니다:")
        print("     cd bus-app && npm run dev")
    else:
        print("  ⚠️  일부 항목에 문제가 있습니다.")
        print("     위 → 힌트를 참고해서 해결 후 다시 실행하세요.")
    print()


if __name__ == "__main__":
    main()
