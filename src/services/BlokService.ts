import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import chalk from 'chalk'
import path from 'path'
import os from 'os'
import BaseService from './BaseService'

class BlokService extends BaseService {
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

      this.output(chalk.green('✅  Component downloaded successfully.'), silent)
      this.output(chalk.blue('🛠 Extracting component...'), silent)

      const zip = new AdmZip(zipBuffer)
      zip.extractAllTo(tempDir, true)

      const manifestPath = path.join(tempDir, 'manifest.json')
      const manifest = await fs.readJSON(manifestPath)

      this.output(chalk.green('✅  Component extracted successfully.'), silent)
      this.output(chalk.blue('📁 Copying files...'), silent)

      await this.copyFiles(tempDir, projectDir, manifest.files)
      await this.copyFiles(tempDir, projectDir, manifest.componentFiles)
      await this.copyFiles(tempDir, projectDir, manifest.storyblokFiles)
      await this.copyFiles(tempDir, projectDir, manifest.storyblokDefinitions)

      this.output(chalk.green('✅  Files copied successfully.'), silent)

      if (manifest.packages && !silent) {
        this.output(chalk.blue('📦 Installing packages...'), silent)
        await this.handlePackages(projectDir, manifest.packages)
      }

      if (manifest.storyblokDefinitions) {
        this.output(chalk.blue('🚀 Pushing Storyblok bloks...'), silent)
        await Promise.all(manifest.storyblokDefinitions.map(async (definitionFile: string) => {
          await this.pushStoryblokComponent(projectDir, definitionFile, space)
        }))
      }

      this.output(chalk.blue('🧹 Cleaning up...'), silent)
      await fs.remove(tempDir)

      this.output(chalk.green('✅  Component installed successfully!'), silent)
    } catch (error) {
      console.error(chalk.red('X'), error.message)
    }
  }
}

export default BlokService