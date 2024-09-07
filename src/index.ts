#!/usr/bin/env node
//@ts-nocheck

import chalk from 'chalk'
import figlet from 'figlet'
import inquirer from 'inquirer'
import { Command } from 'commander'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import updateNotifier from 'update-notifier'
import path from 'path'
import fs from 'fs'

import Service from './services/Service.js'
import TemplateService from './services/TemplateService.js'
import BlokService from './services/BlokService.js'

import { Config } from './config.js'
import { exec } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rawPkg = fs.readFileSync(path.join(__dirname, '../package.json'))
const pkg = JSON.parse(rawPkg.toString())
const program = new Command()

updateNotifier({ pkg })
  .notify({ isGlobal: true })

program.addHelpText('beforeAll', chalk.magentaBright(figlet.textSync('SabaccUI')))
  .configureHelp({
    sortSubcommands: true
  })
  .version(pkg.version)

program.command('login')
  .description('login to SabaccUI')
  .action(async () => {
    const content = await inquirer.prompt([
      {
        type: 'input',
        name: 'email',
        message: 'email address:',
        validate: function (value) {
          var pass = value.match(
            /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/
          )
          if (pass) {
            return true
          }
          return 'Please enter a valid email address'
        }
      },
      {
        type: 'password',
        name: 'password',
        message: 'Password:',
        validate: function (value) {
          if (value.length) {
            return true
          }
          return 'Please enter a valid password'
        }
      }
    ])

    if (await (new Service()).login(content)) {
      console.log(chalk.green('✓') + ' Logged in successfully! Session Token is stored in your .netrc file.')
    } else {
      console.error(chalk.red('✖') + ' An error occurred when login the user')
    }
  })

program.command('license')
  .description('Enter your license key')
  .action(async () => {
    const content = await inquirer.prompt([
      {
        type: 'input',
        name: 'license',
        message: 'License key:',
        validate: function (value) {
          if (value.length) {
            return true
          }
          return 'Please enter a valid license key'
        }
      }
    ])

    if (await (new Service()).license(content)) {
      console.log(chalk.green('✓') + ' License key stored successfully!')
    } else {
      console.error(chalk.red('✖') + ' An error occurred when storing the license key')
    }
  })

program.command('buy')
  .description('buy a license')
  .action(() => {
    exec('open https://www.sabaccui.com/pricing')
    console.log('Here is the link to buy a license: https://www.sabaccui.com')
  })

program.command('logout')
  .description('logout of SabaccUI')
  .action(async () => {
    await (new Service()).logout()
    console.log('Logged out')
  })

program.command('config')
  .description('get or set SabaccUI configuration options')
  .argument('[key]', 'Configuration key (use dot notation for nested keys)')
  .argument('[value]', 'Configuration value')
  .action(async (key, value) => {
    const config = new Config()

    if (!key) {
      // Display all configurations
      const all = config.getAll()
      console.log(JSON.stringify(all, null, 2))
    } else if (!value) {
      // Get a specific configuration value
      const configValue = config.get(key)
      console.log(configValue)
    } else {
      // Set a configuration value
      config.set(key, value)
      console.log(chalk.green('✓') + ` Configuration '${key}' set to '${value}'`)
    }
  })

program.command('init')
  .description('initialize a new SabaccUI based project with the given name')
  .argument('<name>', 'Name of the project')
  .argument('[template]', 'Template to use for the project', 'empty')
  .option('-p, --path <path>', 'Path of the project')
  .option('-s, --space <space>', 'The id of the Storyblok space to use')
  .action(async (name, template, options) => {
    await new TemplateService().init(name, template, options.path || process.cwd(), options.space)
  })

program.command('setup')
  .description('setup a SabaccUI based project in the given directory')
  .option('-p, --path <path>', 'Path of the project')
  .action(async (options) => {
    const name = path.basename(options.path || process.cwd())
    await new TemplateService().setup(options.path || process.cwd(), { name })
  })

program.command('templates')
  .description('list all available templates')
  .action(async () => {
    const result = await (new TemplateService()).list()
    if (result) {
      console.table(result)
    }
  })

program.command('bloks')
  .description('list all available bloks')
  .action(async (key) => {
    const result = await (new BlokService()).list()
    if (result) {
      console.table(result)
    }
  })

program.command('add')
  .argument('<blok>', 'Name of the blok to add')
  .description('add a new blok to the project')
  .option('-p, --path <path>', 'Path of the project to add the blok to')
  .option('-s, --space <space>', 'The id of the Storyblok space to use')
  .action((blok, options) => {
    new BlokService().add(options.path || process.cwd(), blok, options.space)
  })

program.parse(process.argv)
