const {Parser, DomHandler} = require('htmlparser2')
const ComponentStructure = require('./ComponentStructure')
const {makeExportString} = require('../lib/export')
const path = require('path')
const loaderUtils = require('loader-utils')

class Compiler {
  constructor() {
    this.callback = null
    this.parser = new Parser(this.getParserHandler(), this.getParserOptions())
    this.loaderContext = null
  }

  setCallback(callback) {
    this.callback = callback
    return this
  }

  compile(source) {
    if (typeof source === 'string') {
      this.parse(source.trim())
    } else {
      this.callback('Source is not a string')
    }
  }

  setLoaderContext(context) {
    this.loaderContext = context
    return this
  }

  finishParsing(domTree) {
    try {
      const structure = new ComponentStructure(this.loaderContext, domTree)
      const request = loaderUtils.stringifyRequest(this.loaderContext, path.resolve(__dirname, 'TemplateRenderer/TemplateRenderer.js'))

      const result = makeExportString([
        structure.getScriptContent(),
        `
        import TemplateRenderer from ${request}
        const content = ${structure.getRenderContentAsString()}
        
        export {
          TemplateRenderer,
          content
        }
        `
      ])

      this.callback(null, result)
    } catch (exception) {
      this.callback(exception)
    }
  }

  parse(source) {
    this.parser.write(source)
    this.parser.end()
  }

  getParserHandler() {
    return new DomHandler((error, domTree) => {
      if (error) {
        this.callback(error)
      } else {
        this.finishParsing(domTree)
      }
    });
  }

  getParserOptions() {
    return {
      recognizeSelfClosing: true
    }
  }
}

module.exports = () => new Compiler()
