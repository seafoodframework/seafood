import rs from 'crypto-random-string'
import hash from 'hash-sum'
import path from 'path'
import postcss from 'postcss'
// @ts-ignore
import prefixer from 'postcss-prefix-selector'
import { CompactRequestQuery } from './CompactRequestQuery'
import { CompilationFlag } from './CompilationFlag'
import { ScriptCompiler } from './Compiler/Script/ScriptCompiler'
import ScopeStyles from './Compiler/Style/ScopeStyles'
import { StyleCompiler } from './Compiler/Style/StyleCompiler'
import { TemplateCompiler } from './Compiler/Template/TemplateCompiler'
import { HmrPlugin } from './Hmr/HmrPlugin'
import { RequestGenerator } from './RequestGenerator'

export class SeafoodLoader {
    public static readonly REQUEST_COMPILATION_FLAG = 'compile'
    public static readonly REQUEST_SCOPE_ID = 'scopeId'
    public static readonly EXPORT_SCRIPT_CLASS = 'cpt'
    public static readonly EXPORT_STYLE_STRING = 'styles'
    public static readonly EXPORT_SCRIPT_INSTANCE = 'component'
    public static readonly EXPORT_TEMPLATE_BUILDER_CLASS = 'TemplateBuilder'
    public static readonly EXPORT_TEMPLATE_INSTANCE = 'template'
    public static readonly EXPORT_TEMPLATE_CONTENT = 'templateData'
    public static readonly EXPORT_HMR_CLASS = 'Hmr'
    public static readonly EXPORT_HMR_INSTANCE = 'hmr'
    public static readonly EXPORT_COMPILED_COMPONENT_CLASS = 'CompiledComponent'
    public static readonly EXPORT_COMPILED_COMPONENT_INSTANCE = 'compiledComponent'

    protected readonly loader: any
    protected readonly context: string
    protected readonly scopeId: string
    protected readonly resourcePath: string
    protected readonly query: CompactRequestQuery
    protected readonly source: string
    protected readonly options: any | null

    protected readonly requestHash: string
    protected readonly hmrPlugin: HmrPlugin

    constructor(loader: any, context: string, query: CompactRequestQuery, source: string, options: any | null) {
        const {resourcePath} = loader
        this.loader = loader
        this.context = context
        this.resourcePath = resourcePath
        this.query = query
        this.source = source
        this.requestHash = this.generateRequestHash()
        this.hmrPlugin = new HmrPlugin(this.requestHash)
        this.options = options
        this.scopeId = query.get(SeafoodLoader.REQUEST_SCOPE_ID)
            || (this.options && this.options.scopeId)
            || `_${rs(10)}`
    }

    public resolveRequest(): void {
        if (this.isItScopingRequest()) {
             this.resolveScopingRequest()
        } else if (this.isItCompilationRequest()) {
            this.resolveCompilationRequest()
        } else {
            this.exportCompiledComponentInstance()
        }
    }

    protected isItCompilationRequest(): boolean {
        return this.query.hasKey(SeafoodLoader.REQUEST_COMPILATION_FLAG)
    }

    protected isItScopingRequest(): boolean {
        return this.options && this.options.scopeId
    }

    protected generateRequestToMyself(url: string, query?: CompactRequestQuery): string {
        const {loaders} = this.loader
        return RequestGenerator.generate(this.loader, url, query, loaders.slice())
    }

    protected generateRequestHash() {
        const {resourceQuery} = this.loader
        const filePath = path
            .relative(this.context, this.resourcePath)
            .replace(/^(\.\.[\/\\])+/, '')
            .replace(/\\/g, '/') + resourceQuery

        return hash(filePath)
    }

    protected getHmrCode(): string {
        return this.hmrPlugin.generateCode()
    }

    protected makeCompilationRequest(flag: CompilationFlag) {
        const query = new CompactRequestQuery({
            [SeafoodLoader.REQUEST_COMPILATION_FLAG]: flag
        })

        return this.generateRequestToMyself(this.resourcePath, query)
    }

    private getScriptCompilationRequest() {
        return this.makeCompilationRequest(CompilationFlag.Script)
    }

