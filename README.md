# Platform CI/CD (GitHub Actions + Org-level Self-hosted Runner on Monitoring + Ansible)

이 문서는 `feature/setup-github-runner` 브랜치 기준으로, 현재 구현된 CI/CD 구조를 팀원에게 공유하기 위한 설명서입니다.  

---

## 0) 배경: 왜 Monitoring에서 Self-hosted Runner가 필요했나

- Monitoring EC2는 **Public Subnet**에 존재합니다.
- 보안 정책상 Monitoring EC2의 **SSH(22)는 개발자 IP만 허용**되어 있습니다.
- GitHub Actions의 GitHub-hosted runner는 공인 IP가 매번 변동하므로, Monitoring EC2로 SSH 접속하는 방식은
  - 연결 불가(정책 위반) 또는
  - 운영이 불안정(예외 처리 필요)
  입니다.

따라서 Monitoring EC2가 부팅 시 스스로 **GitHub Org-level self-hosted runner로 등록/기동**되도록 전환합니다.

이 구조로 가면:
- GitHub-hosted runner는 **빌드/푸시까지만** 수행하고
- 배포는 **Monitoring 내부 self-hosted runner에서만** 수행합니다.
- Private Subnet에 있는 App 인스턴스는 외부에서 직접 접근하지 않고, **Monitoring을 통해서만** 접근합니다.

---

## 1) 구성요소(구상도에 들어갈 “박스” 목록)

아키텍처 다이어그램을 그릴 때 아래 박스들을 먼저 배치해주세요.

### GitHub / Public 영역
- **GitHub Repo**: 코드 저장소
- **GitHub Actions (GitHub-hosted runner)**: 빌드/푸시 수행
- **Org-level Self-hosted Runner (label: monitoring)**: Monitoring EC2에 설치되어 배포 수행

### Artifact 저장소
- **Docker Hub**: 빌드 결과(도커 이미지) 저장

### AWS / VPC 영역
- **Monitoring EC2 (Public Subnet)**  
  - Self-hosted runner가 상주
  - Ansible 실행 주체 (Private Subnet 접근 가능한 배포 허브)
  - SSH 22는 개발자 IP만 허용
- **App EC2 (Private Subnet, Auto Scaling)**  
  - 배포 대상 인스턴스들
- **SSM Parameter Store (SecureString)**  
  - GH_PAT 저장 (`/cicd/github/pat`)
- **IAM Role (Instance Profile)**  
  - Monitoring EC2에 **이미 부여되어 있음**
  - EC2 인스턴스 태그/IP 조회(DescribeInstances 등) 가능

### 배포 도구
- **Ansible + AWS EC2 Dynamic Inventory** (`aws_ec2.yml`)
  - 태그 기반으로 App 인스턴스 목록을 자동 수집하여 배포 대상 그룹 생성

---

## 2) 시나리오로 보는 “현재 구현 구조”

### 2-1) 시나리오 A: 인프라 부팅(서버가 켜질 때)

#### A-1. Monitoring EC2 부팅 → Runner 자동 등록/기동
1. **Monitoring EC2 UserData 실행**
2. UserData가 **SSM Parameter Store**에서 GH_PAT를 조회(`/cicd/github/pat`, SecureString 복호화)
3. GH_PAT로 GitHub API 호출
   - Org-level runner 등록 토큰 발급
4. Monitoring EC2에 **actions runner 설치/구성**
   - Runner 이름 예: `Monitoring-Runner-<instance-id>`
   - Runner 라벨: `monitoring` 포함
5. runner를 **systemd 서비스로 등록**하고 자동 시작
6. 결과:
   - GitHub Org의 Runners 목록에 해당 runner가 Online 상태로 표시됨
   - 이후 배포 workflow는 `runs-on: [self-hosted, monitoring]`로 Monitoring에서만 실행 가능

> 구상도 팁:  
> Monitoring → SSM(패스워드 조회) → GitHub API(등록 토큰) → Monitoring 내부 Runner Service(Online) 흐름을 화살표로 표현.

---

### 2-2) 시나리오 B: 코드 변경(Repo에 push 했을 때)

이 시나리오가 CI/CD의 본 흐름입니다. 핵심은 다음 한 줄입니다.

> **Public(GitHub-hosted)에서는 빌드/푸시까지만**,  
> **배포는 Private 접근 가능한 Monitoring(Self-hosted)에서만**.

#### B-1. GitHub-hosted runner: Build & Push
1. 개발자가 GitHub Repo에 push
2. GitHub Actions 워크플로우 실행
3. GitHub-hosted runner(`ubuntu-latest`)가
   - `mini-app/` 기준 도커 이미지 빌드
   - Docker Hub에 push

