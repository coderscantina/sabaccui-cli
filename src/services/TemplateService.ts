import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import degit from 'degit'
import chalk from 'chalk'
import inquirer from 'inquirer'
import ora from 'ora'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import util from 'util'
import { ConfigFile } from '../types'
import BaseService from './BaseService'
import BlokService from './BlokService'

const execPromise = util.promisify(exec)

class TemplateService extends BaseService {
  private blokService: BlokService

  constructor() {
    super()
    this.blokService = new BlokService()
  }

  async list() {
    try {
      const { data } = await this.api.getTemplates()
      return data
    } catch (error) {
      console.error(chalk.red('✖'), error.message)
    }
  }

  async askSetup(defaults?: ConfigFile): Promise<ConfigFile> {
    let space = defaults?.space

    // @ts-ignore
    return await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        default: defaults?.name,
        message: 'What is your project named?',
        validate: function (value: string) {
          if (value.length) {
            return true
          }
          return 'Please enter a valid project name'
        }
      },
      {
        type: 'input',
        name: 'space',
        message: 'Enter your Storyblok space id:',
        default: space,
        required: true,
        validate: function (value: string) {
          if (value.length) {
            space = value
            return true
          }

          return 'Please enter a valid space id'
        }
      },
      {
        type: 'password',
        name: 'storyblokToken',
        message() {
          exec(`open https://app.storyblok.com/#/me/spaces/${space}/settings?tab=api`)
          return 'Enter your Storyblok access token:'
        },
        required: true,
        validate: function (value: string) {
          if (value.length) {
            return true
          }
          return `Visit https://app.storyblok.com/#/me/spaces/${space}/settings?tab=api to get your API token`
        }
      },
      {
        type: 'input',
        name: 'domain',
        message: 'What will be the target domain of the project:',
      },
    ])
  }

  async setup(destination: string, input?: ConfigFile): Promise<ConfigFile> {
    this.output(chalk.blue('ℹ') + ' Setting up project...')

    const data = await this.askSetup(input)
    data.version = '1.0.0'

    if (data.storyblokToken) {
      const envPath = path.join(destination, '.env')
      const env = await fs.readFile(envPath, 'utf8')
      const newEnv = env.replace(/NUXT_STORYBLOK_ACCESS_TOKEN=.*/, `NUXT_STORYBLOK_ACCESS_TOKEN=${data.storyblokToken}`)
      await fs.writeFile(envPath, newEnv)
    }

    if (data.space) {
      // replace all occurance of '<space>' with the actual space id in package.json
      const packageJsonPath = path.join(destination, 'package.json')
      const packageJson = await fs.readFile(packageJsonPath, 'utf8')
      const newPackageJson = packageJson.replace(/<space>/g, data.space)
      await fs.writeFile(packageJsonPath, newPackageJson)
    }

    // Handle certificate symlinks and package.json updates
    const certSource = this.config.get('certificateSources.cert')
    const keySource = this.config.get('certificateSources.key')

    if (certSource && keySource) {
      const certDest = path.join(destination, 'localhost.crt')
      const keyDest = path.join(destination, 'localhost.key')

      // Create symlinks
      await fs.ensureSymlink(certSource, certDest)
      await fs.ensureSymlink(keySource, keyDest)

      // Update package.json
      const packageJsonPath = path.join(destination, 'package.json')
      let packageJson = await fs.readFile(packageJsonPath, 'utf8')
      packageJson = packageJson.replace(/<localhost.crt>/g, 'localhost.crt')
      packageJson = packageJson.replace(/<localhost.key>/g, 'localhost.key')
      await fs.writeFile(packageJsonPath, packageJson)

      this.output(chalk.green('✔') + ' SSL certificates configured.')
    }

    delete data.storyblokToken

    const configFile = path.join(destination, 'sabaccui.config.json')
    await fs.writeJSON(configFile, data, { spaces: 2 })

    this.output(chalk.green('✔') + ' Project setup successfully.')

    return data
  }

  async init(name: string, key: string, destination: string, space: string): Promise<void> {
    const spinner = ora('Downloading template...').start()
    const projectDir = path.join(destination, name)

    try {
      const zipBuffer = await this.api.downloadTemplate(key)
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'template-'))

      spinner.succeed('Template downloaded.')
      spinner.start('Extracting template...')
      const zip = new AdmZip(zipBuffer)
      zip.extractAllTo(tempDir, true)

      const manifestPath = path.join(tempDir, 'manifest.json')
      const manifest = await fs.readJSON(manifestPath)

      spinner.succeed('Template extracted.')

      if (manifest.source) {
        spinner.start('Cloning source repository...')
        await this.cloneSource(manifest.source, projectDir)
        spinner.succeed('Source repository cloned.')
      }

      const envExamplePath = path.join(projectDir, '.env.example')
      const envPath = path.join(projectDir, '.env')
      if (fs.existsSync(envExamplePath) && !fs.existsSync(envPath)) {
        await fs.copy(envExamplePath, envPath)
      }
      const config = await this.setup(projectDir, { name, space })

      spinner.start('Copying template files...')
      await this.copyFiles(tempDir, projectDir, manifest.templateFiles)
      spinner.succeed('Template files copied.')

      if (manifest.usedComponents) {
        spinner.start('Installing components...')
        const installedComponents:string[] = []
        const installPromises = manifest.usedComponents.map(async (componentKey) => {
          installedComponents.push(componentKey)
          return this.blokService.add(projectDir, componentKey, config.space, true)
        })
        await Promise.all(installPromises)
        spinner.succeed(`${installedComponents.length} Components installed:`)
        installedComponents.forEach((component) => {
          this.output(`  + ${component}`)
        })
      }

      spinner.start('Installing packages...')
      if (manifest.packages) {
        await this.handlePackages(projectDir, manifest.packages)
      } else {
        await execPromise('bun install', { cwd: projectDir })
      }
      spinner.succeed('Packages installed.')

      if (manifest.migrations) {
        spinner.start('Running migrations...')
        for (const migration of manifest.migrations) {
          const migrationPath = path.join(projectDir, migration)
          await execPromise(`node ${migrationPath}`, { cwd: projectDir })
        }
        spinner.succeed('Migrations completed.')
      }

      spinner.start('Initializing git repository...')

      await execPromise('git init', { cwd: projectDir })
      await execPromise('git add .', { cwd: projectDir })

      spinner.succeed('Git repository initialized.')

      spinner.start('Cleaning up...')
      await fs.remove(tempDir)
      spinner.stopAndPersist({text: 'Template installed successfully.', symbol: '🚀'})
    } catch (error) {
      console.error(chalk.red('✖'), error.message)
    }
  }

  private async cloneSource(source: string, targetDir: string): Promise<void> {
    try {
      const emitter = degit(source, {
        cache: false,
        force: true,
        verbose: true,
      })

      await emitter.clone(targetDir)
    } catch (error) {
      throw new Error(`Failed to clone source repository: ${error.message}`)
    }
  }
}

export default TemplateService