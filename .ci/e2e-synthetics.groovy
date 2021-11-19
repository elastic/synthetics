#!/usr/bin/env groovy

@Library('apm@current') _

pipeline {
  agent { label 'ubuntu-18 && immutable' }
  environment {
    REPO = "synthetics"
    BASE_DIR = "src/github.com/elastic/${env.REPO}"
    PIPELINE_LOG_LEVEL = 'INFO'
    SLACK_CHANNEL = '#synthetics-user_experience-uptime'
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

/**
  This is the wrapper to send notifications for the release process through
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
