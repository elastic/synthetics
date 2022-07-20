#!/usr/bin/env groovy

@Library('apm@current') _

pipeline {
  agent { label 'ubuntu-18 && immutable' }
  environment {
    REPO = "synthetics"
    BASE_DIR = "src/github.com/elastic/${env.REPO}"
    DOCKER_REGISTRY = 'docker.elastic.co'
    DOCKER_ELASTIC_SECRET = 'secret/observability-team/ci/docker-registry/prod'
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
        withNodeJSEnv(){
          dir("${BASE_DIR}"){
            sh(label: 'npm install', script: 'npm install')
            sh(label: 'Build',script: 'npm run build')
          }
        }
      }
    }
    stage('E2e Test') {
      options {
        skipDefaultCheckout()
      }
      steps {
        dockerLogin(secret: "${DOCKER_ELASTIC_SECRET}", registry: "${DOCKER_REGISTRY}")
        withNodeJSEnv(){
          withGoEnv(){
            dir("${BASE_DIR}/${E2E_FOLDER}"){
              sh(label: 'npm install', script: 'npm install')
              sh(label: 'run e2e tests', script: '''#!/bin/bash
                npm run test:ci_integration_all
              ''')
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
    // unsuccessful {
    //   notifyStatus(slackStatus: 'danger', subject: "[${env.REPO}] e2e failed", body: "(<${env.RUN_DISPLAY_URL}|Open>)")
    // }
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
  releaseNotification(slackChannel: "${env.SLACK_CHANNEL}",
                      slackColor: args.slackStatus,
                      slackCredentialsId: 'jenkins-slack-integration-token',
                      to: 'synthrum@elastic.co',
                      subject: args.subject,
                      body: args.body)
}
