import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import degit from 'degit'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import util from 'util'
import chalk, { ChalkInstance } from 'chalk'

import API from './api'
import credentials from './utils/credentials'
import { ConfigFile, LoginPayload } from './types'
import inquirer from 'inquirer'

const execPromise = util.promisify(exec)

class BaseService {
  protected api: API

  constructor() {
    this.api = new API()
  }

  protected async copyFiles(sourceDir: string, targetDir: string, files: string[] | undefined): Promise<void> {
    for (const file of files || []) {
      const src = path.join(sourceDir, file)
      const dest = path.join(targetDir, file)

      await fs.ensureDir(path.dirname(dest))
      await fs.copy(src, dest)
    }
  }

  protected async installPackages(projectDir: string, packages: string[], isDevDependency: boolean = false, packageManager: 'npm' | 'yarn' | 'bun' = 'npm'): Promise<void> {
    if (packages.length > 0) {
      let installCommand: string

      switch (packageManager) {
        case 'yarn':
          installCommand = `yarn add ${isDevDependency ? '--dev' : ''} ${packages.join(' ')}`
          break
        case 'bun':
          installCommand = `bun add ${isDevDependency ? '-d' : ''} ${packages.join(' ')}`
          break
        case 'npm':
        default:
          installCommand = `npm install ${isDevDependency ? '--save-dev' : ''} ${packages.join(' ')}`
          break
      }

      await execPromise(installCommand, { cwd: projectDir })
      this.output(chalk.green('✓') + ' Packages installed successfully.')
    } else {
      this.output(chalk.yellow('I') + ' No new packages to install.')
    }
  }

  private detectPackageManager(projectDir: string): 'npm' | 'yarn' | 'bun' {
    if (fs.existsSync(path.join(projectDir, 'yarn.lock'))) {
      return 'yarn'
    }
    if (fs.existsSync(path.join(projectDir, 'bun.lockb'))) {
      return 'bun'
    }

    return 'npm'
  }

  protected async handlePackages(projectDir: string, packages: {
    dependencies?: Record<string, string>,
    devDependencies?: Record<string, string>
  }): Promise<void> {
    const packageJsonPath = path.join(projectDir, 'package.json')
    const packageJson = await fs.readJSON(packageJsonPath)
    const packageManager = this.detectPackageManager(projectDir)

    let dependenciesToInstall: string[] = []
    let devDependenciesToInstall: string[] = []

    for (const [name, version] of Object.entries(packages.dependencies || {})) {
      if (!packageJson.dependencies[name]) {
        dependenciesToInstall.push(`${name}@${version}`)
      }
    }

    for (const [name, version] of Object.entries(packages.devDependencies || {})) {
      if (!packageJson.devDependencies[name]) {
        devDependenciesToInstall.push(`${name}@${version}`)
      }
    }

    await this.installPackages(projectDir, dependenciesToInstall, false, packageManager)
    await this.installPackages(projectDir, devDependenciesToInstall, true, packageManager)
  }

  protected async pushStoryblokComponent(projectDir: string, definitionFile: string, space: string): Promise<void> {
    const file = path.join(projectDir, definitionFile)
    const storyblokCommand = `storyblok push-components ${file} --space ${space}`
    try {
      const result = await execPromise(storyblokCommand, { cwd: projectDir })
      this.output(chalk.green('✓') + ' Storyblok component pushed successfully.')
    } catch (error) {
      console.error(chalk.red('X') + ' Error pushing Storyblok component:', error.message)
    }
  }

  protected output(content: string | ChalkInstance, silent: boolean = false): void {
    if (!silent) console.log(content)
  }
}

class ComponentService extends BaseService {
  async list() {
    try {
      const { data } = await this.api.getComponents()
      return data
    } catch (error) {
      console.error(chalk.red('X'), error.message)
    }
  }

  async add(projectDir: string, key: string, space: string, silent: boolean = false): Promise<void> {
    this.output(chalk.blue(`📦 Downloading component: ${key} ...`), silent)

    const configFile = path.join(projectDir, 'sabaccui.config.json')
    const config = await fs.readJSON(configFile)
    if (!space) {
      space = config.space
    }

    try {
      if (!space) {
        throw new Error('No space provided. Check your config file or provide a space id.')
      }

      const zipBuffer = await this.api.downloadComponent(key)
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'component-'))

      this.output(chalk.green('✅ Component downloaded successfully.'), silent)
      this.output(chalk.blue('🛠 Extracting component...'), silent)

      const zip = new AdmZip(zipBuffer)
      zip.extractAllTo(tempDir, true)

      const manifestPath = path.join(tempDir, 'manifest.json')
      const manifest = await fs.readJSON(manifestPath)

      this.output(chalk.green('✅ Component extracted successfully.'), silent)
      this.output(chalk.blue('📁 Copying files...'), silent)

