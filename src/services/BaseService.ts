import fs from 'fs-extra'
import path from 'path'
import { promisify } from 'util'
import { exec as execCallback } from 'child_process'
import chalk, { ChalkInstance } from 'chalk'
import API from '../api'
import { Config } from '../config'

const exec = promisify(execCallback)

type PackageManager = 'npm' | 'yarn' | 'bun';

interface PackageSet {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

class BaseService {
  protected api: API

  protected config: Config

  constructor() {
    this.api = new API()
    this.config = new Config()
  }

  protected async copyFiles(sourceDir: string, targetDir: string, files: string[] = []): Promise<void> {
    for (const file of files) {
      const src = path.join(sourceDir, file)
      const dest = path.join(targetDir, file)

      await fs.ensureDir(path.dirname(dest))
      if (await this.isFileContentDifferent(src, dest)) {
        const baseName = path.basename(file, path.extname(file))
        await fs.copy(src, dest.replace(baseName, `${baseName}.default`))
      } else if (!fs.existsSync(dest)) {
        await fs.copy(src, dest)
      }
    }
  }

  private async isFileContentDifferent(src: string, dest: string): Promise<boolean> {
    if (!fs.existsSync(dest)) return false
    const [srcContent, destContent] = await Promise.all([
      fs.readFile(src, 'utf-8'),
      fs.readFile(dest, 'utf-8')
    ])
    return srcContent !== destContent
  }

  protected async installPackages(
    projectDir: string,
    packages: string[],
    isDevDependency: boolean = false,
    packageManager: PackageManager = 'npm'
  ): Promise<void> {
    if (packages.length === 0) {
      this.output(chalk.blue('ℹ') + ' No new packages to install.')
      return
    }

    const installCommand = this.getInstallCommand(packageManager, isDevDependency, packages)
    await exec(installCommand, { cwd: projectDir })
    this.output(chalk.green('✓') + ' Packages installed successfully.')
  }

  private getInstallCommand(packageManager: PackageManager, isDevDependency: boolean, packages: string[]): string {
    const devFlag = isDevDependency ? '--dev' : ''
    switch (packageManager) {
      case 'yarn':
        return `yarn add ${devFlag} ${packages.join(' ')}`
      case 'bun':
        return `bun add ${isDevDependency ? '-d' : ''} ${packages.join(' ')}`
      default:
        return `npm install ${isDevDependency ? '--save-dev' : ''} ${packages.join(' ')}`
    }
  }

  private detectPackageManager(projectDir: string): PackageManager {
    if (fs.existsSync(path.join(projectDir, 'yarn.lock'))) return 'yarn'
    if (fs.existsSync(path.join(projectDir, 'bun.lockb'))) return 'bun'
    return 'npm'
  }

  protected async handlePackages(projectDir: string, packages: PackageSet): Promise<void> {
    const packageJsonPath = path.join(projectDir, 'package.json')
    const packageJson = await fs.readJSON(packageJsonPath)
    const packageManager = this.detectPackageManager(projectDir)

    const [dependenciesToInstall, devDependenciesToInstall] = this.getPackagesToInstall(packageJson, packages)

    await this.installPackages(projectDir, dependenciesToInstall, false, packageManager)
    await this.installPackages(projectDir, devDependenciesToInstall, true, packageManager)
  }

  private getPackagesToInstall(packageJson: any, packages: PackageSet): [string[], string[]] {
    const dependenciesToInstall = this.getDependenciesToInstall(packageJson.dependencies, packages.dependencies)
    const devDependenciesToInstall = this.getDependenciesToInstall(packageJson.devDependencies, packages.devDependencies)
    return [dependenciesToInstall, devDependenciesToInstall]
  }

  private getDependenciesToInstall(existingDeps: Record<string, string>, newDeps?: Record<string, string>): string[] {
    return Object.entries(newDeps || {})
      .filter(([name]) => !existingDeps[name])
      .map(([name, version]) => `${name}@${version}`)
  }

  protected output(content: string | ChalkInstance, silent: boolean = false): void {
    if (!silent) console.log(content)
  }
}

export default BaseService