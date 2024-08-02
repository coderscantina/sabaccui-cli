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
import { LoginPayload } from './types'

const execPromise = util.promisify(exec)

class BaseService {
  protected api: API

  constructor() {
    this.api = new API()
  }

  protected async copyFiles(sourceDir, targetDir, files) {
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
      console.log(chalk.green('✅ Packages installed successfully.'))
    } else {
      console.log(chalk.yellow('ℹ️  No new packages to install.'))
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

  protected async pushStoryblokComponent(projectDir: string, definitionFile: string): Promise<void> {
    const storyblokCommand = `storyblok push-components ${definitionFile}`
    try {
      await execPromise(storyblokCommand, { cwd: projectDir })
      console.log(chalk.green('✅ Storyblok component pushed successfully.'))
    } catch (error) {
      console.error(chalk.red('❌ Error pushing Storyblok component:'), error.message)
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
      console.error(chalk.red('❌ Error:'), error.message)
    }
  }

  async add(projectDir: string, key: string, silent: boolean = false): Promise<void> {
    this.output(chalk.blue(`📦 Downloading component: ${key} ...`))

    try {
      const zipBuffer = await this.api.downloadComponent(key)
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'component-'))

      this.output(chalk.green('✅ Component downloaded successfully.'))
      this.output(chalk.blue('🛠 Extracting component...'))

      const zip = new AdmZip(zipBuffer)
      zip.extractAllTo(tempDir, true)

      const manifestPath = path.join(tempDir, 'manifest.json')
      const manifest = await fs.readJSON(manifestPath)

      this.output(chalk.green('✅ Component extracted successfully.'))
      this.output(chalk.blue('📁 Copying files...'))

      await this.copyFiles(tempDir, projectDir, manifest.componentFiles)
      await this.copyFiles(tempDir, projectDir, manifest.storyblokFiles)

      this.output(chalk.green('✅ Files copied successfully.'))

      if (manifest.packages) {
        this.output(chalk.blue('📦 Installing packages...'))
        await this.handlePackages(projectDir, manifest.packages)
      }

      if (manifest.storyblokDefinition) {
        this.output(chalk.blue('🚀 Pushing Storyblok component...'))
        await this.pushStoryblokComponent(projectDir, manifest.storyblokDefinition)
      }

      this.output(chalk.blue('🧹 Cleaning up...'))
      await fs.remove(tempDir)

      this.output(chalk.green('✅ Component installed successfully!'))
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message)
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
      console.error(chalk.red('❌ Error:'), error.message)
    }
  }


  async init(name: string, key: string, destination: string): Promise<void> {
    console.log(chalk.blue('📦 Downloading template...'))
    const projectDir = path.join(destination, name)

    try {
      const zipBuffer = await this.api.downloadTemplate(key)
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'template-'))

      console.log(chalk.green('✅ Template downloaded successfully.'))
      console.log(chalk.blue('🛠 Extracting template...'))
      const zip = new AdmZip(zipBuffer)
      zip.extractAllTo(tempDir, true)

      const manifestPath = path.join(tempDir, 'manifest.json')
      const manifest = await fs.readJSON(manifestPath)

      console.log(chalk.green('✅ Template extracted successfully.'))

      if (manifest.source) {
        console.log(chalk.blue('🔗 Cloning source repository...'))
        await this.cloneSource(manifest.source, projectDir)
        console.log(chalk.green('✅ Source repository cloned successfully.'))
      }

      console.log(chalk.blue('📁 Copying template files...'))
      await this.copyFiles(tempDir, projectDir, manifest.templateFiles)
      console.log(chalk.green('✅ Template files copied successfully.'))

      if (manifest.usedComponents) {
        console.log(chalk.blue('🧩 Installing components...'))
        for (const componentKey of manifest.usedComponents) {
          console.log(chalk.yellow(`Installing component: ${componentKey}`))
          await this.componentService.add(projectDir, componentKey, true)
        }
        console.log(chalk.green('✅ All components installed successfully.'))
      }

      if (manifest.packages) {
        console.log(chalk.blue('📦 Installing packages...'))
        await this.handlePackages(projectDir, manifest.packages)
      }

      if (manifest.migrations) {
        console.log(chalk.blue('🔄 Running migrations...'))
        for (const migration of manifest.migrations) {
          const migrationPath = path.join(projectDir, migration)
          await execPromise(`node ${migrationPath}`, { cwd: projectDir })
        }
        console.log(chalk.green('✅ Migrations completed successfully.'))
      }

      console.log(chalk.blue('🧹 Cleaning up...'))
      await fs.remove(tempDir)

      console.log(chalk.green('✅ Template installed successfully!'))
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
}

export { Service, ComponentService, TemplateService }