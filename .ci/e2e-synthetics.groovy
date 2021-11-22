#!/usr/bin/env groovy

@Library('apm@current') _

pipeline {
  agent { label 'ubuntu-18 && immutable' }
  environment {
    REPO = "synthetics"
    BASE_DIR = "src/github.com/elastic/${env.REPO}"
    PIPELINE_LOG_LEVEL = 'INFO'
    SLACK_CHANNEL = '#synthetics-user_experience-uptime'
    E2E_FOLDER = "__tests__/e2e"
  }
  options {
    timeout(time: 1, unit: 'HOURS')  // to support releases then we will add a timeout in each stage
    buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '20', daysToKeepStr: '30'))
    timestamps()
    ansiColor('xterm')
    disableResume()
    durabilityHint('PERFORMANCE_OPTIMIZED')
    rateLimitBuilds(throttle: [count: 60, durationName: 'hour', userBoost: true])
    quietPeriod(10)
  }
  stages {
    stage('Checkout') {
      options {
        skipDefaultCheckout()
        timeout(5)
      }
      steps {
        deleteDir()
        gitCheckout(basedir: "${BASE_DIR}")
        stash allowEmpty: true, name: 'source', useDefaultExcludes: false, excludes: ".nvm/**,.npm/_cacache/**,.nvm/.git/**"
      }
    }
    stage('Build') {
      options {
        skipDefaultCheckout()
      }
      steps {
        cleanup()
        withNodeEnv(){
          dir("${BASE_DIR}"){
            sh(label: 'Build',script: 'npm run build')
            sh(label: 'npm install', script: 'npm install')
          }
        }
      }
    }
    stage('E2e Test') {
      options {
        skipDefaultCheckout()
      }
      steps {
        withNodeEnv(){
          withGoEnv(){
            dir("${BASE_DIR}/${E2E_FOLDER}"){
              sh(label: 'npm install', script: 'npm install')
              sh(label: 'run e2e tests', script: 'npm run test:ci_integration_all')
            }
          }
        }
      }
      post {
        always {
          archiveArtifacts(allowEmptyArchive: true, artifacts: "${BASE_DIR}/${E2E_FOLDER}/junit_*.xml")
          junit(allowEmptyResults: true, keepLongStdio: true, testResults: "${BASE_DIR}/${E2E_FOLDER}/junit_*.xml")
        }
      }
    }
  }
  post {
    cleanup {
      notifyBuildResult(prComment: true)
    }
    unsuccessful {
      notifyStatus(slackStatus: 'danger', subject: "[${env.REPO}] e2e failed", body: "(<${env.RUN_DISPLAY_URL}|Open>)")
    }
    success {
      notifyStatus(slackStatus: 'good', subject: "[${env.REPO}] e2e ran successfully", body: "Great news, the e2e for synthetics has finished successfully. (<${env.RUN_DISPLAY_URL}|Open>).")
    }
  }
}

def cleanup(){
  dir("${BASE_DIR}"){
    deleteDir()
  }
  unstash 'source'
}

/**
  This is the wrapper to send notifications for the e2e process through
  slack and email, since it requires some formatting to support the same
  message in both systems.
 */
def notifyStatus(def args = [:]) {
  // TODO: Disabled temporarily to avoid spamming users while we are still developing this feature
  return
  releaseNotification(slackChannel: "${env.SLACK_CHANNEL}",
                      slackColor: args.slackStatus,
                      slackCredentialsId: 'jenkins-slack-integration-token',
                      to: 'synthrum@elastic.co',
                      subject: args.subject,
                      body: args.body)
}

// TODO: to be removed with the new step
def withNodeEnv(Map args=[:], Closure body){
  withEnv(["HOME=${WORKSPACE}"]) {
    sh(label: 'install nvm', script: '''
      set -e
      export NVM_DIR="${HOME}/.nvm"
      [ -s "${NVM_DIR}/nvm.sh" ] && . "${NVM_DIR}/nvm.sh"

      if [ -z "$(command -v nvm)" ]; then
        rm -fr "${NVM_DIR}"
        curl -so- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
      fi
    ''')
    sh(label: 'install Node.js', script: '''
      set -e
      export NVM_DIR="${HOME}/.nvm"
      [ -s "${NVM_DIR}/nvm.sh" ] && . "${NVM_DIR}/nvm.sh"

      # install node version required by .nvmrc in BASE_DIR
      nvm install $(cat $BASE_DIR/.nvmrc)
      nvm version | head -n1 > ".nvm-node-version"
    ''')
    def node_version = readFile(file: '.nvm-node-version').trim()
    withEnv(["PATH+NVM=${HOME}/.nvm/versions/node/${node_version}/bin"]){
      body()
    }
  }
}
