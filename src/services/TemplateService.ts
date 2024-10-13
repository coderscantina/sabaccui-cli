import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import degit from 'degit'
import chalk from 'chalk'
import inquirer from 'inquirer'
import ora, { Ora } from 'ora'
import path from 'path'
import os from 'os'
import { promisify } from 'util'
import { exec as execCallback } from 'child_process'
import { ConfigFile } from '../types'
import BaseService from './BaseService'
import BlokService from './BlokService'
import credentials from '../utils/credentials'
import Storyblok from '../Storyblok'
import ProjectConfig from '../utils/projectConfig'

const exec = promisify(execCallback);

interface Manifest {
  source?: string;
  templateFiles?: string[];
  usedComponents?: string[];
  packages?: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  type: 'source' | 'self-contained';
  baseDir: string;
  migrations?: string[];
}

class TemplateService extends BaseService {
  private blokService: BlokService;

  constructor() {
    super();
    this.blokService = new BlokService();
  }

  async list(): Promise<any> {
    try {
      const { data } = await this.api.getTemplates();
      return data;
    } catch (error: any) {
      console.error(chalk.red('✖'), error.message);
      throw error;
    }
  }

  async askSetup(defaults?: ConfigFile): Promise<ConfigFile> {
    const c = credentials.get('sabaccui.storyblok.com');
    const oAuthToken = c?.password ?? null;
    const hasOAuthToken = !!oAuthToken;

    const questions = [
      this.createQuestion('input', 'name', 'What is your project named?', defaults?.name),
      this.createQuestion('input', 'space', 'Enter your Storyblok space id:', defaults?.space, true),
      this.createOAuthQuestion(hasOAuthToken, oAuthToken),
      this.createTokenQuestion(),
      this.createQuestion('input', 'domain', 'What will be the target domain of the project:'),
    ];

    return inquirer.prompt(questions);
  }

  private createQuestion(type: string, name: string, message: string, defaultValue?: string, required = false): any {
    return {
      type,
      name,
      message,
      default: defaultValue,
      validate: (value: string) => value.length || !required ? true : `Please enter a valid ${name}`,
    };
  }

  private createOAuthQuestion(hasOAuthToken: boolean, oAuthToken: string): any {
    return {
      type: 'password',
      name: 'storyblokOAuthToken',
      message: hasOAuthToken ? 'Update your Storyblok OAuth:' : 'Enter your Storyblok OAuth:',
      required: !hasOAuthToken,
      filter: (value: string) => value.length ? value : oAuthToken,
      validate: (value: string) => hasOAuthToken || value.length ? true : 'Visit https://app.storyblok.com/#/me/account?tab=token to create an OAuth token',
      async when() {
        if (!hasOAuthToken) {
          await exec('open https://app.storyblok.com/#/me/account?tab=token');
        }
        return true;
      },
    };
  }

  private createTokenQuestion(): any {
    return {
      type: 'password',
      name: 'storyblokToken',
      message: 'Enter your Storyblok access token:',
      validate: (value: string) => value.length ? true : 'Please enter a valid token',
      async when(answers: any) {
        await exec(`open https://app.storyblok.com/#/me/spaces/${answers.space}/settings?tab=api`);
        return true;
      },
    };
  }

  async setup(destination: string, input?: ConfigFile): Promise<ConfigFile> {
    this.output(chalk.blue('ℹ') + ' Setting up project...');
    await ProjectConfig.load();
    const config = ProjectConfig.get();
    const data = await this.askSetup({...input, ...config});
    data.version = '1.0.0';

    await this.updateEnvFile(destination, data.storyblokToken);
    await this.updatePackageJson(destination, data.space);
    await this.configureCertificates(destination);

    credentials.set({ password: data.storyblokOAuthToken }, 'sabaccui.storyblok.com');
    delete data.storyblokToken;
    delete data.storyblokOAuthToken;

    ProjectConfig.apply(data);
    await ProjectConfig.save();

    this.output(chalk.green('✔') + ' Project setup successfully.');
    return data;
  }

  private async updateEnvFile(destination: string, token?: string): Promise<void> {
    if (token) {
      const envPath = path.join(destination, '.env');
      const env = await fs.readFile(envPath, 'utf8');
      const newEnv = env.replace(/NUXT_STORYBLOK_ACCESS_TOKEN=.*/, `NUXT_STORYBLOK_ACCESS_TOKEN=${token}`);
      await fs.writeFile(envPath, newEnv);
    }
  }

  private async updatePackageJson(destination: string, space?: string): Promise<void> {
    if (space) {
      const packageJsonPath = path.join(destination, 'package.json');
      const packageJson = await fs.readFile(packageJsonPath, 'utf8');
      const newPackageJson = packageJson.replace(/<space>/g, space);
      await fs.writeFile(packageJsonPath, newPackageJson);
    }
  }

  private async configureCertificates(destination: string): Promise<void> {
    const certSource = this.config.get('certificateSources.cert');
    const keySource = this.config.get('certificateSources.key');

    if (certSource && keySource) {
      const certDest = path.join(destination, 'localhost.crt');
      const keyDest = path.join(destination, 'localhost.key');

      await fs.ensureSymlink(certSource, certDest);
      await fs.ensureSymlink(keySource, keyDest);

      const packageJsonPath = path.join(destination, 'package.json');
      let packageJson = await fs.readFile(packageJsonPath, 'utf8');
      packageJson = packageJson.replace(/<localhost.crt>/g, 'localhost.crt');
      packageJson = packageJson.replace(/<localhost.key>/g, 'localhost.key');
      await fs.writeFile(packageJsonPath, packageJson);

      this.output(chalk.green('✔') + ' SSL certificates configured.');
    }
  }

