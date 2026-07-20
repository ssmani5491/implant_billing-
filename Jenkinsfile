pipeline {
  agent any

  environment {
    REGISTRY_URL    = 'https://ghcr.io'
    // GitHub: use your own username (lowercase for GH_NAMESPACE)
    GH_NAMESPACE    = 'aadarsh0507'   // lowercase
    GH_OWNER        = 'aadarsh0507'   // GitHub username (must match repository owner)
    DOCKER_BUILDKIT = '1'
    // Jenkins → Credentials: kind "Username with password". ID must match this value (GitHub username + PAT).
    // Used for: docker login ghcr.io, image push, git release tag push.
    GIT_CRED_ID     = 'Jenkins'
    SONAR_TOKEN_ID  = 'sonar-token'

    // Trivy policy: main strict, dev lenient
    // Only fail on CRITICAL (HIGH vulnerabilities will be reported but not fail the build)
    TRIVY_SEV_MAIN  = 'CRITICAL'
    TRIVY_SEV_DEV   = 'CRITICAL'

    // Runtime config (DB hosts, JWT secret, Oracle HIS, NAS share credentials)
    // is NOT baked into the image — it's supplied via --env-file/backend/.env
    // at container run time. Only VITE_API_BASE_URL is a build arg, since the
    // frontend bundle needs it baked in at build time.
  }

  options { timestamps() }

  // Trigger: run on push (poll every 2 min) or enable "GitHub hook trigger" in job config for immediate build
  triggers {
    pollSCM('H/2 * * * *')
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        script {
          // Prefer Jenkins-provided GIT_BRANCH, fall back to git
          def rawBranch = env.GIT_BRANCH ?: sh(returnStdout: true, script: 'git rev-parse --abbrev-ref HEAD').trim()
          // Normalize values like 'origin/aadarsh' or 'origin1/aadarsh' to just 'aadarsh'
          def normalized = rawBranch.replaceFirst(/^origin1?\//, '')
          env.BRANCH_NAME = normalized
          echo "Active git branch: ${env.BRANCH_NAME} (raw: ${rawBranch})"
        }
      }
    }

    /* ---------- 1) SonarQube code scan ---------- */
    stage('Sonar Scan') {
      // Run Sonar on main branches every time
      when {
        anyOf {
          branch 'main'
          branch 'dev'
          branch 'aadarsh'
        }
      }
      steps {
        script {
          def scannerHome = tool name: 'sonar-scanner',
                                 type: 'hudson.plugins.sonar.SonarRunnerInstallation'

          def rawRepo = sh(returnStdout:true,
                           script:"basename -s .git \$(git config --get remote.origin.url)").trim()

          def sqKey   = rawRepo.replaceAll('[^A-Za-z0-9:_\\-\\.]','-')

          // Token comes only from SonarQube server config (Manage Jenkins > Configure System > sonar)
          withSonarQubeEnv('sonar') {
            if (fileExists('sonar-project.properties')) {
              sh """
                ${scannerHome}/bin/sonar-scanner \
                  -Dproject.settings=sonar-project.properties \
                  -Dsonar.scm.provider=git \
                  -Dsonar.scm.forceReloadAll=true \
                  -Dsonar.issuesReport.html.enable=true \
                  -Dsonar.types=BUG,VULNERABILITY,CODE_SMELL
              """
            } else {
              sh """
                ${scannerHome}/bin/sonar-scanner \
                  -Dsonar.projectKey=${sqKey} \
                  -Dsonar.projectName=${rawRepo} \
                  -Dsonar.sources=backend,frontend \
                  -Dsonar.exclusions=**/node_modules/**,**/build/**,**/dist/**,**/*.min.js,**/*.map,**/android/**,**/*.java,**/.env,**/*.env,**/.data/**,**/service-account.json,**/*token*.json,**/*secret*.json \
                  -Dsonar.sourceEncoding=UTF-8 \
                  -Dsonar.scm.provider=git \
                  -Dsonar.scm.forceReloadAll=true \
                  -Dsonar.issuesReport.html.enable=true \
                  -Dsonar.types=BUG,VULNERABILITY,CODE_SMELL
              """
            }
          }
        }
      }
    }

    /* ---------- 2) Sonar Quality Gate ---------- */
    stage('Quality Gate') {
      when {
        anyOf {
          branch 'main'
          branch 'dev'
          branch 'aadarsh'
        }
      }
      steps {
        timeout(time: 10, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    /* ---------- 3) Trivy Code Scan ---------- */
    stage('Trivy Code Scan') {
      steps {
        script {
          sh 'mkdir -p reports'
          def sev = (env.BRANCH_NAME == 'main') ? env.TRIVY_SEV_MAIN : env.TRIVY_SEV_DEV
          echo "Trivy filesystem scan: Enforcing severity threshold '${sev}' (failures will occur if ${sev} vulnerabilities are found)"
          def trivyExists = sh(returnStatus:true,
                               script:'command -v trivy >/dev/null 2>&1') == 0
          def hasIgnoreFile = fileExists('.trivyignore')
          def ignoreFileFlag = hasIgnoreFile ? '--ignorefile .trivyignore' : ''
          def dockerIgnoreFileFlag = hasIgnoreFile ? '--ignorefile /workspace/.trivyignore' : ''
          int rc
          if (trivyExists) {
            rc = sh(returnStatus:true, script: """
              trivy fs --no-progress --skip-version-check \
                --severity ${sev} --exit-code 1 \
                --format json -o reports/trivy-fs.json \
                --skip-dirs "certificates" \
                --skip-dirs "certificates/ssl" \
                --skip-dirs ".git" \
                --skip-dirs "node_modules" \
                --skip-dirs "dist" \
                --skip-dirs "build" \
                --skip-dirs "reports" \
                --skip-dirs "docker" \
                --scanners vuln \
                ${ignoreFileFlag} \
                . \
                > reports/trivy-fs-console.txt 2>&1
            """)
          } else {
            rc = sh(returnStatus:true, script: """
              docker run --rm \
                -v ${WORKSPACE}:/workspace aquasec/trivy:latest fs --no-progress --skip-version-check \
                --severity ${sev} --exit-code 1 \
                --format json -o /workspace/reports/trivy-fs.json \
                --skip-dirs "certificates" \
                --skip-dirs "certificates/ssl" \
                --skip-dirs ".git" \
                --skip-dirs "node_modules" \
                --skip-dirs "dist" \
                --skip-dirs "build" \
                --skip-dirs "reports" \
                --skip-dirs "docker" \
                --scanners vuln \
                ${dockerIgnoreFileFlag} \
                /workspace \
                > ${WORKSPACE}/reports/trivy-fs-console.txt 2>&1
            """)
          }
          archiveArtifacts artifacts: 'reports/trivy-fs*', allowEmptyArchive: true
          if (rc != 0) {
            error "Trivy found ${sev} vulnerabilities in source code. Check reports/trivy-fs.json"
          }
        }
      }
    }

    /* ---------- 4) Docker build (single full-stack image) ---------- */
    stage('Docker Build') {
      when { anyOf { branch 'main'; branch 'dev'; branch 'aadarsh' } }
      steps {
        script {
          env.RAW_REPO  = sh(returnStdout:true,
                             script:"basename -s .git \$(git config --get remote.origin.url)").trim()
          def imageRepo = env.RAW_REPO.toLowerCase()
                           .replaceAll('[^a-z0-9._-]','')
                           .replaceAll('^[-._]+|[-._]+$','')

          if (!imageRepo) { error "Invalid repo '${env.RAW_REPO}' → cannot derive image name." }

          // Single full-stack image: nginx (frontend) + Node backend
          env.IMAGE = "ghcr.io/${env.GH_NAMESPACE}/${imageRepo}"

          def shortSha = env.GIT_COMMIT.take(7)
          def buildNo  = env.BUILD_NUMBER

          def latestTag = sh(returnStdout:true,
                             script:"git describe --tags --abbrev=0 2>/dev/null || echo v0.0.0").trim()

          def parts     = latestTag.replace('v','').tokenize('.')
          def MAJOR     = (parts.size()>0 ? parts[0].replaceAll('[^0-9].*','') : '0') as int
          def MINOR     = (parts.size()>1 ? parts[1].replaceAll('[^0-9].*','') : '0') as int
          def PATCH     = (parts.size()>2 ? parts[2].replaceAll('[^0-9].*','') : '0') as int

          env.NEXT_VERSION = "v${MAJOR}.${MINOR}.${PATCH + 1}"
          env.RC_VERSION   = "${env.NEXT_VERSION}-rc.${buildNo}"

          def isMainBranch = (env.BRANCH_NAME == 'main')
          env.TAGS = isMainBranch
            ? "prod,latest,${env.NEXT_VERSION},${shortSha}"
            : "dev,${env.RC_VERSION},${shortSha}"

          env.PRIMARY_TAG = env.TAGS.split(',')[0]

          def versionLabel = isMainBranch ? env.NEXT_VERSION : env.RC_VERSION

          echo "Building ${env.IMAGE}:${env.PRIMARY_TAG} (branch: ${env.BRANCH_NAME})"

          // Pre-flight: Dockerfile + docker daemon (GHCR login happens in Push only).
          sh '''
            set -eu
            echo "=== Docker pre-flight ==="
            echo "Workspace: $(pwd)"
            test -f Dockerfile || { echo "ERROR: ./Dockerfile not found in workspace root."; exit 1; }
            command -v docker >/dev/null 2>&1 || { echo "ERROR: docker CLI not installed on this Jenkins agent."; exit 1; }
            docker info >/dev/null 2>&1 || {
              echo "ERROR: cannot reach Docker daemon (permission denied?). Add jenkins user to docker group."
              exit 1
            }
            echo "Docker daemon OK."
          '''

          sh """
            docker build --no-cache -f Dockerfile -t ${env.IMAGE}:${env.PRIMARY_TAG} \\
              --build-arg VITE_API_BASE_URL="/api" \\
              --label ci.branch=${env.BRANCH_NAME} \\
              --label ci.sha=${env.GIT_COMMIT} \\
              --label ci.build=${buildNo} \\
              --label ci.repo=${env.RAW_REPO} \\
              --label ci.version=${versionLabel} \\
              .
          """

          for (t in env.TAGS.split(',')) {
            def tag = t.trim()
            if (tag && tag != env.PRIMARY_TAG) {
              sh "docker tag ${env.IMAGE}:${env.PRIMARY_TAG} ${env.IMAGE}:${tag}"
            }
          }
        }
      }
    }

    /* ---------- 5) Trivy image scan (archive even on FAIL) ---------- */
    stage('Trivy Scan') {
      when { anyOf { branch 'main'; branch 'dev'; branch 'aadarsh' } }
      steps {
        script {
          sh 'mkdir -p reports'
          
          // Verify image exists before scanning
          def imageExists = sh(returnStatus:true, 
                              script: "docker image inspect ${env.IMAGE}:${env.PRIMARY_TAG} >/dev/null 2>&1") == 0
          if (!imageExists) {
            echo "Image ${env.IMAGE}:${env.PRIMARY_TAG} not found. Skipping Trivy scan."
            return
          }
          
          def sev = (env.BRANCH_NAME == 'main') ? env.TRIVY_SEV_MAIN : env.TRIVY_SEV_DEV
          def failSeverity = sev
          def trivyExists = sh(returnStatus:true,
                               script:'command -v trivy >/dev/null 2>&1') == 0
          try {
            def hasIgnoreFile = fileExists('.trivyignore')
            def ignoreFileFlag = hasIgnoreFile ? '--ignorefile .trivyignore' : ''
            def dockerIgnoreFileFlag = hasIgnoreFile ? '--ignorefile /workspace/.trivyignore' : ''
            
            // Scan for HIGH and CRITICAL to show all issues, but only fail on CRITICAL
            def scanSeverity = 'CRITICAL,HIGH'
            
            if (trivyExists) {
              // First scan: report all HIGH and CRITICAL (warnings, no failure)
              sh """
                trivy image --no-progress --skip-version-check \
                  --severity ${scanSeverity} --exit-code 0 \
                  --format table \
                  ${ignoreFileFlag} \
                  ${env.IMAGE}:${env.PRIMARY_TAG} \
                  > reports/trivy-image-summary.txt 2>&1 || true
              """
              
              // Second scan: generate JSON for CRITICAL vulnerabilities only
              sh """
                trivy image --no-progress --skip-version-check \
                  --severity ${failSeverity} --exit-code 0 \
                  --format json -o reports/trivy-image.json \
                  ${ignoreFileFlag} \
                  ${env.IMAGE}:${env.PRIMARY_TAG} \
                  > reports/trivy-console.txt 2>&1 || true
              """
            } else {
              // First scan: report all HIGH and CRITICAL (warnings, no failure)
              sh """
                docker run --rm \
                  -v /var/run/docker.sock:/var/run/docker.sock \
                  -v ${WORKSPACE}:/workspace aquasec/trivy:latest image --no-progress --skip-version-check \
                  --severity ${scanSeverity} --exit-code 0 \
                  --format table \
                  ${dockerIgnoreFileFlag} \
                  ${env.IMAGE}:${env.PRIMARY_TAG} \
                  > ${WORKSPACE}/reports/trivy-image-summary.txt 2>&1 || true
              """
              
              // Second scan: generate JSON for CRITICAL vulnerabilities only
              sh """
                docker run --rm \
                  -v /var/run/docker.sock:/var/run/docker.sock \
                  -v ${WORKSPACE}:/workspace aquasec/trivy:latest image --no-progress --skip-version-check \
                  --severity ${failSeverity} --exit-code 0 \
                  --format json -o /workspace/reports/trivy-image.json \
                  ${dockerIgnoreFileFlag} \
                  ${env.IMAGE}:${env.PRIMARY_TAG} \
                  > ${WORKSPACE}/reports/trivy-console.txt 2>&1 || true
              """
            }
          } catch (Exception e) {
            echo "ERROR: Trivy scan failed with exception: ${e.getMessage()}"
            error "Trivy scan execution failed. Check reports/trivy-console.txt"
          }
          
          archiveArtifacts artifacts: 'reports/*', allowEmptyArchive: true
          
          // Show summary of all vulnerabilities (including HIGH)
          if (fileExists('reports/trivy-image-summary.txt')) {
            echo "=== Trivy Vulnerability Summary (HIGH + CRITICAL) ==="
            sh 'cat reports/trivy-image-summary.txt || true'
          }
          
          // Count CRITICAL vulnerabilities (no readJSON - use shell so no extra plugin needed)
          def criticalCount = 0
          if (fileExists('reports/trivy-image.json')) {
            def criticalStr = sh(returnStdout: true, script: """
              grep -o '"Severity":"CRITICAL"' reports/trivy-image.json 2>/dev/null | wc -l || echo 0
            """).trim()
            criticalCount = criticalStr.isInteger() ? criticalStr.toInteger() : 0
          }
          
          if (criticalCount > 0) {
            // Show last few lines of console output for debugging
            sh """
              echo "=== Trivy Scan Failed (CRITICAL vulnerabilities found) ==="
              echo "Last 50 lines of Trivy output:"
              tail -50 reports/trivy-console.txt || echo "Could not read trivy-console.txt"
            """
            error "Trivy found ${criticalCount} CRITICAL vulnerabilities in image ${env.IMAGE}:${env.PRIMARY_TAG}. Check reports/trivy-image.json"
          } else {
            echo "Trivy Scan Passed: No CRITICAL vulnerabilities found"
            echo "Note: HIGH vulnerabilities may exist - check reports/trivy-image-summary.txt for details"
          }
        }
      }
    }

    /* ---------- 6) Push to GHCR (only if all above pass) ---------- */
    stage('Push') {
      when { anyOf { branch 'main'; branch 'dev'; branch 'aadarsh' } }
      steps {
        script {
          def imageExists = sh(returnStatus:true,
                              script: "docker image inspect ${env.IMAGE}:${env.PRIMARY_TAG} >/dev/null 2>&1") == 0
          if (!imageExists) {
            error "Image ${env.IMAGE}:${env.PRIMARY_TAG} not found. Cannot push to registry."
          }

          withCredentials([usernamePassword(
            credentialsId: env.GIT_CRED_ID,
            usernameVariable: 'GH_USER',
            passwordVariable: 'GH_PAT'
          )]) {
            echo "DEBUG: IMAGE=${env.IMAGE}"
            echo "DEBUG: TAGS=${env.TAGS}"
            echo "DEBUG: PRIMARY_TAG=${env.PRIMARY_TAG}"

            sh """
              echo "Logging into GitHub Container Registry..."
              echo "\${GH_PAT}" | docker login ghcr.io -u "\${GH_USER}" --password-stdin
            """

            def tagsList = env.TAGS.split(',')
            echo "DEBUG: Total tags to push: ${tagsList.size()}"
            def failedTags = []

            for (t in tagsList) {
              def tag = t.trim()
              if (tag) {
                def ref = "${env.IMAGE}:${tag}"
                echo "DEBUG: Pushing ${ref}"
                try {
                  def tagExists = sh(returnStatus:true,
                                     script: "docker image inspect ${ref} >/dev/null 2>&1") == 0
                  if (!tagExists) {
                    echo "WARNING: Tag ${ref} does not exist, skipping"
                    failedTags.add("${ref} (not found)")
                    continue
                  }

                  def pushRc = sh(returnStatus:true, script: "docker push ${ref} 2>&1 | tee reports/push-${tag}.log")
                  if (pushRc == 0) {
                    echo "SUCCESS: Pushed ${ref}"
                  } else {
                    sh "cat reports/push-${tag}.log || true"
                    failedTags.add("${ref} (push failed — check reports/push-${tag}.log)")
                  }
                } catch (Exception e) {
                  echo "ERROR: Exception while pushing ${ref} - ${e.getMessage()}"
                  failedTags.add("${ref} (exception: ${e.getMessage()})")
                }
              } else {
                echo "WARNING: Empty tag found, skipping"
              }
            }

            if (failedTags.size() > 0) {
              error "Failed to push the following tags: ${failedTags.join(', ')}"
            } else {
              echo "SUCCESS: All tags pushed successfully"
            }
          }

          if (env.BRANCH_NAME == 'main') {
            withCredentials([usernamePassword(credentialsId: env.GIT_CRED_ID,
                                              usernameVariable: 'GH_USER',
                                              passwordVariable: 'GH_PAT')]) {
              try {
                sh """
                  git config user.email "ci@jenkins"
                  git config user.name  "Jenkins CI"
                  
                  # Check if tag already exists locally
                  if git tag -l | grep -q "^${env.NEXT_VERSION}\$"; then
                    echo "Tag ${env.NEXT_VERSION} already exists locally, deleting it first"
                    git tag -d ${env.NEXT_VERSION}
                  fi
                  
                  # Check if tag exists on remote
                  if git ls-remote --tags https://\${GH_USER}:\${GH_PAT}@github.com/${env.GH_OWNER}/${env.RAW_REPO}.git | grep -q "refs/tags/${env.NEXT_VERSION}\$"; then
                    echo "Tag ${env.NEXT_VERSION} already exists on remote, skipping tag creation"
                  else
                    echo "Creating new tag ${env.NEXT_VERSION}"
                    git tag -a ${env.NEXT_VERSION} -m "Release ${env.NEXT_VERSION} from Jenkins"
                    git push https://\${GH_USER}:\${GH_PAT}@github.com/${env.GH_OWNER}/${env.RAW_REPO}.git ${env.NEXT_VERSION}
                  fi
                """
                echo "SUCCESS: Git tag operation completed"
              } catch (Exception e) {
                echo "WARNING: Git tag operation failed: ${e.getMessage()}"
                echo "Continuing pipeline despite tag failure..."
                // Don't fail the entire pipeline if tag creation fails
              }
            }
          }
        }
      }
    }

    /* ---------- 7) Cleanup Local Images after push ---------- */
    stage('Cleanup Local Images') {
      when { anyOf { branch 'main'; branch 'dev'; branch 'aadarsh' } }
      steps {
        script {
          // remove all tags we created for the single image
          for (t in env.TAGS.split(',')) {
            sh "docker rmi ${env.IMAGE}:${t} || true"
          }
          // aggressive prune: unused images + build cache
          sh 'docker image prune -af || true'
          sh 'docker builder prune -af || true'
          // (optional) show disk usage after cleanup
          sh 'docker system df || true'
        }
      }
    }

    stage('Skip notice') {
      when { not { anyOf { branch 'main'; branch 'dev'; branch 'aadarsh' } } }
      steps { echo "Only main, dev & aadarsh branches build. '${env.BRANCH_NAME}' skipped." }
    }
  }

  post {
    always {
      sh 'docker logout ghcr.io || true'
      // keep this for dangling layers from failed runs
      sh 'docker image prune -f || true'
    }
  }
}