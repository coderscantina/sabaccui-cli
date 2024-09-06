import API from '../api'
import { Config } from '../config'
import path from 'path'
import chalk, { ChalkInstance } from 'chalk'

class BaseService {
  protected api: API

  protected config: Config

  constructor() {
    this.api = new API()
    this.config = new Config()
  }

  protected async copyFiles(sourceDir: string, targetDir: string, files: string[] | undefined): Promise<void> {
    for (const file of files || []) {
      const src = path.join(sourceDir, file)
      const dest = path.join(targetDir, file)

      await fs.ensureDir(path.dirname(dest))
      if (!fs.existsSync(dest)) {
        await fs.copy(src, dest)
      }
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

export default BaseService