    private getStyleCompilationRequest() {
        const query = new CompactRequestQuery({
            [SeafoodLoader.REQUEST_COMPILATION_FLAG]: CompilationFlag.Style,
            [SeafoodLoader.REQUEST_SCOPE_ID]: this.scopeId
        })

        return RequestGenerator.generate(this.loader, this.resourcePath, query, [
            'style-loader', 'css-loader', `seafood-loader?scopeId=${this.scopeId}`, 'stylus-loader', 'seafood-loader'
        ])
    }

    private getTemplateCompilationRequest() {
        const query = new CompactRequestQuery({
            [SeafoodLoader.REQUEST_COMPILATION_FLAG]: CompilationFlag.Template
        })

        return RequestGenerator.generate(this.loader, this.resourcePath, query, ['seafood-loader'])
    }

    private resolveScopingRequest() {
        const scopeId = this.options && this.options.scopeId
        this.loader.callback(null, postcss([ScopeStyles(scopeId)]).process(this.source).css)
    }

    private resolveCompilationRequest(): void {
        let compiler
        const compilationFlag = this.query.get(SeafoodLoader.REQUEST_COMPILATION_FLAG)

        switch (Number(compilationFlag)) {
            case (CompilationFlag.Script):
                compiler = new ScriptCompiler(this.loader, this.source)
                compiler.compileAsync()
                break
            case (CompilationFlag.Template):
                compiler = new TemplateCompiler(this.loader, this.source)
                compiler.compileAsync()
                break
            case (CompilationFlag.Style):
                compiler = new StyleCompiler(this.loader, this.source)
                compiler.compileAsync()
                break
            default:
                throw new Error(`Unknown compilation flag "${compilationFlag}"`)
        }
    }

    private exportCompiledComponentInstance(): void {
        const templateContentRequest = this.getTemplateCompilationRequest()

        this.loader.loadModule(
            JSON.parse(templateContentRequest),
            (templateError: any, templateContent: string) => {
                if (templateError) {
                    this.loader.callback(templateError)
                    return
                }

                const scriptRequest = this.getScriptCompilationRequest()
                const styleRequest = this.getStyleCompilationRequest()
                const templateRequest = RequestGenerator.generate(
                    this.loader,
                    path.resolve(__dirname, '../src/Compiler/Template/Renderer/Renderer.ts')
                )
                const hmrRequest = RequestGenerator.generate(
                    this.loader,
                    path.resolve(__dirname, '../src/Hmr/Hmr.ts')
                )

                this.hmrPlugin.setTemplateRequest(templateContentRequest)

                // todo: check if script loads parser
                this.loader.callback(null, `
                    import {default as ${SeafoodLoader.EXPORT_SCRIPT_CLASS}} from ${scriptRequest}
                    import {default as ${SeafoodLoader.EXPORT_TEMPLATE_BUILDER_CLASS}} from ${templateRequest}
                    import {default as ${SeafoodLoader.EXPORT_HMR_CLASS}} from ${hmrRequest}
                    import ${SeafoodLoader.EXPORT_STYLE_STRING} from ${styleRequest}
                    import {CompiledComponent} from '@seafood/app'

                    const ${SeafoodLoader.EXPORT_TEMPLATE_INSTANCE} =
                    new ${SeafoodLoader.EXPORT_TEMPLATE_BUILDER_CLASS}()
                    ${SeafoodLoader.EXPORT_TEMPLATE_INSTANCE}.setParsedData(${templateContent})
                    ${SeafoodLoader.EXPORT_TEMPLATE_INSTANCE}.setScopeId('${this.scopeId}')

                    const ${SeafoodLoader.EXPORT_SCRIPT_INSTANCE} = new ${SeafoodLoader.EXPORT_SCRIPT_CLASS}()
                    const ${SeafoodLoader.EXPORT_COMPILED_COMPONENT_INSTANCE} =
                    new CompiledComponent(
                        ${SeafoodLoader.EXPORT_SCRIPT_INSTANCE},
                        ${SeafoodLoader.EXPORT_TEMPLATE_INSTANCE}
                    )

                    ${this.getHmrCode()}

                    export const Component = ${SeafoodLoader.EXPORT_SCRIPT_CLASS}
                    export default ${SeafoodLoader.EXPORT_COMPILED_COMPONENT_INSTANCE}
                `)
            }
        )
    }
}
