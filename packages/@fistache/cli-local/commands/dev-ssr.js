const path = require('path')
const assetsFolder = path.resolve('.')
let publicPath

function readFile(fs, fileName) {
  if (publicPath) {
    try {
      const filePath = path.join(assetsFolder, publicPath, fileName)
      return fs.readFileSync(filePath, 'utf-8')
    } catch (e) {
      return null
    }
  }
}

module.exports = (program, projectManager) => {
  program
    .command('dev-ssr')
    .allowUnknownOption()
    .action(() => {
      projectManager.setMode('development')

      const webpack = require('webpack')
      const express = require('express')
      const provider = require('express-https-provider')()

      provider
        .modifyApp((app, state) => {
          const fs = require('fs')
          const mfs = require('memory-fs')
          const chalk = require('chalk')
          const favicon = require('serve-favicon')
          const { createRenderer } = require('@fistache/ssr')

          const clientConfig = projectManager.webpack.getConfig('client')
          const serverConfig = projectManager.webpack.getConfig('server')

          const clientCompiler = webpack(clientConfig)
          const serverCompiler = webpack(serverConfig)

          publicPath = clientConfig.output.publicPath

          let render
          let clientBundle
          let serverBundle
          let template = fs.readFileSync(
            path.resolve(__dirname, '../index.html'), 'utf-8'
          )
          // todo: watch index.html and call update() after changing

          const update = () => {
            if (clientBundle && serverBundle && template) {
              render = createRenderer(clientBundle, serverBundle, template)
            }
          }

          const clientDevMiddleware = require('webpack-dev-middleware')(clientCompiler, {
            noInfo: true,
            logLevel: 'silent',
            publicPath: clientConfig.output.publicPath
          })
          app.use(require('connect-history-api-fallback')())
          app.use(clientDevMiddleware);
          app.use(require('webpack-hot-middleware')(clientCompiler, {
            log: false
          }))

          clientCompiler.hooks.done.tap('fistache dev-ssr', stats => {
            if (!stats.hasErrors()) {
              const file = readFile(clientDevMiddleware.fileSystem, 'client.json')
              if (file) {
                try {
                  clientBundle = JSON.parse(file).client.js
                  update()
                } catch (e) {}
              }

              console.log(`App serving at: ${chalk.blue.bold(state.getServingLink())}`)
            }
          })

          const serverDevFs = new mfs()
          serverCompiler.outputFileSystem = serverDevFs
          serverCompiler.watch({}, (error, stats) => {
            if (error) {
              throw error
            }

            if (stats.hasErrors()) {
              console.error(stats.toString({
                colors: true
              }))
              return
            }

            const file = readFile(serverDevFs, 'server.json')
            if (file) {
              try {
                const bundleName = JSON.parse(file).server.js
                serverBundle = serverDevFs.readFileSync(path.join(assetsFolder, bundleName), 'utf-8')
                update()
              } catch (e) {}
            }
          })

          app.use(favicon(path.resolve('resources/images/logo/logo@32.png')))
          app.use('/dist', express.static(assetsFolder))

          app.get('*', async (request, response) => {
            response.setHeader("Content-Type", "text/html")

            if (render) {
              response.send(
                await render(request.originalUrl)
              )
            } else {
              response.send('Bundle is not compiled yet.')
            }
          })
        })
        .run()
        .catch(err => console.error(err))
    });
}
