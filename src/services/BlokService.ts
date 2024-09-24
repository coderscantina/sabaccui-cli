import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import chalk from 'chalk'
import path from 'path'
import os from 'os'
import BaseService from './BaseService'
import ora from 'ora'
import ProjectConfig from '../utils/projectConfig'

class BlokService extends BaseService {
  async list() {
    try {
      const { data } = await this.api.getBloks()
      return data
    } catch (error) {
      console.error(chalk.red('✖'), error.message)
    }
  }

  async add(projectDir: string, key: string, space: string, isSilent: boolean = false): Promise<void> {
    const spinner = ora({
      isSilent
    })
    spinner.start(`Downloading blok ${key}...`)

    const config = ProjectConfig.get()
    if (!space) {
      space = config.space
    }

    try {
      if (!space) {
        throw new Error('No space provided. Check your config file or provide a space id.')
      }

      const zipBuffer = await this.api.downloadBlok(key)
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'component-'))

      spinner.succeed(`Blok ${key} downloaded.`)
      spinner.start('Extracting blok...')

      const zip = new AdmZip(zipBuffer)
      zip.extractAllTo(tempDir, true)

      const manifestPath = path.join(tempDir, 'manifest.json')
      const manifest = await fs.readJSON(manifestPath)

      spinner.succeed('Blok extracted.')

      spinner.start('Copying files...')
      await this.copyFiles(tempDir, projectDir, manifest.files)
      await this.copyFiles(tempDir, projectDir, manifest.componentFiles)
      await this.copyFiles(tempDir, projectDir, manifest.storyblokFiles)
      await this.copyFiles(tempDir, projectDir, manifest.storyblokDefinitions)
      spinner.succeed('Files copied.')

      if (manifest.packages && !isSilent) {
        spinner.start('Installing packages...')
        await this.handlePackages(projectDir, manifest.packages)
      }

      if (manifest.storyblokDefinitions) {
        spinner.start('Pushing bloks to Storyblok...')
        const storyblok = new Storyblok(config.space)

        await Promise.all(manifest.storyblokDefinitions.map(async (definitionFile: string) => {
          spinner.start(`Pushing ${definitionFile} to Storyblok...`)
          const block = await fs.readJSON(path.join(projectDir, definitionFile))
          await storyblok.pushBlock(block.components[0])
          spinner.succeed(`${definitionFile} pushed to Storyblok.`)
        }))
      }

      spinner.start('Cleaning up...')
      await fs.remove(tempDir)

      spinner.succeed(`Blok ${key} added.`)
    } catch (error) {
      spinner.fail(error.message)
    }
  }
}

export default BlokService