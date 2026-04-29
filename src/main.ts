import * as core from '@actions/core'
import * as github from '@actions/github'
import axios, {isAxiosError} from 'axios'
import * as fs from 'fs'

type DeploymentState =
  | 'error'
  | 'failure'
  | 'inactive'
  | 'in_progress'
  | 'queued'
  | 'pending'
  | 'success'

// Environment can actually be any string, but we need to type it like this to fit the GitHub API's TypeScript types.
type Environment = 'production' | 'staging' | 'qa' | undefined

async function validateSubscription(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH
  let repoPrivate: boolean | undefined

  if (eventPath && fs.existsSync(eventPath)) {
    const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
    repoPrivate = eventData?.repository?.private
  }

  const upstream = 'chrnorm/deployment-status'
  const action = process.env.GITHUB_ACTION_REPOSITORY
  const docsUrl =
    'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions'

  core.info('')
  core.info('[1;36mStepSecurity Maintained Action[0m')
  core.info(`Secure drop-in replacement for ${upstream}`)
  if (repoPrivate === false) core.info('[32m✓ Free for public repositories[0m')
  core.info(`[36mLearn more:[0m ${docsUrl}`)
  core.info('')

  if (repoPrivate === false) return

  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com'
  const body: Record<string, string> = {action: action || ''}
  if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body,
      {timeout: 3000}
    )
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 403) {
      core.error(
        `[1;31mThis action requires a StepSecurity subscription for private repositories.[0m`
      )
      core.error(`[31mLearn how to enable a subscription: ${docsUrl}[0m`)
      process.exit(1)
    }
    core.info('Timeout or API not reachable. Continuing to next step.')
  }
}

async function run(): Promise<void> {
  try {
    await validateSubscription()

    const context = github.context
    const defaultUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}/commit/${context.sha}/checks`

    const token = core.getInput('token', {required: true})

    const baseUrl =
      core.getInput('github-base-url', {required: false}) || undefined

    const octokit = github.getOctokit(token, {baseUrl})

    const owner =
      core.getInput('owner', {required: false}) || context.repo.owner
    const repo = core.getInput('repo', {required: false}) || context.repo.repo

    const logUrl = core.getInput('log-url', {required: false}) || defaultUrl
    const description = core.getInput('description', {required: false}) || ''
    const deploymentId = core.getInput('deployment-id')
    const environmentUrl =
      core.getInput('environment-url', {required: false}) || ''

    const environment =
      (core.getInput('environment', {required: false}) as Environment) ||
      undefined

    const autoInactiveStringInput =
      core.getInput('auto-inactive', {required: false}) || undefined

    const autoInactive = autoInactiveStringInput
      ? autoInactiveStringInput === 'true'
      : undefined

    const state = core.getInput('state') as DeploymentState

    await octokit.rest.repos.createDeploymentStatus({
      owner,
      repo,
      environment,
      auto_inactive: autoInactive, // GitHub API defaults to true if undefined.
      deployment_id: parseInt(deploymentId),
      state,
      log_url: logUrl,
      description,
      environment_url: environmentUrl
    })
  } catch (error: any) {
    core.error(error)
    core.setFailed(`Error setting GitHub deployment status: ${error.message}`)
  }
}

run()
