#!/usr/bin/env groovy

@Library('apm@current') _

pipeline {
  agent { label 'linux && immutable' }
  environment {
    REPO = "synthetics"
    BASE_DIR = "src/github.com/elastic/${env.REPO}"
    NPMRC_SECRET = 'secret/jenkins-ci/npmjs/elasticmachine'
    TOTP_SECRET = 'totp/code/npmjs-elasticmachine'
    NPM_PACKAGE = '@elastic/synthetics'
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
  parameters {
    string(name: 'VERSION', defaultValue: '', description: 'Version to dist tag.')
    string(name: 'DIST_TAG', defaultValue: '', description: 'Dist tag to use.')
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
      }
    }
    stage('Dist tag') {
      options {
        skipDefaultCheckout()
      }
      steps {
        withNodeJSEnv() {
          dir("${BASE_DIR}") {
            withNpmrc(secret: "${env.NPMRC_SECRET}", path: "${env.WORKSPACE}/${env.BASE_DIR}") {
              withTotpVault(secret: "${env.TOTP_SECRET}", code_var_name: 'TOTP_CODE') {
                sh(script: "npm dist-tag --otp=${env.TOTP_CODE} add ${env.NPM_PACKAGE}@${env.VERSION} ${env.DIST_TAG}", label: "tag ${env.DIST_TAG}")
              }
            }
          }
        }
      }
    }
  }
  post {
    cleanup {
      notifyBuildResult(slackComment: true)
    }
  }
}
