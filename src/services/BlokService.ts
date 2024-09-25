import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import chalk from 'chalk'
import path from 'path'
import os from 'os'
import ora, { Ora } from 'ora'
import BaseService from './BaseService'
import ProjectConfig from '../utils/projectConfig'
import Storyblok from '../Storyblok'

interface Manifest {
  files?: string[];
  componentFiles?: string[];
  storyblokFiles?: string[];
  storyblokDefinitions?: string[];
  packages?: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

class BlokService extends BaseService {
  async list(): Promise<any> {
    try {
      const { data } = await this.api.getBloks()
      return data
    } catch (error: any) {
      console.error(chalk.red('✖'), error.message)
    }
  }

  async add(projectDir: string, key: string, space: string, isSilent: boolean = false): Promise<void> {
    const spinner = ora({ isSilent });

    try {
      space = space || ProjectConfig.get().space;
      this.validateSpace(space);

      spinner.start(`Downloading blok ${key}...`);
      const tempDir = await this.downloadAndExtractBlok(key, spinner);
      const manifest = await this.readManifest(tempDir);

      await this.copyBlokFiles(projectDir, tempDir, manifest, spinner);
      await this.installBlokPackages(projectDir, manifest.packages, isSilent, spinner);
      await this.pushToStoryblok(projectDir, manifest.storyblokDefinitions, space, spinner);

      await this.cleanup(tempDir, spinner);
      spinner.succeed(`Blok ${key} added.`);
    } catch (error: any) {
      spinner.fail(error.message);
    }
  }

  private validateSpace(space: string): void {
    if (!space) {
      throw new Error('No space provided. Check your config file or provide a space id.');
    }
  }

  private async downloadAndExtractBlok(key: string, spinner: Ora): Promise<string> {
    const zipBuffer = await this.api.downloadBlok(key);
    spinner.succeed(`Blok ${key} downloaded.`);
    spinner.start('Extracting blok...');

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'component-'));
    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(tempDir, true);

    spinner.succeed('Blok extracted.');
    return tempDir;
  }

  private async readManifest(tempDir: string): Promise<Manifest> {
    const manifestPath = path.join(tempDir, 'manifest.json');
    return await fs.readJSON(manifestPath);
  }

  private async copyBlokFiles(projectDir: string, tempDir: string, manifest: Manifest, spinner: Ora): Promise<void> {
    spinner.start('Copying files...');
    const filesToCopy = [
      manifest.files,
      manifest.componentFiles,
      manifest.storyblokFiles,
      manifest.storyblokDefinitions
    ];

    for (const files of filesToCopy) {
      await this.copyFiles(tempDir, projectDir, files);
    }
    spinner.succeed('Files copied.');
  }

  private async installBlokPackages(
    projectDir: string,
    packages: Manifest['packages'],
    isSilent: boolean,
    spinner: Ora
  ): Promise<void> {
    if (packages && !isSilent) {
      spinner.start('Installing packages...');
      await this.handlePackages(projectDir, packages);
    }
  }

  private async pushToStoryblok(
    projectDir: string,
    definitions: string[] | undefined,
    space: string,
    spinner: Ora
  ): Promise<void> {
    if (definitions) {
      spinner.start('Pushing bloks to Storyblok...')
      const storyblok = new Storyblok(space)

      await Promise.all(definitions.map(async (definitionFile: string) => {
        spinner.start(`Pushing ${definitionFile} to Storyblok...`)
        const block = await fs.readJSON(path.join(projectDir, definitionFile))
        await storyblok.pushBlock(block.components[0])
        spinner.succeed(`${definitionFile} pushed to Storyblok.`)
      }))
    }
  }

  private async cleanup(tempDir: string, spinner: Ora): Promise<void> {
    spinner.start('Cleaning up...')
    await fs.remove(tempDir)
  }
}

export default BlokService