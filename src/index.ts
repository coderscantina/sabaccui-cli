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

import { Service, ComponentService, TemplateService } from './services.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rawPkg = fs.readFileSync(path.join(__dirname, '../package.json'))
const pkg = JSON.parse(rawPkg.toString())
const program = new Command()

updateNotifier({ pkg })
  .notify({ isGlobal: true })

console.log(chalk.magentaBright(figlet.textSync('SabaccUI')))
console.log('Welcome to the SabaccUI CLI')
console.log()

program.version(pkg.version)

program.command('login')
  .description('Login to SabaccUI')
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
      console.error(chalk.red('X') + ' An error occurred when login the user')
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
      console.error(chalk.red('X') + ' An error occurred when storing the license key')
    }
  })

program.command('buy')
  .description('Buy a license')
  .action(() => {
    console.log('Here is the link to buy a license: https://www.sabaccui.com')
  })

program.command('logout')
  .description('Logout of SabaccUI')
  .action(async () => {
    await (new Service()).logout()
    console.log('Logged out')
  })

program.command('init')
  .description('Initialize a new SabaccUI based project with the given name')
  .argument('<name>', 'Name of the project')
  .argument('[template]', 'Template to use for the project', 'boilerplate')
  .option('-p, --path <path>', 'Path of the project')
  .action((name, template, options) => {
    console.log(name, template, options.path)

    new TemplateService().init(name, template, options.path || process.cwd())
  })

program.command('templates')
  .description('List all available templates')
  .action(async () => {
    const result = await (new TemplateService()).list()
    if (result) {
      console.table(result)
    }
  })

program.command('components')
  .description('List all available components')
  .action(async (key) => {
    const result = await (new ComponentService()).list()
    if (result) {
      console.table(result)
    }
  })

program.command('add')
  .argument('<component>', 'Name of the component to add')
  .description('Add a new component to the project')
  .option('-p, --path <path>', 'Path of the project to add the component to')
  .action((component, options) => {
    new ComponentService().add(options.path || process.cwd(), component)
  })

program.parse(process.argv)

if (program.rawArgs.length <= 1) {
  program.help()
}