  async init(name: string, key: string, destination: string, space: string): Promise<void> {
    const spinner = ora('Downloading template...').start();
    const projectDir = path.join(destination, name);
    await ProjectConfig.init(projectDir);


    try {
      const tempDir = await this.downloadAndExtractTemplate(key, spinner);
      const manifest = await this.readManifest(tempDir);

      await this.cloneSourceIfNeeded(manifest, projectDir, spinner);
      if (manifest.type === 'source' || manifest.type === undefined) {
        await this.copyTemplateFiles(tempDir, projectDir, manifest.templateFiles, spinner);
      } else {
        await this.copyAllFiles(manifest, tempDir, projectDir, spinner);
      }
      const config = await this.setupEnvironment(projectDir, name, space);
      await this.prepareStoryblokSpace(config.space || space, spinner);
      await this.installBloks(projectDir, manifest, config.space || space, spinner);
      await this.installTemplatePackages(projectDir, manifest.packages, spinner);
      await this.runMigrations(projectDir, manifest.migrations, spinner);
      await this.initGitRepository(projectDir, spinner);

      await this.cleanup(tempDir, spinner);
    } catch (error: any) {
      spinner.fail(error.message);
    }
  }

  private async downloadAndExtractTemplate(key: string, spinner: Ora): Promise<string> {
    const zipBuffer = await this.api.downloadTemplate(key);
    spinner.succeed('Template downloaded.');
    spinner.start('Extracting template...');

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'template-'));
    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(tempDir, true);

    spinner.succeed('Template extracted.');
    return tempDir;
  }

  private async readManifest(tempDir: string): Promise<Manifest> {
    const manifestPath = path.join(tempDir, 'manifest.json');
    return fs.readJSON(manifestPath);
  }

  private async cloneSourceIfNeeded(manifest: Manifest, projectDir: string, spinner: Ora): Promise<void> {
    if (manifest.source && (manifest.type === 'source' || manifest.type === undefined)) {
      spinner.start('Cloning source repository...');
      await this.cloneSource(manifest.source, projectDir);
      spinner.succeed('Source repository cloned.');
    }
  }

  private async setupEnvironment(projectDir: string, name: string, space: string): Promise<ConfigFile> {
    const envExamplePath = path.join(projectDir, '.env.example');
    const envPath = path.join(projectDir, '.env');
    if (fs.existsSync(envExamplePath) && !fs.existsSync(envPath)) {
      await fs.copy(envExamplePath, envPath);
    }
    return await this.setup(projectDir, { name, space, ...ProjectConfig.get() });
  }

  private async prepareStoryblokSpace(space: string, spinner: Ora): Promise<void> {
    spinner.start('Prepare Storyblok space...');
    const storyblok = new Storyblok(space);
    await storyblok.ensureTags();
    spinner.succeed('Storyblok space prepared.');
  }

  private async copyAllFiles(manifest: Manifest, sourceDir: string, targetDir: string, spinner: Ora): Promise<void> {
    spinner.start('Copying all template files...');
    try {
      const sourceFolder = path.join(sourceDir, manifest.baseDir.split('/').pop());
      await fs.copy(sourceFolder, targetDir);
    } catch (error: any) {
      console.log(error);
      throw new Error('Failed to copy all template files.');
    }
    spinner.succeed('All Template files copied.');
  }

  private async copyTemplateFiles(tempDir: string, projectDir: string, templateFiles: string[] | undefined, spinner: Ora): Promise<void> {
    spinner.start('Copying template files...');
    await this.copyFiles(tempDir, projectDir, templateFiles);
    spinner.succeed('Template files copied.');
  }

  private async installBloks(projectDir: string, manifest: Manifest, space: string, spinner: Ora): Promise<void> {
    if (manifest.usedComponents) {
      spinner.start('Installing Bloks...');
      const skipInstall = manifest.type === 'self-contained';
      const installedComponents = await Promise.all(
        manifest.usedComponents.map(componentKey =>
          this.blokService.add(projectDir, componentKey, space, true, skipInstall).then(() => componentKey)
        )
      );
      spinner.succeed(`${installedComponents.length} Bloks installed:`);
      installedComponents.forEach(component => this.output(`  + ${component}`));
    }
  }

  private async installTemplatePackages(projectDir: string, packages: Manifest['packages'] | undefined, spinner: Ora): Promise<void> {
    spinner.start('Installing packages...');
    if (packages) {
      await this.handlePackages(projectDir, packages);
    } else {
      await exec('bun install', { cwd: projectDir });
    }
    spinner.succeed('Packages installed.');
  }

  private async runMigrations(projectDir: string, migrations: string[] | undefined, spinner: Ora): Promise<void> {
    if (migrations) {
      spinner.start('Running migrations...');
      for (const migration of migrations) {
        const migrationPath = path.join(projectDir, migration);
        await exec(`node ${migrationPath}`, { cwd: projectDir });
      }
      spinner.succeed('Migrations completed.');
    }
  }

  private async initGitRepository(projectDir: string, spinner: Ora): Promise<void> {
    spinner.start('Initializing git repository...');
    await exec('git init', { cwd: projectDir });
    await exec('git add .', { cwd: projectDir });
    spinner.succeed('Git repository initialized.');
  }

  private async cleanup(tempDir: string, spinner: Ora): Promise<void> {
    spinner.start('Cleaning up...');
    await fs.remove(tempDir);
    spinner.stopAndPersist({text: 'Template installed successfully.', symbol: '🚀'});
  }

  private async cloneSource(source: string, targetDir: string): Promise<void> {
    try {
      const emitter = degit(source, {
        cache: false,
        force: true,
        verbose: true,
      });
      await emitter.clone(targetDir);
    } catch (error: any) {
      throw new Error(`Failed to clone source repository: ${error.message}`);
    }
  }
}

export default TemplateService;