import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import degit from 'degit'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { exec } from 'child_process'
import path from 'path'
import os from 'os'

import { ConfigFile } from '../types'
import BaseService from './BaseService'
import BlokService from './BlokService'

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
      console.error(chalk.red('X'), error.message)
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
        message: 'Name of the project:',
        validate: function (value) {
          if (value.length) {
            return true
          }
          return 'Please enter a valid project name'
        }
      },
      {
        type: 'input',
        name: 'space',
        message: 'Storyblok space id:',
        default: space,
        required: true,
        validate: function (value) {
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
          return 'Storyblok API token:'
        },
        required: true,
        validate: function (value) {
          if (value.length) {
            return true
          }
          exec(`open https://app.storyblok.com/#/me/spaces/${space}/settings?tab=api`)
          return `Visit https://app.storyblok.com/#/me/spaces/${space}/settings?tab=api to get your API token`
        }
      },
      {
        type: 'input',
        name: 'domain',
        message: 'The target domain of the project:',
      },
    ])
  }

  async setup(destination: string, input?: ConfigFile): Promise<ConfigFile> {
    this.output(chalk.blue('🔧 Setting up project...'))

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

      this.output(chalk.green('✅  SSL certificates configured successfully.'))
    }

    delete data.storyblokToken

    const configFile = path.join(destination, 'sabaccui.config.json')
    await fs.writeJSON(configFile, data, { spaces: 2 })

    this.output(chalk.green('✅  Project setup successfully!'))

    return data
  }

  async init(name: string, key: string, destination: string, space: string): Promise<void> {
    this.output(chalk.blue('📦 Downloading template...'))
    const projectDir = path.join(destination, name)

    try {
      const zipBuffer = await this.api.downloadTemplate(key)
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'template-'))

      this.output(chalk.green('✅  Template downloaded successfully.'))
      this.output(chalk.blue('🛠 Extracting template...'))
      const zip = new AdmZip(zipBuffer)
      zip.extractAllTo(tempDir, true)

      const manifestPath = path.join(tempDir, 'manifest.json')
      const manifest = await fs.readJSON(manifestPath)

      this.output(chalk.green('✅  Template extracted successfully.'))

      if (manifest.source) {
        this.output(chalk.blue('🔗 Cloning source repository...'))
        await this.cloneSource(manifest.source, projectDir)
        this.output(chalk.green('✅  Source repository cloned successfully.'))
      }

      const envExamplePath = path.join(projectDir, '.env.example')
      const envPath = path.join(projectDir, '.env')
      if (fs.existsSync(envExamplePath) && !fs.existsSync(envPath)) {
        await fs.copy(envExamplePath, envPath)
      }
      const config = await this.setup(projectDir, { name, space })

      this.output(chalk.blue('📁 Copying template files...'))
      await this.copyFiles(tempDir, projectDir, manifest.templateFiles)
      this.output(chalk.green('✅  Template files copied successfully.'))

      if (manifest.usedComponents) {
        this.output(chalk.blue('🧩 Installing components...'))
        const installPromises = manifest.usedComponents.map(async (componentKey) => {
          this.output(chalk.yellow(`Installing component: ${componentKey}`))
          return this.blokService.add(projectDir, componentKey, config.space, true)
        })
        await Promise.all(installPromises)
        this.output(chalk.green('✅  All components installed successfully.'))
      }

      this.output(chalk.blue('📦 Installing packages...'))
      if (manifest.packages) {
        await this.handlePackages(projectDir, manifest.packages)
      } else {
        await execPromise('bun install', { cwd: projectDir })
      }
      this.output(chalk.green('✅  Packages installed successfully.'))

      if (manifest.migrations) {
        this.output(chalk.blue('🔄 Running migrations...'))
        for (const migration of manifest.migrations) {
          const migrationPath = path.join(projectDir, migration)
          await execPromise(`node ${migrationPath}`, { cwd: projectDir })
        }
        this.output(chalk.green('✅  Migrations completed successfully.'))
      }

      this.output(chalk.blue('🔗 Initializing git repository...'))

      await execPromise('git init', { cwd: projectDir })
      await execPromise('git add .', { cwd: projectDir })

      this.output(chalk.green('✅  Git repository initialized.'))

      this.output(chalk.blue('🧹 Cleaning up...'))
      await fs.remove(tempDir)

      this.output(chalk.green('✅  Template installed successfully!'))
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message)
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