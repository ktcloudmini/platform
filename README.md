
# 🚀 Platform Team: Week 1 Core Practice

안녕하세요! 플랫폼 팀 1주차 핵심 과제인 **"도커라이징 및 앤서블 자동 배포"** 실습 키트입니다.
불필요한 설정 파일은 제거하고, 실제 배포에 사용될 핵심 로직만 담았습니다.

## 🛠️ 사전 준비 (Prerequisites)
실습을 위해 본인의 WSL(Ubuntu) 환경에 아래 툴이 설치되어 있어야 합니다.

1.  **Ansible:** `sudo apt install ansible -y`
2.  **Docker:** 도커 엔진이 설치되어 있고 실행 중이어야 합니다.
3.  **Docker Hub 계정:** 본인 계정 생성 필수.

---

## 📂 파일 구조
*   `hosts.ini`: 앤서블 타겟 설정 (Localhost)
*   `deploy_app.yml`: 도커 허브에서 이미지를 가져와 컨테이너를 배포하는 플레이북
*   `mini-app/`: 웹 서버 소스 코드 및 Dockerfile

---

## 🏃‍♂️ 실습 가이드 (Step-by-Step)

### Step 1. 앤서블 연결 확인
터미널에서 아래 명령어로 앤서블이 정상 동작하는지 확인합니다.
```bash
ansible my_computer -i hosts.ini -m ping
```
---

### Step 2. 도커 이미지 빌드 및 푸시 (Build & Push)
우리의 웹 서버를 도커 이미지로 만들어서 본인의 도커 허브에 올립니다.

1.  **로그인:** `docker login`
2.  **빌드:** `mini-app` 폴더로 이동 후 빌드합니다.
    ```bash
    cd mini-app
    # [중요] '본인ID'를 실제 도커 허브 ID로 변경하세요.
    docker build -t 본인ID/mini-app:latest .
    ```
3.  **푸시:**
    ```bash
    docker push 본인ID/mini-app:latest
    ```

### Step 3. 앤서블로 자동 배포 (Deploy)
이제 앤서블에게 "도커 허브에서 이미지를 가져와 실행해라!"라고 명령합니다.

1.  `deploy_app.yml` 파일을 열어 `docker_id` 변수를 **본인 ID**로 수정합니다.
2.  플레이북 실행:
    ```bash
    # 프로젝트 루트 폴더에서 실행
    ansible-playbook -i hosts.ini deploy_app.yml -K
    ```
    *   `-K` 옵션 사용 시 본인의 **OS 비밀번호**를 입력하세요.

---

### Step 4. GitHub Actions 연동 (CI)
매번 수동으로 빌드/푸시하는 과정을 자동화하기 위해 GitHub Actions를 설정합니다.

1.  **GitHub 저장소 생성 및 연결:**
    *   GitHub에 새로운 Repository를 생성합니다.
    *   로컬 프로젝트와 연결합니다.
    ```bash
    git init
    git remote add origin [본인_깃허브_리포지토리_URL]
    ```

2.  **Docker Hub 인증 정보 등록 (Secrets):**
    *   생성한 GitHub 리포지토리의 **Settings** > **Secrets and variables** > **Actions**로 이동합니다.
    *   **New repository secret** 버튼을 눌러 아래 두 가지 변수를 등록합니다.
        *   `DOCKER_USERNAME`: 본인의 Docker Hub ID
        *   `DOCKER_PASSWORD`: 본인의 Docker Hub 비밀번호

3.  **워크플로우 파일 생성:**
    *   프로젝트 루트에 `.github/workflows/deploy.yml` 파일을 생성하고 아래 내용을 붙여넣습니다.
    ```yaml
    name: Docker Build and Push

    on:
      push:
        branches: [ "main" ]

    jobs:
      build-and-push:
        runs-on: ubuntu-latest
        steps:
        - name: Checkout code
          uses: actions/checkout@v3

        - name: Login to Docker Hub
          uses: docker/login-action@v2
          with:
            username: ${{ secrets.DOCKER_USERNAME }}
            password: ${{ secrets.DOCKER_PASSWORD }}

        - name: Build and Push Docker Image
          uses: docker/build-push-action@v4
          with:
            context: ./mini-app
            push: true
            tags: ${{ secrets.DOCKER_USERNAME }}/mini-app:latest
    ```

4.  **푸시 및 자동화 확인:**
    *   코드를 커밋하고 푸시합니다.
    ```bash
    git add .
    git commit -m "Add GitHub Actions"
    git branch -M main
    git push -u origin main
    ```
    *   GitHub 저장소의 **Actions** 탭에서 빌드가 성공(초록색 체크)하는지 확인합니다.
    *   Docker Hub에 새로운 이미지가 업로드되었는지 확인합니다.

## ✅ 결과 검증
배포가 완료되면 다시 앤서블 플레이북을 실행한 뒤, 브라우저나 터미널에서 접속을 확인합니다.
```bash
ansible-playbook -i hosts.ini deploy_app.yml -K

curl http://localhost:8080
```
**"Success! Dockerized Mini Web Server..."** 문구가 뜨면 실습 완료입니다!

---

## 📅 향후 과제 로드맵 (2주차 ~)

**관련 내용을 완벽 숙달한다기보단 직접 찾아보고 눈에 익히기!**

### 1. 인프라-플랫폼 연동 및 배포 자동화 검증
- **인프라 팀 협업:** Terraform으로 생성된 AWS EC2 인스턴스의 퍼블릭 IP(Elastic IP) 및 SSH 보안키(`.pem`) 수령.
- **Inventory 설정:** `hosts.ini` 파일에 수령한 서버 IP 반영 및 접속 정보(User, Key 경로) 업데이트.
- **배포 테스트:** 로컬 환경에서 Ansible Playbook을 실행하여 원격 서버 내 Docker 엔진 설치 및 `mini-app` 컨테이너 기동 최종 확인.

### 2. CI/CD 고도화: AWS 공식 GitHub Actions 도입 및 조사
- **AWS 전용 Actions 라이브러리 분석:**
  - `aws-actions/configure-aws-credentials`: GitHub Secrets와 연동하여 AWS 자격 증명을 안전하게 설정하는 방법 조사.
  - `aws-actions/amazon-ec2-deploy-task-definition` 등 EC2 관련 공식 액션 활용 사례 탐색.
- **배포 방식 비교 및 선정:** 
  - 현재의 **SSH-Ansible** 방식과 **AWS Native 서비스(CodeDeploy 등)** 연동 방식의 장단점 비교.
  - 우리 프로젝트 규모에 최적화된 "Push-to-Deploy" 프로세스 확립.
- **보안 강화:** GitHub Secrets를 활용한 민감 정보(Access Key, Private Key) 관리 체계 고도화.