#### B-2. Monitoring(Self-hosted runner): Deploy(Ansible)
4. 다음 job이 `runs-on: [self-hosted, monitoring]`로 실행되며
   - GitHub는 job을 Monitoring EC2의 self-hosted runner에 할당
5. Monitoring runner가 repo를 checkout
6. 배포를 위해 GitHub Secrets에서 SSH 키를 받아 파일로 생성(배포 전용 키)
7. Ansible 실행:
   - Inventory는 **AWS EC2 Dynamic Inventory 유지**
   - Monitoring EC2는 이미 IAM Role이 부여되어 있어 EC2 조회 가능
8. Ansible이 태그 기반으로 App 인스턴스들을 자동 수집한 뒤,
   - Docker Hub에서 최신 이미지 pull
   - 컨테이너를 교체/재기동하여 배포 완료

> 구상도 팁(가장 중요):  
> 1) GitHub Actions → Docker Hub (push)  
> 2) Monitoring → Docker Hub (pull)  
> 3) Monitoring → AWS API (DescribeInstances; dynamic inventory)  
> 4) Monitoring → App EC2들 (SSH/Ansible)  
> 그리고 “Public/Private 경계”를 반드시 그려주세요.

---

## 3) Workflow/Playbook에서의 역할 분리(요약)

- **GitHub-hosted runner**
  - 빌드/푸시 전담
  - Monitoring에 SSH 접속하지 않음(정책상 불가)

- **Monitoring self-hosted runner (label: monitoring)**
  - 배포 전담
  - Private App 서버에 Ansible로 명령을 뿌리는 유일한 실행 지점

- **Ansible (dynamic inventory 유지)**
  - 배포 대상 서버 목록을 태그 기반으로 자동 구성
  - 오토스케일링 환경에서 “현재 살아있는 인스턴스”를 즉시 반영 가능

---

## 4) 현재 구조의 문제점 및 개선해야 하는 것들 (우리 팀이 할 일; 나중에 회의로 정해봐야 할 것)

> 아래는 인프라팀 의존 없이, 레포/워크플로/배포 코드 레벨에서 우리 팀이 직접 개선할 항목입니다.

### 4-1. 워크플로우에서 “Monitoring에 runner 설치” 단계 제거/정리
현재 목표 구조는 runner 설치/등록을 **UserData(인프라)로 위임**하는 것입니다.  
따라서 GitHub-hosted runner가 Monitoring에 SSH로 접근해 runner를 설치하는 흐름이 남아있다면 제거/비활성화해야 합니다.

- Deploy job은 반드시 `runs-on: [self-hosted, monitoring]`로 제한
  - `self-hosted`만 쓰면 다른 self-hosted runner가 생겼을 때 혼선 가능

### 4-2. 배포 경합(동시 배포) 방지
연속 push가 발생하면 배포가 겹칠 수 있습니다.

- GitHub Actions에 `concurrency`를 설정하여
  - 동일 브랜치(또는 동일 환경) 배포는 1개만 실행되도록 제한 권장

### 4-3. 이미지 태그 전략 개선(추적/롤백 가능하게)
`latest`만 사용하면 “무슨 커밋이 배포됐는지” 추적이 어렵고 롤백이 난감합니다.

- 권장:
  - `latest` + `git sha`(또는 버전) 태그를 함께 push
  - 배포는 `sha` 태그를 기본으로 사용(추적 가능)

### 4-4. SSH 키(Secrets) 운영 원칙 문서화
App 서버 접근 키는 GitHub Secret을 사용합니다.

- 배포 전용 키 사용(권장)
- 최소 권한/접근 범위로 제한
- 키 교체 및 유출 대응 절차를 팀 내 문서에 남기기(간단한 체크리스트라도)

---

## 5) 구상도(아키텍처 다이어그램) 그리기

다음 2개의 시나리오 다이어그램을 그려서 공유해주세요.

1) **인프라 부팅 시나리오**
   - Monitoring EC2 부팅 → SSM에서 PAT 조회 → Org-level runner 등록/기동 → Online 상태

2) **코드 push 시나리오**
   - GitHub-hosted runner: build/push → Docker Hub
   - Monitoring self-hosted runner: ansible deploy → Private App EC2들

필수 포함 요소:
- Public/Private 경계선
- Docker Hub
- Monitoring이 “Private 접근 가능한 유일 지점”임을 명시
- Dynamic inventory를 위한 AWS API 조회 흐름(DescribeInstances)
- Monitoring → App EC2 SSH/Ansible 흐름
- runner 라벨 `monitoring` 표기