      await this.copyFiles(tempDir, projectDir, manifest.files)
      await this.copyFiles(tempDir, projectDir, manifest.componentFiles)
      await this.copyFiles(tempDir, projectDir, manifest.storyblokFiles)
      await this.copyFiles(tempDir, projectDir, manifest.storyblokDefinitions)

      this.output(chalk.green('✅ Files copied successfully.'), silent)

      if (manifest.packages && !silent) {
        this.output(chalk.blue('📦 Installing packages...'), silent)
        await this.handlePackages(projectDir, manifest.packages)
      }

      if (manifest.storyblokDefinitions) {
          this.output(chalk.blue('🚀 Pushing Storyblok component...'), silent)
        await manifest.storyblokDefinitions.forEach(async (definitionFile: string) => {
          await this.pushStoryblokComponent(projectDir, definitionFile, space)
        })
      }

      this.output(chalk.blue('🧹 Cleaning up...'), silent)
      await fs.remove(tempDir)

      this.output(chalk.green('✅ Component installed successfully!'), silent)
    } catch (error) {
      console.error(chalk.red('X'), error.message)
    }
  }
}

class TemplateService extends BaseService {
  private componentService: ComponentService

  constructor() {
    super()
    this.componentService = new ComponentService()
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
        default: defaults?.space,
        required: true,
        validate: function (value) {
          if (value.length) {
            return true
          }
          return 'Please enter a valid space id'
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

    const configFile = path.join(destination, 'sabaccui.config.json')
    await fs.writeJSON(configFile, data, { spaces: 2 })

    this.output(chalk.green('✅ Project setup successfully!'))

    return data
  }

  async init(name: string, key: string, destination: string, space: string): Promise<void> {
    this.output(chalk.blue('📦 Downloading template...'))
    const projectDir = path.join(destination, name)

    try {
      const zipBuffer = await this.api.downloadTemplate(key)
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'template-'))

      this.output(chalk.green('✅ Template downloaded successfully.'))
      this.output(chalk.blue('🛠 Extracting template...'))
      const zip = new AdmZip(zipBuffer)
      zip.extractAllTo(tempDir, true)

      const manifestPath = path.join(tempDir, 'manifest.json')
      const manifest = await fs.readJSON(manifestPath)

      this.output(chalk.green('✅ Template extracted successfully.'))

      if (manifest.source) {
        this.output(chalk.blue('🔗 Cloning source repository...'))
        await this.cloneSource(manifest.source, projectDir)
        this.output(chalk.green('✅ Source repository cloned successfully.'))
      }

      const config = await this.setup(projectDir, { name, space })

      this.output(chalk.blue('📁 Copying template files...'))
      await this.copyFiles(tempDir, projectDir, manifest.templateFiles)
      this.output(chalk.green('✅ Template files copied successfully.'))

      if (manifest.usedComponents) {
        this.output(chalk.blue('🧩 Installing components...'))
        const installPromises = manifest.usedComponents.map(async (componentKey) => {
          this.output(chalk.yellow(`Installing component: ${componentKey}`))
          return this.componentService.add(projectDir, componentKey, config.space, true)
        })
        await Promise.all(installPromises)
        this.output(chalk.green('✅ All components installed successfully.'))
      }

      this.output(chalk.blue('📦 Installing packages...'))
      if (manifest.packages) {
        await this.handlePackages(projectDir, manifest.packages)
      } else {
        await execPromise('bun install', { cwd: projectDir })
      }
      this.output(chalk.green('✅ Packages installed successfully.'))

      if (manifest.migrations) {
        this.output(chalk.blue('🔄 Running migrations...'))
        for (const migration of manifest.migrations) {
          const migrationPath = path.join(projectDir, migration)
          await execPromise(`node ${migrationPath}`, { cwd: projectDir })
        }
        this.output(chalk.green('✅ Migrations completed successfully.'))
      }

      this.output(chalk.blue('🔗 Initializing git repository...'))
      const envExamplePath = path.join(projectDir, '.env.example')
      const envPath = path.join(projectDir, '.env')
      if (fs.existsSync(envExamplePath) && !fs.existsSync(envPath)) {
        await fs.copy(envExamplePath, envPath)
      }

      await execPromise('git init', { cwd: projectDir })
      await execPromise('git add .', { cwd: projectDir })

      this.output(chalk.green('✅ Git repository initialized.'))

      this.output(chalk.blue('🧹 Cleaning up...'))
      await fs.remove(tempDir)

      this.output(chalk.green('✅ Template installed successfully!'))
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

class Service {
  private api: API

  constructor() {
    this.api = new API()
  }

  async login(input: LoginPayload) {
    const data = await this.api.login(input)
    credentials.set(input.email, data.access_token)

    return true
  }

  async logout() {
    await this.api.logout()
    credentials.clear()
  }

  async license(input: { license: string }) {
    const data = await this.api.license(input.license)

    return data
  }
}

export { Service, ComponentService, TemplateService }